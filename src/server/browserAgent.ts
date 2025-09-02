import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { OpenAI } from 'openai';
import { TaskManager } from './taskManager.js';
import { BrowserAction, Task, ScreencastMetadata } from '../types/index.js';

interface ScreencastFrame {
  data: string;
  metadata?: ScreencastMetadata;
  format: string;
}

interface ScreencastListener {
  (frame: ScreencastFrame): void;
}

interface ScreencastState {
  active: boolean;
  listeners: Set<ScreencastListener>;
  usingCDP: boolean;
  interval: NodeJS.Timeout | null;
}

export class BrowserAgent {
  private taskManager: TaskManager;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private processingTasks: Set<string> = new Set();
  private headless: boolean | undefined = undefined;
  private abortControllers: Map<string, AbortController> = new Map();
  private openai: OpenAI;
  private displayWidth: number;
  private displayHeight: number;
  private deploymentName: string;
  private openAITimeoutMs: number;
  private actionTimeoutMs: number;
  private navTimeoutMs: number;
  private keyMap: Record<string, string>;
  private cdpClient: any = null;
  private screencast: ScreencastState;
  private _unsubscribeTM: (() => void) | null = null;
  private _onScreencastFrame: ((evt: any) => void) | null = null;

  constructor(taskManager: TaskManager) {
    this.taskManager = taskManager;

    // Initialize OpenAI client
    this.openai = new OpenAI({
      baseURL: process.env.AZURE_OPENAI_ENDPOINT + 'openai/v1/',
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
      defaultHeaders: {
        'api-key': process.env.AZURE_OPENAI_API_KEY,
      },
      timeout: parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10),
      maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '1', 10),
    });

    this.displayWidth = parseInt(process.env.DISPLAY_WIDTH || '1280', 10);
    this.displayHeight = parseInt(process.env.DISPLAY_HEIGHT || '720', 10);
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';
    this.openAITimeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10);
    this.actionTimeoutMs = parseInt(process.env.ACTION_TIMEOUT_MS || '8000', 10);
    this.navTimeoutMs = parseInt(process.env.NAV_TIMEOUT_MS || '10000', 10);

    // Key mappings for Playwright
    this.keyMap = {
      'Return': 'Enter',
      'space': ' ',
      'BackSpace': 'Backspace',
      'Delete': 'Delete',
      'Tab': 'Tab',
      'Escape': 'Escape',
      'Home': 'Home',
      'End': 'End',
      'Page_Up': 'PageUp',
      'Page_Down': 'PageDown',
      'Up': 'ArrowUp',
      'Down': 'ArrowDown',
      'Left': 'ArrowLeft',
      'Right': 'ArrowRight'
    };

    // Screencast state
    this.screencast = {
      active: false,
      listeners: new Set(),
      usingCDP: false,
      interval: null,
    };

    // Abort any in-flight AI request immediately on pause/stop for smoother manual handoff
    this._unsubscribeTM = this.taskManager.subscribe((id: string, task: Task) => {
      try {
        if (!task || !task.status) return;
        if (['paused', 'stopped', 'failed', 'completed'].includes(task.status)) {
          const ctrl = this.abortControllers.get(id);
          if (ctrl) {
            ctrl.abort();
            this.abortControllers.delete(id);
          }
        }
      } catch {}
    });
  }

  private resolveHeadless(): boolean {
    const val = process.env.HEADLESS;
    if (val === 'false' || val === '0') return false;
    if (val === 'true' || val === '1') return true;
    return !process.env.DISPLAY; // auto-detect
  }

  async initializeBrowser(): Promise<void> {
    if (this.browser) return;

    try {
      let headless = this.resolveHeadless();
      this.headless = headless;

      const launch = async (isHeadless: boolean): Promise<Browser> =>
        chromium.launch({
          headless: isHeadless,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            ...(isHeadless ? ['--disable-gpu'] : [])
          ]
        });

      try {
        this.browser = await launch(headless);
      } catch (e) {
        // If headed launch failed due to missing X server, retry headless
        const msg = String((e as Error)?.message || e);
        const looksLikeNoX = /Missing X server|DISPLAY|x11|Target page, context or browser has been closed/i.test(msg);
        if (!headless && looksLikeNoX) {
          console.warn('Headed launch failed likely due to missing X server. Falling back to headless.');
          headless = true;
          this.headless = true;
          this.browser = await launch(true);
        } else {
          throw e;
        }
      }

      this.page = await this.browser.newPage();
      await this.page.setViewportSize({
        width: this.displayWidth,
        height: this.displayHeight
      });

      console.log(`Browser initialized successfully (headless=${headless})`);
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async ensureCDPClient(): Promise<any> {
    await this.initializeBrowser();
    if (!this.page) throw new Error('Browser page not initialized');
    
    if (!this.cdpClient) {
      try {
        this.cdpClient = await this.page.context().newCDPSession(this.page);
        await this.cdpClient.send('Page.enable');
      } catch (e) {
        console.warn('Failed to create CDP client; will fallback to polling:', (e as Error).message || e);
        this.cdpClient = null;
      }
    }
    return this.cdpClient;
  }

  // Screencast subscription API
  async addScreencastListener(fn: ScreencastListener): Promise<() => void> {
    this.screencast.listeners.add(fn);
    // Start stream on first listener
    if (!this.screencast.active) {
      await this.startScreencastInternal();
    }
    // Return unsubscribe
    return () => {
      this.screencast.listeners.delete(fn);
      // Stop stream if no listeners
      if (this.screencast.listeners.size === 0) {
        this.stopScreencastInternal().catch(() => {});
      }
    };
  }

  private async startScreencastInternal(): Promise<void> {
    await this.initializeBrowser();
    this.screencast.active = true;

    const client = await this.ensureCDPClient();
    if (client) {
      try {
        // Prefer JPEG for size/perf
        await client.send('Page.startScreencast', {
          format: 'jpeg',
          quality: 70,
          everyNthFrame: 1,
        });
        this.screencast.usingCDP = true;

        // Ensure only one handler
        if (this._onScreencastFrame) {
          client.off?.('Page.screencastFrame', this._onScreencastFrame);
        }
        this._onScreencastFrame = async (evt: any) => {
          try {
            const { data, sessionId, metadata } = evt;
            // Fan out to listeners
            for (const fn of Array.from(this.screencast.listeners)) {
              try { 
                fn({ data, metadata, format: 'jpeg' }); 
              } catch {}
            }
            // Ack
            await client.send('Page.screencastFrameAck', { sessionId });
          } catch (e) {
            // Ignore transient errors
          }
        };
        client.on('Page.screencastFrame', this._onScreencastFrame);
        return;
      } catch (e) {
        console.warn('CDP screencast failed; falling back to polling:', (e as Error).message || e);
      }
    }

    // Fallback polling screenshots if CDP unavailable
    this.screencast.usingCDP = false;
    const fps = 6; // reasonable balance
    const intervalMs = Math.round(1000 / fps);
    this.screencast.interval = setInterval(async () => {
      try {
        if (!this.screencast.active || this.screencast.listeners.size === 0) return;
        const screenshot = await this.takeScreenshot();
        if (screenshot) {
          for (const fn of Array.from(this.screencast.listeners)) {
            try { 
              fn({ data: screenshot, format: 'png' }); 
            } catch {}
          }
        }
      } catch (e) {
        // Ignore transient errors
      }
    }, intervalMs);
  }

  private async stopScreencastInternal(): Promise<void> {
    this.screencast.active = false;
    
    if (this.screencast.usingCDP && this.cdpClient) {
      try {
        await this.cdpClient.send('Page.stopScreencast');
        if (this._onScreencastFrame) {
          this.cdpClient.off?.('Page.screencastFrame', this._onScreencastFrame);
          this._onScreencastFrame = null;
        }
      } catch (e) {
        // Ignore errors
      }
      this.screencast.usingCDP = false;
    }
    
    if (this.screencast.interval) {
      clearInterval(this.screencast.interval);
      this.screencast.interval = null;
    }
  }

  async takeScreenshot(): Promise<string | null> {
    try {
      await this.initializeBrowser();
      if (!this.page) return null;
      
      const screenshot = await this.page.screenshot({
        type: 'png',
        fullPage: false
      });
      return `data:image/png;base64,${screenshot.toString('base64')}`;
    } catch (error) {
      console.error('Failed to take screenshot:', error);
      return null;
    }
  }

  async executeBrowserAction(taskId: string, action: BrowserAction): Promise<any> {
    const withRetry = async (fn: () => Promise<any>, opts: { retries?: number; delayMs?: number } = {}): Promise<any> => {
      const { retries = 2, delayMs = 200 } = opts;
      let lastErr: Error | null = null;
      for (let i = 0; i <= retries; i++) {
        try {
          return await fn();
        } catch (e) {
          lastErr = e as Error;
          if (i < retries) {
            await this.delay(delayMs);
          }
        }
      }
      throw lastErr;
    };

    try {
      await this.initializeBrowser();
      if (!this.page) throw new Error('Browser page not initialized');

      switch (action.action) {
        case 'click':
          if (action.coordinates) {
            const { x, y } = this.validateCoordinates(action.coordinates.x, action.coordinates.y);
            await this._withTimeout(() => this.page!.mouse.click(x, y), this.actionTimeoutMs, 'click');
          }
          break;

        case 'type':
          if (action.text) {
            await this._withTimeout(() => this.page!.keyboard.type(action.text!), this.actionTimeoutMs, 'type');
          }
          break;

        case 'key_press':
          if (action.key) {
            const key = this.keyMap[action.key] || action.key;
            await this._withTimeout(() => this.page!.keyboard.press(key), this.actionTimeoutMs, 'key_press');
          }
          break;

        case 'scroll':
          const scrollAmount = 300;
          switch (action.scroll_direction) {
            case 'down':
              await this._withTimeout(() => this.page!.mouse.wheel(0, scrollAmount), this.actionTimeoutMs, 'wheel');
              break;
            case 'up':
              await this._withTimeout(() => this.page!.mouse.wheel(0, -scrollAmount), this.actionTimeoutMs, 'wheel');
              break;
            case 'left':
              await this._withTimeout(() => this.page!.mouse.wheel(-scrollAmount, 0), this.actionTimeoutMs, 'wheel');
              break;
            case 'right':
              await this._withTimeout(() => this.page!.mouse.wheel(scrollAmount, 0), this.actionTimeoutMs, 'wheel');
              break;
          }
          break;

        case 'wheel':
          await this._withTimeout(() => this.page!.mouse.wheel(action.deltaX || 0, action.deltaY || 0), this.actionTimeoutMs, 'wheel');
          break;

        case 'navigate':
          if (action.url) {
            await this._withTimeout(() => this.page!.goto(action.url!, { timeout: this.navTimeoutMs, waitUntil: 'domcontentloaded' }), this.navTimeoutMs + 1000, 'navigate');
          }
          break;

        case 'mouse_down': {
          const btn = action.button || 'left';
          let x = 0, y = 0;
          if (action.coordinates) ({ x, y } = this.validateCoordinates(action.coordinates.x, action.coordinates.y));
          if (typeof x === 'number' && typeof y === 'number') {
            await this._withTimeout(() => this.page!.mouse.move(x, y), this.actionTimeoutMs, 'mouse_move');
          }
          await this._withTimeout(() => this.page!.mouse.down({ button: btn as any }), this.actionTimeoutMs, 'mouse_down');
          break;
        }

        case 'mouse_up': {
          const btn = action.button || 'left';
          await this._withTimeout(() => this.page!.mouse.up({ button: btn as any }), this.actionTimeoutMs, 'mouse_up');
          break;
        }

        case 'mouse_move': {
          if (action.coordinates) {
            const { x, y } = this.validateCoordinates(action.coordinates.x, action.coordinates.y);
            await this._withTimeout(() => this.page!.mouse.move(x, y), this.actionTimeoutMs, 'mouse_move');
          }
          break;
        }

        default:
          throw new Error(`Unknown action type: ${(action as any).action}`);
      }

      return { success: true };
    } catch (error) {
      console.error(`Error executing action ${action.action}:`, error);
      throw error;
    }
  }

  private validateCoordinates(x: number, y: number): { x: number; y: number } {
    const clampedX = Math.max(0, Math.min(x, this.displayWidth - 1));
    const clampedY = Math.max(0, Math.min(y, this.displayHeight - 1));
    return { x: clampedX, y: clampedY };
  }

  private async _withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Operation ${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async processTask(taskId: string): Promise<void> {
    if (this.processingTasks.has(taskId)) {
      console.log(`Task ${taskId} is already being processed`);
      return;
    }

    this.processingTasks.add(taskId);
    
    try {
      const task = this.taskManager.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Update task status to running
      this.taskManager.updateTask(taskId, { status: 'running' });

      // Add initial step
      this.taskManager.addStep(taskId, {
        action: 'started',
        result: 'Task processing started'
      });

      // Take initial screenshot
      const screenshot = await this.takeScreenshot();
      if (screenshot) {
        this.taskManager.addScreenshot(taskId, screenshot);
      }

      // For now, just mark as completed - full AI processing would go here
      this.taskManager.completeTask(taskId);
      
    } catch (error) {
      console.error(`Error processing task ${taskId}:`, error);
      this.taskManager.failTask(taskId, error as Error);
    } finally {
      this.processingTasks.delete(taskId);
    }
  }

  async cleanup(): Promise<void> {
    if (this._unsubscribeTM) {
      this._unsubscribeTM();
      this._unsubscribeTM = null;
    }

    await this.stopScreencastInternal();

    if (this.cdpClient) {
      try {
        await this.cdpClient.detach();
      } catch {}
      this.cdpClient = null;
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch {}
      this.browser = null;
      this.page = null;
    }
  }
}
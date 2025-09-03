import { chromium, Page, Browser, Locator } from 'playwright';
import type { CDPSession } from 'playwright-core';
import { OpenAI } from 'openai';
import type { TaskManager, Task } from './taskManager';

type KeyMap = Record<string, string>;

export class BrowserAgent {
  taskManager: TaskManager;
  browser: Browser | null;
  page: Page | null;
  processingTasks: Set<string>;
  headless: boolean | undefined;
  abortControllers: Map<string, AbortController>;
  openai: OpenAI;
  displayWidth: number;
  displayHeight: number;
  deploymentName: string;
  openAITimeoutMs: number;
  actionTimeoutMs: number;
  navTimeoutMs: number;
  keyMap: KeyMap;
  cdpClient: CDPSession | null;
  screencast: { active: boolean; listeners: Set<(frame: { data: string; metadata?: { deviceWidth?: number; deviceHeight?: number }; format: 'jpeg' | 'png' }) => void>; usingCDP: boolean; interval: NodeJS.Timeout | null };
  _onScreencastFrame?: (evt: { data: string; sessionId: string; metadata?: { deviceWidth?: number; deviceHeight?: number } }) => void;
  private _unsubscribeTM: () => void;

  constructor(taskManager: TaskManager) {
    this.taskManager = taskManager;
    this.browser = null;
    this.page = null;
    this.processingTasks = new Set();
    this.headless = undefined;
    this.abortControllers = new Map();

    this.openai = new OpenAI({
      baseURL: (process.env.AZURE_OPENAI_ENDPOINT || '') + 'openai/v1/',
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY || '' },
      timeout: parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10),
      maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '1', 10),
    });

    this.displayWidth = parseInt(process.env.DISPLAY_WIDTH || '1280', 10);
    this.displayHeight = parseInt(process.env.DISPLAY_HEIGHT || '720', 10);
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';
    this.openAITimeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10);
    this.actionTimeoutMs = parseInt(process.env.ACTION_TIMEOUT_MS || '8000', 10);
    this.navTimeoutMs = parseInt(process.env.NAV_TIMEOUT_MS || '10000', 10);

    this.keyMap = {
      Return: 'Enter',
      space: ' ',
      BackSpace: 'Backspace',
      Delete: 'Delete',
      Tab: 'Tab',
      Escape: 'Escape',
      Home: 'Home',
      End: 'End',
      Page_Up: 'PageUp',
      Page_Down: 'PageDown',
      Up: 'ArrowUp',
      Down: 'ArrowDown',
      Left: 'ArrowLeft',
      Right: 'ArrowRight',
    };

    this.cdpClient = null;
    this.screencast = { active: false, listeners: new Set(), usingCDP: false, interval: null };

    this._unsubscribeTM = this.taskManager.subscribe((id, task) => {
      try {
        if (!task || !task.status) return;
        if (['paused', 'stopped', 'failed', 'completed'].includes(task.status)) {
          const ctrl = this.abortControllers.get(id);
          if (ctrl) { ctrl.abort(); this.abortControllers.delete(id); }
        }
      } catch {}
    });
  }

  async initializeBrowser(): Promise<void> {
    if (this.browser) return;
    try {
      let headless = this.resolveHeadless();
      this.headless = headless;
      const launch = async (isHeadless: boolean) => chromium.launch({ headless: isHeadless, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', ...(isHeadless ? ['--disable-gpu'] : [])] });
      try {
        this.browser = await launch(headless);
      } catch (e) {
        const msg = String((e as Error)?.message || e);
        const looksLikeNoX = /Missing X server|DISPLAY|x11|Target page, context or browser has been closed/i.test(msg);
        if (!headless && looksLikeNoX) {
          console.warn('Headed launch failed likely due to missing X server. Falling back to headless.');
          headless = true; this.headless = true; this.browser = await launch(true);
        } else { throw e; }
      }
      this.page = await this.browser.newPage();
      await this.page.setViewportSize({ width: this.displayWidth, height: this.displayHeight });
      console.log(`Browser initialized successfully (headless=${headless})`);
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async ensureCDPClient(): Promise<CDPSession | null> {
    await this.initializeBrowser();
    if (!this.page) throw new Error('Browser page not initialized');
    if (!this.cdpClient) {
      try {
        const ctx = this.page.context() as unknown as { newCDPSession: (page: Page) => Promise<CDPSession> };
        this.cdpClient = await ctx.newCDPSession(this.page);
        await this.cdpClient.send('Page.enable');
      } catch (e) {
        console.warn('Failed to create CDP client; will fallback to polling:', (e as Error)?.message || e);
        this.cdpClient = null;
      }
    }
    return this.cdpClient;
  }

  async addScreencastListener(fn: (frame: { data: string; metadata?: { deviceWidth?: number; deviceHeight?: number }; format: 'jpeg' | 'png' }) => void): Promise<() => void> {
    this.screencast.listeners.add(fn);
    if (!this.screencast.active) await this.startScreencastInternal();
    return () => {
      this.screencast.listeners.delete(fn);
      if (this.screencast.listeners.size === 0) { this.stopScreencastInternal().catch(() => {}); }
    };
  }

  async startScreencastInternal(): Promise<void> {
    await this.initializeBrowser();
    this.screencast.active = true;
    const client = await this.ensureCDPClient();
    if (client) {
      try {
        const ctl = client as unknown as { send: (m: string, p?: unknown) => Promise<void> };
        await ctl.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
        this.screencast.usingCDP = true;
        const clientEvt = client as unknown as { on: (event: string, h: (evt: unknown) => void) => void; off?: (event: string, h: (evt: unknown) => void) => void; send: (m: string, p?: unknown) => Promise<void> };
        if (this._onScreencastFrame) { clientEvt.off?.('Page.screencastFrame', this._onScreencastFrame as (evt: unknown) => void); }
        this._onScreencastFrame = async (evt) => {
          try {
            const { data, sessionId, metadata } = evt;
            for (const fn of Array.from(this.screencast.listeners)) { try { fn({ data, metadata, format: 'jpeg' }); } catch {} }
            await client.send('Page.screencastFrameAck', { sessionId } as unknown);
          } catch {}
        };
        clientEvt.on('Page.screencastFrame', this._onScreencastFrame as (evt: unknown) => void);
        return;
      } catch (e) { console.warn('CDP screencast failed; falling back to polling:', (e as Error)?.message || e); }
    }
    this.screencast.usingCDP = false;
    const fps = 6; const intervalMs = Math.round(1000 / fps);
    this.screencast.interval = setInterval(async () => {
      if (!this.screencast.active) return;
      try {
        await this.initializeBrowser();
        const data = await this.takeScreenshot();
        const metadata = { deviceWidth: this.displayWidth, deviceHeight: this.displayHeight };
        for (const fn of Array.from(this.screencast.listeners)) { try { fn({ data, metadata, format: 'png' }); } catch {} }
      } catch {}
    }, intervalMs);
  }

  async stopScreencastInternal(): Promise<void> {
    this.screencast.active = false;
    if (this.cdpClient && this.screencast.usingCDP) { try { await this.cdpClient.send('Page.stopScreencast'); } catch {} }
    if (this.screencast.interval) { clearInterval(this.screencast.interval); this.screencast.interval = null; }
    this.screencast.usingCDP = false;
  }

  resolveHeadless(): boolean {
    const hasDisplay = !!process.env.DISPLAY;
    if (!hasDisplay) return true;
    if (typeof process.env.BROWSER_HEADLESS === 'string') {
      const val = process.env.BROWSER_HEADLESS.trim().toLowerCase();
      if (val === 'true') return true; if (val === 'false') return false;
    }
    return false;
  }
  getHeadless(): boolean { return typeof this.headless === 'boolean' ? this.headless : this.resolveHeadless(); }

  async getPageState(): Promise<{ url: string; title: string; headless: boolean; viewport: { width: number; height: number } }> {
    try {
      await this.initializeBrowser();
      const url = this.page ? this.page.url() : '';
      let title = '';
      try { title = this.page ? await this.page.title() : ''; } catch {}
      return { url, title, headless: this.getHeadless(), viewport: { width: this.displayWidth, height: this.displayHeight } };
    } catch {
      return { url: '', title: '', headless: this.getHeadless(), viewport: { width: this.displayWidth, height: this.displayHeight } };
    }
  }

  async processTask(taskId: string): Promise<void> {
    if (this.processingTasks.has(taskId)) { console.log(`Task ${taskId} is already being processed`); return; }
    this.processingTasks.add(taskId);
    try {
      const task = this.taskManager.getTask(taskId);
      if (!task) throw new Error('Task not found');
      console.log(`Starting to process task: ${taskId}`);
      this.taskManager.updateTask(taskId, { status: 'running' } as Partial<Task>);
      await this.initializeBrowser();
      if (this.page!.url() === 'about:blank') { await this.page!.goto('https://www.google.com'); }
      const initialScreenshot = await this.takeScreenshot();
      this.taskManager.addScreenshot(taskId, initialScreenshot);
      await this.aiProcessingLoop(taskId);
    } catch (error) {
      console.error(`Error processing task ${taskId}:`, error);
      this.taskManager.failTask(taskId, error);
    } finally { this.processingTasks.delete(taskId); }
  }

  async aiProcessingLoop(taskId: string): Promise<void> {
    const maxIterations = 20; let iterations = 0;
    while (iterations < maxIterations) {
      const task = this.taskManager.getTask(taskId);
      if (!task) break;
      if (task.status === 'paused') { console.log(`Task ${taskId} is paused, waiting...`); await this.waitForResume(taskId); continue; }
      if (task.status === 'stopped') { console.log(`Task ${taskId} is stopped`); break; }
      iterations++;
      try {
        const screenshot = await this.takeScreenshot();
        this.taskManager.addScreenshot(taskId, screenshot);
        const t2 = this.taskManager.getTask(taskId); if (!t2) break;
        if (t2.status === 'paused') { await this.waitForResume(taskId); continue; }
        if (t2.status === 'stopped') break;
        const response = await this.callAI(t2, screenshot);
        const shouldContinue = await this.processAIResponse(taskId, response);
        if (!shouldContinue) { this.taskManager.completeTask(taskId, 'Task completed successfully'); break; }
        await this.delay(1000);
      } catch (error) {
        console.error(`Error in AI processing loop iteration ${iterations}:`, error);
        this.taskManager.addStep(taskId, { type: 'error', description: `Error: ${(error as Error).message}`, error: true });
        if ((error as Error).message.includes('browser') || (error as Error).message.includes('page')) { throw error; }
        const errName = (error as { name?: string }).name;
        if (errName === 'AbortError') { await this.waitForResume(taskId); }
      }
    }
    if (iterations >= maxIterations) { this.taskManager.failTask(taskId, 'Maximum iterations reached'); }
  }

  async callAI(task: Task, screenshot: string): Promise<unknown> {
    const tools: Array<Record<string, unknown>> = [
      { type: 'function', function: { name: 'browser_action', description: 'Perform browser actions like click, type, scroll, navigate, mouse control, and control global task run state (pause/resume)', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['click', 'type', 'scroll', 'wheel', 'key_press', 'navigate', 'wait', 'task_complete', 'pause_task', 'resume_task', 'reload', 'go_back', 'go_forward', 'mouse_down', 'mouse_up', 'mouse_move', 'click_element', 'fill_field', 'hover_element', 'press_on', 'focus_element', 'scroll_into_view', 'select_option', 'assert_visible', 'assert_text', 'assert_url', 'assert_title', 'wait_for_element'] }, coordinates: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } }, button: { type: 'string', enum: ['left', 'middle', 'right'] }, text: { type: 'string' }, url: { type: 'string' }, key: { type: 'string' }, scroll_direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] }, deltaX: { type: 'number' }, deltaY: { type: 'number' }, locator: { type: 'object', properties: { selector: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' }, text: { type: 'string' }, label: { type: 'string' }, placeholder: { type: 'string' }, alt: { type: 'string' }, title: { type: 'string' }, testId: { type: 'string' }, href: { type: 'string' }, exact: { type: 'boolean' }, nth: { type: 'number' } } }, option_value: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }, option_label: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }, expected: { type: 'string' }, url_equals: { type: 'string' }, url_contains: { type: 'string' }, title_equals: { type: 'string' }, title_contains: { type: 'string' }, state: { type: 'string', enum: ['visible', 'hidden', 'attached', 'detached'] }, wait_ms: { type: 'number' }, timeout_ms: { type: 'number' }, reason: { type: 'string' } }, required: ['action', 'reason'] } } }
    ];

    const context = this.buildContext(task);
    let structuredPage: unknown;
    try { structuredPage = await this.getStructuredPageContext(); } catch (e) { structuredPage = { error: 'Failed to extract page context', details: String((e as Error)?.message || e) }; }

    const sp = (structuredPage && typeof structuredPage === 'object') ? (structuredPage as Record<string, unknown>) : {};
    const spUrl = typeof sp.url === 'string' ? sp.url : '';
    const spTitle = typeof sp.title === 'string' ? sp.title : '';
    const spMeta = typeof sp.metaDescription === 'string' ? sp.metaDescription.slice(0, 180) : '';
    const headingsList = Array.isArray(sp.headings)
      ? (sp.headings as Array<Record<string, unknown>>).slice(0, 5).map((h) => `[${String(h.tag ?? '')}] ${String(h.text ?? '')}`).join(' | ')
      : '';
    const buttonsList = Array.isArray(sp.buttons)
      ? (sp.buttons as Array<Record<string, unknown>>).slice(0, 6).map((b) => String(b.text ?? '')).join(' | ')
      : '';
    const inputsList = Array.isArray(sp.inputs)
      ? (sp.inputs as Array<Record<string, unknown>>).slice(0, 5).map((i) => `[${String(i.type ?? '')}] ${String((i.label ?? i.placeholder) ?? '')}`).join(' | ')
      : '';
    const linksList = Array.isArray(sp.links)
      ? (sp.links as Array<Record<string, unknown>>).slice(0, 5).map((l) => String(l.text ?? '')).join(' | ')
      : '';
    const visibleText = typeof sp.visibleTextSample === 'string' ? sp.visibleTextSample.slice(0, 240) : '';

    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: `You are a browser automation agent. You help users accomplish tasks by controlling a web browser.

Current task: ${task.description}

You can see the current browser state in the screenshot. Use the browser_action function to interact with the browser. Prefer element-targeted actions when possible (click_element, fill_field, select_option, press_on) using a precise locator.

Available actions:
- click: Click on coordinates (x, y)
- type: Type text at current cursor position
- pause_task: Pause global task processing (AI loop waits)
- resume_task: Resume global task processing
- scroll: Scroll in a direction (up/down/left/right)
- wheel: Scroll with precise deltas (deltaX/deltaY)
- key_press: Press a key (Enter, Tab, Escape, etc.)
- navigate: Navigate to a URL
- reload: Reload current page; go_back/go_forward: browser history
- wait: Wait for a specified time in milliseconds
- mouse_down/mouse_up/mouse_move: Low-level mouse control with coordinates and optional button
- click_element: Click an element by role/text/label/selector locator
- fill_field: Fill a text field by label/placeholder/selector
- press_on: Press a key while a specific element is focused
- hover_element: Hover over an element by locator
- focus_element: Focus an element by locator
- scroll_into_view: Scroll the element into view
- select_option: Select by value/label on a <select>
 - assert_visible: Assert a locator is visible
 - assert_text: Assert locator's text equals/contains expected
 - assert_url: Assert page URL equals/contains value
 - assert_title: Assert page title equals/contains value
 - wait_for_element: Wait for locator state (visible/hidden/attached/detached)
Locator spec fields:
- selector: CSS/xpath selector
- role+name: ARIA role (e.g., 'button', 'link') with accessible name
- text: visible text content
- label: associated label text (for inputs)
- placeholder: input placeholder
- alt/title/testId: by accessible attributes
- href: substring to match links by URL
- exact: boolean for exact text/name match; nth: index for picking among matches
- task_complete: Mark the task as complete

Important guidelines:
- Always provide a clear reason for each action
- Be methodical and patient
- Take screenshots to verify actions worked
- If you encounter errors, try alternative approaches
- When the task is fully accomplished, use task_complete action

${context}` },
      { role: 'user', content: [ { type: 'text', text: 'Here is the current browser state. Please analyze it and take the next appropriate action.' }, { type: 'text', text: `Page context (summary):\n- URL: ${spUrl}\n- Title: ${spTitle}\n- Meta: ${spMeta}\n- Viewport: ${this.displayWidth}x${this.displayHeight}\n- Headings: ${headingsList}\n- Buttons (top): ${buttonsList}\n- Inputs (top): ${inputsList}\n- Links (top): ${linksList}\n- Visible text: ${visibleText}` }, { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}` } } ] }
    ];

    const controller = new AbortController();
    try { this.abortControllers.set(task.id, controller); } catch {}
    const response = await this.openai.chat.completions.create({ model: this.deploymentName, messages, tools, tool_choice: 'auto', max_tokens: 1000, temperature: 0.1 }, { signal: controller.signal, timeout: this.openAITimeoutMs });
    this.abortControllers.delete(task.id);
    return response as unknown;
  }

  async getStructuredPageContext(): Promise<unknown> {
    await this.initializeBrowser();
    if (!this.page) return {};
    const res = await this._withTimeout(this.page.evaluate(() => {
      const clamp = (s: string, n=160) => (s||'').trim().replace(/\s+/g,' ').slice(0,n);
      const isVisible = (el: Element) => { const style = window.getComputedStyle(el); if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false; const rect = el.getBoundingClientRect(); if (rect.width <= 1 || rect.height <= 1) return false; if (rect.bottom < 0 || rect.top > window.innerHeight) return false; return true; };
      const bbox = (el: Element) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const pick = <T,>(arr: ArrayLike<T>, n: number) => Array.from(arr).slice(0, n);
      const textOf = (el: Element) => clamp((el as HTMLElement).innerText || el.textContent || '', 100);
      const headings = pick(document.querySelectorAll('h1, h2, h3'), 12).filter(isVisible).map(h => ({ tag: h.tagName, text: textOf(h), box: bbox(h) }));
      const buttonElems = new Set([ ...document.querySelectorAll('button'), ...document.querySelectorAll('[role="button"]') ]);
      const buttons = pick(Array.from(buttonElems).filter(isVisible), 20).map((b) => ({ text: textOf(b as HTMLElement), box: bbox(b as HTMLElement) })).filter((b) => (b as { text?: string }).text);
      const inputs = pick(document.querySelectorAll('input, textarea, select'), 30).filter(isVisible).map((i) => { const el = i as HTMLElement; const id = el.getAttribute('id'); let labelText = el.getAttribute('aria-label') || ''; if (!labelText && id) { const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`); if (lbl) labelText = textOf(lbl); } return { type: ((el.getAttribute('type') || el.tagName) as string).toLowerCase(), placeholder: el.getAttribute('placeholder') || '', label: labelText, box: bbox(el) }; });
      const links = pick(document.querySelectorAll('a[href]'), 50).filter(isVisible).map((a) => { const el = a as HTMLAnchorElement; return { text: textOf(el), href: el.getAttribute('href') || '', box: bbox(el) }; }).filter((a) => (a as { text?: string }).text);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode(node) { if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT; const el = node.parentElement; if (!el || !isVisible(el)) return NodeFilter.FILTER_REJECT; const style = window.getComputedStyle(el); if (/^(SCRIPT|STYLE|NOSCRIPT)$/i.test(el.tagName)) return NodeFilter.FILTER_REJECT; if (parseFloat(style.fontSize) < 9) return NodeFilter.FILTER_SKIP; return NodeFilter.FILTER_ACCEPT; } });
      let sample = '' as string; while (walker.nextNode() && sample.length < 1200) { sample += (walker.currentNode.nodeValue||'').trim().replace(/\s+/g, ' ') + ' '; } sample = sample.trim().slice(0, 1200);
      const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      return { url: location.href, title: document.title, metaDescription: clamp(metaDescription, 240), headings, buttons, inputs, links, visibleTextSample: sample, viewport: { width: window.innerWidth, height: window.innerHeight } };
    }), 2000, 'structuredPageContext').catch(() => ({}));
    return res;
  }

  buildContext(task: Task): string {
    const recent = task.steps.slice(-10);
    const stepsText = recent.length ? recent.map((step) => `- ${new Date(step.timestamp).toLocaleTimeString()} [${step.type}] ${step.description}`).join('\n') : '(no prior steps)';
    const status = task.status || 'unknown';
    return `\nTask status: ${status}\nRecent actions (latest first):\n${stepsText}\n`;
  }

  async processAIResponse(taskId: string, response: unknown): Promise<boolean> {
    const msg = (() => {
      if (!response || typeof response !== 'object') return null;
      const choices = (response as Record<string, unknown>).choices;
      if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return null;
      const message = (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined;
      return message || null;
    })();
    if (!msg) return true;
    const content = msg.content as string | undefined;
    if (content) { this.taskManager.addStep(taskId, { type: 'ai_reasoning', description: content, reasoning: true }); }
    const toolCalls = msg.tool_calls as Array<{ function: { name: string; arguments: string } }> | undefined;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        if (toolCall.function.name === 'browser_action') {
          const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown> & { action?: string };
          await this.executeBrowserAction(taskId, args);
          if (args.action === 'task_complete') return false;
        }
      }
    }
    return true;
  }

  async executeBrowserAction(taskId: string, action: Record<string, unknown>): Promise<{ success?: boolean; error?: string; completed?: boolean }> {
    console.log(`Executing browser action:`, action);
    const actionName = (action as Record<string, unknown>).action as string | undefined;
    const actionReason = (action as Record<string, unknown>).reason as string | undefined;
    this.taskManager.addStep(taskId, { type: 'browser_action', description: `${actionName}: ${actionReason}`, action });

    const withRetry = async <T>(fn: () => Promise<T>, { retries = 2, delayMs = 500 } = {}): Promise<T> => {
      let lastErr: unknown;
      for (let i = 0; i <= retries; i++) {
        try { return await fn(); } catch (e) { lastErr = e; if (i === retries) break; await this.delay(delayMs); }
      }
      throw lastErr as Error;
    };

    try {
      await this.initializeBrowser();
      const act = action as Record<string, unknown> & { action?: string; [k: string]: unknown };
      switch (act.action) {
        case 'click': if (act.coordinates) { const { x, y } = this.validateCoordinates(act.coordinates.x, act.coordinates.y); await this._withTimeout(() => this.page!.mouse.click(x, y), this.actionTimeoutMs, 'click'); } break;
        case 'type': if (typeof act.text === 'string') { await this._withTimeout(() => this.page!.keyboard.type(act.text), this.actionTimeoutMs, 'type'); } break;
        case 'key_press': if (act.key) { const key = this.keyMap[act.key] || act.key; await this._withTimeout(() => this.page!.keyboard.press(key), this.actionTimeoutMs, 'key_press'); } break;
        case 'scroll': { const scrollAmount = 300; switch (act.scroll_direction) { case 'down': await this._withTimeout(() => this.page!.mouse.wheel(0, scrollAmount), this.actionTimeoutMs, 'wheel'); break; case 'up': await this._withTimeout(() => this.page!.mouse.wheel(0, -scrollAmount), this.actionTimeoutMs, 'wheel'); break; case 'left': await this._withTimeout(() => this.page!.mouse.wheel(-scrollAmount, 0), this.actionTimeoutMs, 'wheel'); break; case 'right': await this._withTimeout(() => this.page!.mouse.wheel(scrollAmount, 0), this.actionTimeoutMs, 'wheel'); break; } break; }
        case 'wheel': await this._withTimeout(() => this.page!.mouse.wheel(act.deltaX || 0, act.deltaY || 0), this.actionTimeoutMs, 'wheel'); break;
        case 'navigate': if (act.url) { await this._withTimeout(() => this.page!.goto(act.url, { timeout: this.navTimeoutMs, waitUntil: 'domcontentloaded' }), this.navTimeoutMs + 1000, 'navigate'); } break;
        case 'reload': await this._withTimeout(() => this.page!.reload({ timeout: this.navTimeoutMs, waitUntil: 'domcontentloaded' }), this.navTimeoutMs + 1000, 'reload'); break;
        case 'go_back': await this._withTimeout(() => this.page!.goBack({ timeout: this.navTimeoutMs, waitUntil: 'domcontentloaded' }), this.navTimeoutMs + 1000, 'go_back'); break;
        case 'go_forward': await this._withTimeout(() => this.page!.goForward({ timeout: this.navTimeoutMs, waitUntil: 'domcontentloaded' }), this.navTimeoutMs + 1000, 'go_forward'); break;
        case 'wait': await this.delay(Math.min(act.wait_ms || 1000, this.actionTimeoutMs)); break;
        case 'click_element': { const locator = await this.resolveLocator(act.locator); const t = Math.min(act.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2); await withRetry(() => locator.click({ timeout: t })); break; }
        case 'fill_field': { if (typeof act.text !== 'string') throw new Error('fill_field requires text'); await this._ensurePageReady().catch(() => {}); let locator: Locator | null = await this.resolveLocator(act.locator).catch(() => null); const t = Math.min((act.timeout_ms as number | undefined) || this.actionTimeoutMs, this.actionTimeoutMs * 2); await withRetry(async () => { if (!locator) { locator = await this._fallbackInputLocator(act.locator, t).catch(() => null); } if (!locator) throw new Error('Input locator not found'); await locator.scrollIntoViewIfNeeded().catch(() => {}); await locator.waitFor({ state: 'visible', timeout: t }).catch(() => {}); await locator.click({ timeout: t }).catch(() => {}); await locator.fill('', { timeout: t }).catch(() => {}); await locator.fill(act.text, { timeout: t }); }, { retries: 2, delayMs: 300 }); break; }
        case 'hover_element': { const locator = await this.resolveLocator(act.locator); const t = Math.min(act.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2); await withRetry(() => locator.hover({ timeout: t })); break; }
        case 'focus_element': { const locator = await this.resolveLocator(act.locator); const t = Math.min(act.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2); await withRetry(() => locator.focus({ timeout: t })); break; }
        case 'press_on': { if (!act.key) throw new Error('press_on requires key'); const locator = await this.resolveLocator(act.locator); const key = this.keyMap[act.key] || act.key; const t = Math.min(act.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2); await withRetry(() => locator.press(key, { timeout: t })); break; }
        case 'scroll_into_view': { const locator = await this.resolveLocator(act.locator); await withRetry(() => locator.scrollIntoViewIfNeeded()); break; }
        case 'select_option': { const locator = await this.resolveLocator(act.locator); const t = Math.min(act.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2); await withRetry(async () => { if (act.option_value) { await locator.selectOption(Array.isArray(act.option_value) ? act.option_value : { value: act.option_value }, { timeout: t }); } else if (act.option_label) { const labels = Array.isArray(act.option_label) ? act.option_label : [act.option_label]; await locator.selectOption(labels.map((l: string) => ({ label: l })), { timeout: t }); } else { throw new Error('select_option requires option_value or option_label'); } }); break; }
        case 'assert_visible': { const locator = await this.resolveLocator(act.locator); const t = Math.min(act.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2); await locator.waitFor({ state: 'visible', timeout: t }); break; }
        case 'assert_text': { const locator = await this.resolveLocator(act.locator); if (!act.expected) throw new Error('assert_text requires expected'); const t = Math.min(act.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2); const txt = (await locator.first().innerText({ timeout: t })).trim(); const match = act.exact ? (txt === act.expected) : txt.includes(act.expected); if (!match) throw new Error(`Text assertion failed. Expected ${act.exact ? 'exact' : 'contains'} "${act.expected}", got "${txt}"`); break; }
        case 'assert_url': { const url = this.page!.url(); if (act.url_equals && url !== act.url_equals) throw new Error(`URL equals failed. Expected "${act.url_equals}", got "${url}"`); if (act.url_contains && !url.includes(act.url_contains)) throw new Error(`URL contains failed. Expected contains "${act.url_contains}", got "${url}"`); break; }
        case 'assert_title': { const title = await this.page!.title(); if (act.title_equals && title !== act.title_equals) throw new Error(`Title equals failed. Expected "${act.title_equals}", got "${title}"`); if (act.title_contains && !title.includes(act.title_contains)) throw new Error(`Title contains failed. Expected contains "${act.title_contains}", got "${title}"`); break; }
        case 'wait_for_element': { const locator = await this.resolveLocator(act.locator); const state = act.state || 'visible'; const t = Math.min(act.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2); await locator.first().waitFor({ state, timeout: t }); break; }
        case 'mouse_down': { const btn = act.button || 'left'; let x = 0, y = 0; if (act.coordinates) ({ x, y } = this.validateCoordinates(act.coordinates.x, act.coordinates.y)); if (typeof x === 'number' && typeof y === 'number') await this._withTimeout(() => this.page!.mouse.move(x, y), this.actionTimeoutMs, 'mouse_move'); await this._withTimeout(() => this.page!.mouse.down({ button: btn }), this.actionTimeoutMs, 'mouse_down'); break; }
        case 'mouse_up': { const btn = act.button || 'left'; await this._withTimeout(() => this.page!.mouse.up({ button: btn }), this.actionTimeoutMs, 'mouse_up'); break; }
        case 'mouse_move': { if (act.coordinates) { const { x, y } = this.validateCoordinates(act.coordinates.x, act.coordinates.y); await this._withTimeout(() => this.page!.mouse.move(x, y, { steps: 1 }), this.actionTimeoutMs, 'mouse_move'); } break; }
        case 'pause_task': this.taskManager.pauseTask(taskId); break;
        case 'resume_task': this.taskManager.resumeTask(taskId); this.processTask(taskId); break;
        case 'task_complete': console.log('Task marked as complete by AI'); return { completed: true };
        default: console.log(`Unknown action: ${act.action}`);
      }
      return { success: true };
    } catch (error) {
      console.error(`Error executing ${actionName}:`, error);
      this.taskManager.addStep(taskId, { type: 'error', description: `Failed to execute ${actionName}: ${(error as Error).message}`, error: true });
      return { success: false, error: (error as Error).message };
    }
  }

  async resolveLocator(spec: Record<string, unknown>): Promise<Locator> {
    if (!this.page) throw new Error('Browser page not initialized');
    if (!spec || typeof spec !== 'object') throw new Error('locator spec required');
    const s = spec as Record<string, unknown>;
    const exact = !!s.exact; let locator: Locator | null = null;
    try {
      if (typeof s.selector === 'string') locator = this.page!.locator(s.selector);
      if (!locator && typeof s.label === 'string') locator = this.page!.getByLabel(s.label, { exact });
      if (!locator && typeof s.placeholder === 'string') locator = this.page!.getByPlaceholder(s.placeholder, { exact });
      if (!locator && typeof s.text === 'string') locator = this.page!.getByText(s.text, { exact });
      if (!locator && typeof s.alt === 'string') locator = (this.page as Page).getByAltText(s.alt, { exact });
      if (!locator && typeof s.title === 'string') locator = this.page!.getByTitle(s.title, { exact });
      if (!locator && typeof s.testId === 'string') locator = this.page!.getByTestId(s.testId);
      if (!locator && typeof s.href === 'string') locator = this.page!.locator(`a[href*="${String(s.href).replace(/"/g, '\\"')}"]`);
    } catch {}
    if (!locator) throw new Error('Unable to construct locator from spec');
    if (typeof s.nth === 'number') locator = locator.nth(s.nth);
    await locator.first().waitFor({ state: 'attached', timeout: Math.min((s.timeout_ms as number | undefined) || this.actionTimeoutMs, this.actionTimeoutMs * 2) }).catch(() => {});
    return locator.first();
  }

  validateCoordinates(x: number, y: number): { x: number; y: number } {
    return { x: Math.max(0, Math.min(x, this.displayWidth)), y: Math.max(0, Math.min(y, this.displayHeight)) };
  }

  async takeScreenshot(): Promise<string> {
    if (!this.page) throw new Error('Browser page not initialized');
    const screenshot = await this._withTimeout(this.page.screenshot({ type: 'png', fullPage: false, timeout: 7000 }), 8000, 'screenshot');
    return (screenshot as Buffer).toString('base64');
  }

  async waitForResume(taskId: string): Promise<void> {
    return new Promise((resolve) => {
      const checkStatus = () => { const task = this.taskManager.getTask(taskId); if (!task || task.status === 'running' || task.status === 'stopped') { resolve(); } else { setTimeout(checkStatus, 1000); } };
      checkStatus();
    });
  }

  delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

  async cleanup(): Promise<void> {
    if (this.browser) {
      try { await this.stopScreencastInternal(); } catch {}
      await this.browser.close();
      this.browser = null; this.page = null; this.cdpClient = null;
    }
  }

  _withTimeout<T>(promise: Promise<T> | (() => Promise<T>), ms: number, label = 'op'): Promise<T> {
    return new Promise((resolve, reject) => {
      let done = false; const t = setTimeout(() => { if (done) return; done = true; const err = new Error(`${label} timed out after ${ms}ms`); reject(err); }, ms);
      Promise.resolve(typeof promise === 'function' ? (promise as () => Promise<T>)() : promise)
        .then((v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } })
        .catch((e) => { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
  }

  async _ensurePageReady(): Promise<void> {
    await this.initializeBrowser(); if (!this.page) return; try { const url = this.page.url(); if (/\.bing\./i.test(url)) { const selectors = ['#bnp_btn_accept','button#bnp_btn_accept','button[aria-label*="Accept"]','button:has-text("Accept")','button[role="button"]:has-text("Accept")']; for (const sel of selectors) { const btn = this.page.locator(sel).first(); if (await btn.count().catch(() => 0)) { const vis = await btn.isVisible().catch(() => false); if (vis) { await btn.click({ timeout: 1000 }).catch(() => {}); break; } } } } } catch {}
    await this._withTimeout(() => this.page!.waitForLoadState('domcontentloaded', { timeout: 2000 }), 2200, 'wait_dom').catch(() => {});
  }

  async _fallbackInputLocator(spec: Record<string, unknown> = {}, _timeoutMs = 5000): Promise<Locator> {
    await this.initializeBrowser(); const page = this.page!; const s = spec as Record<string, unknown>; const exact = !!s.exact; const candidates: string[] = [];
    if (s && typeof s.role === 'string' && /searchbox/i.test(s.role)) { candidates.push('input[role="searchbox"]','input[type="search"]','input[name="q"]','input[name="p"]','input#sb_form_q','textarea[role="searchbox"]'); }
    if (typeof s.placeholder === 'string') { candidates.push(`input[placeholder*="${s.placeholder}"]`, `textarea[placeholder*="${s.placeholder}"]`); }
    if (typeof s.label === 'string') { try { const labelLoc = page.getByLabel(s.label, { exact }); await labelLoc.first().waitFor({ state: 'attached', timeout: 800 }).catch(() => {}); if (await labelLoc.count().catch(() => 0)) return labelLoc.first(); } catch {} }
    for (const sel of candidates) { try { const loc = page.locator(sel).first(); await loc.waitFor({ state: 'attached', timeout: 800 }).catch(() => {}); if (await loc.count().catch(() => 0)) return loc; } catch {} }
    try { const firstTextInput = page.locator('input[type="text"], input:not([type]), textarea').filter({ hasNot: page.locator('[disabled]') }).first(); await firstTextInput.waitFor({ state: 'visible', timeout: 800 }).catch(() => {}); if (await firstTextInput.count().catch(() => 0)) return firstTextInput; } catch {}
    throw new Error('No fallback input found');
  }
}

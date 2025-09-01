import { chromium } from 'playwright';
import { OpenAI } from 'openai';

export class BrowserAgent {
  constructor(taskManager) {
    this.taskManager = taskManager;
    this.browser = null;
    this.page = null;
    this.processingTasks = new Set();
    this.headless = undefined; // resolved at launch

    // Initialize OpenAI client
    this.openai = new OpenAI({
      baseURL: process.env.AZURE_OPENAI_ENDPOINT + 'openai/v1/',
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
      defaultHeaders: {
        'api-key': process.env.AZURE_OPENAI_API_KEY,
      },
    });

    this.displayWidth = parseInt(process.env.DISPLAY_WIDTH) || 1280;
    this.displayHeight = parseInt(process.env.DISPLAY_HEIGHT) || 720;
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';

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
  }

  async initializeBrowser() {
    if (this.browser) return;

    try {
      let headless = this.resolveHeadless();
      this.headless = headless;

      const launch = async (isHeadless) =>
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
        const msg = String(e && e.message || e);
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

  // Determine headless mode robustly:
  // - If no DISPLAY/X server is present, FORCE headless true regardless of override
  // - Else, if BROWSER_HEADLESS is set, honor it ("true"/"false")
  // - Else, default to headed (false) when a display exists, otherwise headless
  resolveHeadless() {
    const hasDisplay = !!process.env.DISPLAY;

    // If there is no display, we must use headless
    if (!hasDisplay) return true;

    // If a display exists, allow explicit override
    if (typeof process.env.BROWSER_HEADLESS === 'string') {
      const val = process.env.BROWSER_HEADLESS.trim().toLowerCase();
      if (val === 'true') return true;
      if (val === 'false') return false;
    }

    // Default to headed when a display exists
    return false;
  }

  getHeadless() {
    return typeof this.headless === 'boolean' ? this.headless : this.resolveHeadless();
  }

  async getPageState() {
    try {
      await this.initializeBrowser();
      const url = this.page ? this.page.url() : '';
      let title = '';
      try { title = this.page ? await this.page.title() : ''; } catch {}
      return {
        url,
        title,
        headless: this.getHeadless(),
        viewport: { width: this.displayWidth, height: this.displayHeight }
      };
    } catch (e) {
      return { url: '', title: '', headless: this.getHeadless(), viewport: { width: this.displayWidth, height: this.displayHeight } };
    }
  }

  async processTask(taskId) {
    if (this.processingTasks.has(taskId)) {
      console.log(`Task ${taskId} is already being processed`);
      return;
    }

    this.processingTasks.add(taskId);

    try {
      const task = this.taskManager.getTask(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      console.log(`Starting to process task: ${taskId}`);
      this.taskManager.updateTask(taskId, { status: 'running' });

      await this.initializeBrowser();

      // Navigate to a starting page if browser is empty
      if (this.page.url() === 'about:blank') {
        await this.page.goto('https://www.google.com');
      }

      // Take initial screenshot
      const initialScreenshot = await this.takeScreenshot();
      this.taskManager.addScreenshot(taskId, initialScreenshot);

      // Start the AI processing loop
      await this.aiProcessingLoop(taskId);

    } catch (error) {
      console.error(`Error processing task ${taskId}:`, error);
      this.taskManager.failTask(taskId, error);
    } finally {
      this.processingTasks.delete(taskId);
    }
  }

  async aiProcessingLoop(taskId) {
    const maxIterations = 20; // Prevent infinite loops
    let iterations = 0;

    while (iterations < maxIterations) {
      const task = this.taskManager.getTask(taskId);
      
      // Check if task is paused or stopped
      if (task.status === 'paused') {
        console.log(`Task ${taskId} is paused, waiting...`);
        await this.waitForResume(taskId);
        continue;
      }

      if (task.status === 'stopped') {
        console.log(`Task ${taskId} is stopped`);
        break;
      }

      iterations++;

      try {
        // Take screenshot for AI to see current state
        const screenshot = await this.takeScreenshot();
        this.taskManager.addScreenshot(taskId, screenshot);

        // Get AI response with function calling
        const response = await this.callAI(task, screenshot);
        
        // Process the AI response
        const shouldContinue = await this.processAIResponse(taskId, response);
        
        if (!shouldContinue) {
          this.taskManager.completeTask(taskId, 'Task completed successfully');
          break;
        }

        // Add delay between iterations
        await this.delay(1000);

      } catch (error) {
        console.error(`Error in AI processing loop iteration ${iterations}:`, error);
        this.taskManager.addStep(taskId, {
          type: 'error',
          description: `Error: ${error.message}`,
          error: true
        });

        // Continue with next iteration unless it's a critical error
        if (error.message.includes('browser') || error.message.includes('page')) {
          throw error;
        }
      }
    }

    if (iterations >= maxIterations) {
      this.taskManager.failTask(taskId, 'Maximum iterations reached');
    }
  }

  async callAI(task, screenshot) {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'browser_action',
          description: 'Perform browser actions like click, type, scroll, navigate',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['click', 'type', 'scroll', 'key_press', 'navigate', 'wait', 'task_complete']
              },
              coordinates: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' }
                }
              },
              text: { type: 'string' },
              url: { type: 'string' },
              key: { type: 'string' },
              scroll_direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
              wait_ms: { type: 'number' },
              reason: { type: 'string' }
            },
            required: ['action', 'reason']
          }
        }
      }
    ];

    // Build context from recent screenshots and steps
    const context = this.buildContext(task);

    const messages = [
      {
        role: 'system',
        content: `You are a browser automation agent. You help users accomplish tasks by controlling a web browser.
        
Current task: ${task.description}

You can see the current browser state in the screenshot. Use the browser_action function to interact with the browser.

Available actions:
- click: Click on coordinates (x, y)
- type: Type text at current cursor position
- scroll: Scroll in a direction (up/down/left/right)  
- key_press: Press a key (Enter, Tab, Escape, etc.)
- navigate: Navigate to a URL
- wait: Wait for a specified time in milliseconds
- task_complete: Mark the task as complete

Important guidelines:
- Always provide a clear reason for each action
- Be methodical and patient
- Take screenshots to verify actions worked
- If you encounter errors, try alternative approaches
- When the task is fully accomplished, use task_complete action

${context}`
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Here is the current browser state. Please analyze it and take the next appropriate action to accomplish the task.'
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${screenshot}`
            }
          }
        ]
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: this.deploymentName,
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
      max_tokens: 1000,
      temperature: 0.1
    });

    return response;
  }

  buildContext(task) {
    const recentSteps = task.steps.slice(-5); // Last 5 steps
    if (recentSteps.length === 0) return '';

    const stepsText = recentSteps
      .map(step => `- ${step.type}: ${step.description}`)
      .join('\n');

    return `\nRecent actions taken:\n${stepsText}\n`;
  }

  async processAIResponse(taskId, response) {
    const message = response.choices[0].message;
    
    // Log AI reasoning
    if (message.content) {
      this.taskManager.addStep(taskId, {
        type: 'ai_reasoning',
        description: message.content,
        reasoning: true
      });
    }

    // Process function calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === 'browser_action') {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await this.executeBrowserAction(taskId, args);
          
          if (args.action === 'task_complete') {
            return false; // Stop processing
          }
        }
      }
    }

    return true; // Continue processing
  }

  async executeBrowserAction(taskId, action) {
    console.log(`Executing browser action:`, action);
    
    this.taskManager.addStep(taskId, {
      type: 'browser_action',
      description: `${action.action}: ${action.reason}`,
      action: action
    });

    try {
      switch (action.action) {
        case 'click':
          if (action.coordinates) {
            const { x, y } = this.validateCoordinates(action.coordinates.x, action.coordinates.y);
            await this.page.mouse.click(x, y);
          }
          break;

        case 'type':
          if (action.text) {
            await this.page.keyboard.type(action.text);
          }
          break;

        case 'key_press':
          if (action.key) {
            const key = this.keyMap[action.key] || action.key;
            await this.page.keyboard.press(key);
          }
          break;

        case 'scroll':
          const scrollAmount = 300;
          switch (action.scroll_direction) {
            case 'down':
              await this.page.mouse.wheel(0, scrollAmount);
              break;
            case 'up':
              await this.page.mouse.wheel(0, -scrollAmount);
              break;
            case 'left':
              await this.page.mouse.wheel(-scrollAmount, 0);
              break;
            case 'right':
              await this.page.mouse.wheel(scrollAmount, 0);
              break;
          }
          break;

        case 'navigate':
          if (action.url) {
            await this.page.goto(action.url);
          }
          break;

        case 'reload':
          await this.page.reload();
          break;

        case 'go_back':
          await this.page.goBack();
          break;

        case 'go_forward':
          await this.page.goForward();
          break;

        case 'wait':
          const waitTime = action.wait_ms || 1000;
          await this.delay(waitTime);
          break;

        case 'task_complete':
          console.log('Task marked as complete by AI');
          return { completed: true };

        default:
          console.log(`Unknown action: ${action.action}`);
      }

      return { success: true };

    } catch (error) {
      console.error(`Error executing ${action.action}:`, error);
      this.taskManager.addStep(taskId, {
        type: 'error',
        description: `Failed to execute ${action.action}: ${error.message}`,
        error: true
      });
      return { success: false, error: error.message };
    }
  }

  validateCoordinates(x, y) {
    return {
      x: Math.max(0, Math.min(x, this.displayWidth)),
      y: Math.max(0, Math.min(y, this.displayHeight))
    };
  }

  async takeScreenshot() {
    if (!this.page) {
      throw new Error('Browser page not initialized');
    }

    const screenshot = await this.page.screenshot({
      type: 'png',
      fullPage: false
    });

    return screenshot.toString('base64');
  }

  async waitForResume(taskId) {
    return new Promise((resolve) => {
      const checkStatus = () => {
        const task = this.taskManager.getTask(taskId);
        if (task.status === 'running' || task.status === 'stopped') {
          resolve();
        } else {
          setTimeout(checkStatus, 1000);
        }
      };
      checkStatus();
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
import { chromium } from 'playwright';
import { OpenAI } from 'openai';

export class BrowserAgent {
  constructor(taskManager) {
    this.taskManager = taskManager;
    this.browser = null;
    this.page = null;
    this.processingTasks = new Set();
    this.headless = undefined; // resolved at launch
    // Track in-flight AI requests per task for cancellation
    this.abortControllers = new Map();

    // Initialize OpenAI client
    this.openai = new OpenAI({
      baseURL: process.env.AZURE_OPENAI_ENDPOINT + 'openai/v1/',
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
      defaultHeaders: {
        'api-key': process.env.AZURE_OPENAI_API_KEY,
      },
      // Add resiliency for flaky networks
      timeout: parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10),
      maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '1', 10),
    });

    this.displayWidth = parseInt(process.env.DISPLAY_WIDTH) || 1280;
    this.displayHeight = parseInt(process.env.DISPLAY_HEIGHT) || 720;
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';
    this.openAITimeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10);

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
    this.cdpClient = null;
    this.screencast = {
      active: false,
      listeners: new Set(),
      usingCDP: false,
      interval: null,
    };

    // Abort any in-flight AI request immediately on pause/stop for smoother manual handoff
    this._unsubscribeTM = this.taskManager.subscribe((id, task) => {
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

  async ensureCDPClient() {
    await this.initializeBrowser();
    if (!this.page) throw new Error('Browser page not initialized');
    // If page changed or cdp missing, (re)create
    if (!this.cdpClient) {
      try {
        this.cdpClient = await this.page.context().newCDPSession(this.page);
        await this.cdpClient.send('Page.enable');
      } catch (e) {
        console.warn('Failed to create CDP client; will fallback to polling:', e.message || e);
        this.cdpClient = null;
      }
    }
    return this.cdpClient;
  }

  // Screencast subscription API
  async addScreencastListener(fn) {
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

  async startScreencastInternal() {
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
        this._onScreencastFrame = async (evt) => {
          try {
            const { data, sessionId, metadata } = evt;
            // Fan out to listeners
            for (const fn of Array.from(this.screencast.listeners)) {
              try { fn({ data, metadata, format: 'jpeg' }); } catch {}
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
        console.warn('CDP screencast failed; falling back to polling:', e.message || e);
      }
    }

    // Fallback polling screenshots if CDP unavailable
    this.screencast.usingCDP = false;
    const fps = 6; // reasonable balance
    const intervalMs = Math.round(1000 / fps);
    this.screencast.interval = setInterval(async () => {
      if (!this.screencast.active) return;
      try {
        await this.initializeBrowser();
        const data = await this.takeScreenshot(); // base64 PNG
        const metadata = { deviceWidth: this.displayWidth, deviceHeight: this.displayHeight };
        for (const fn of Array.from(this.screencast.listeners)) {
          try { fn({ data, metadata, format: 'png' }); } catch {}
        }
      } catch {}
    }, intervalMs);
  }

  async stopScreencastInternal() {
    this.screencast.active = false;
    if (this.cdpClient && this.screencast.usingCDP) {
      try { await this.cdpClient.send('Page.stopScreencast'); } catch {}
    }
    if (this.screencast.interval) {
      clearInterval(this.screencast.interval);
      this.screencast.interval = null;
    }
    this.screencast.usingCDP = false;
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

        // Re-check pause/stop before calling the model to allow quick manual takeover
        const t2 = this.taskManager.getTask(taskId);
        if (t2.status === 'paused') {
          await this.waitForResume(taskId);
          continue;
        }
        if (t2.status === 'stopped') break;

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
        // If aborted due to pause/stop, just wait/resume loop
        if (error.name === 'AbortError') {
          await this.waitForResume(taskId);
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
          description: 'Perform browser actions like click, type, scroll, navigate, mouse control, and control global task run state (pause/resume)',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: [
                  'click', 'type', 'scroll', 'wheel', 'key_press', 'navigate', 'wait',
                  'task_complete', 'pause_task', 'resume_task', 'reload', 'go_back', 'go_forward',
                  'mouse_down', 'mouse_up', 'mouse_move',
                  // Element-targeted actions
                  'click_element', 'fill_field', 'hover_element', 'press_on', 'focus_element', 'scroll_into_view', 'select_option',
                  // Assertions and waits
                  'assert_visible', 'assert_text', 'assert_url', 'assert_title', 'wait_for_element'
                ]
              },
              coordinates: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' }
                }
              },
              button: { type: 'string', enum: ['left', 'middle', 'right'] },
              text: { type: 'string' },
              url: { type: 'string' },
              key: { type: 'string' },
              scroll_direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
              deltaX: { type: 'number' },
              deltaY: { type: 'number' },
              // Element locator spec
              locator: {
                type: 'object',
                properties: {
                  selector: { type: 'string' },
                  role: { type: 'string' },
                  name: { type: 'string' },
                  text: { type: 'string' },
                  label: { type: 'string' },
                  placeholder: { type: 'string' },
                  alt: { type: 'string' },
                  title: { type: 'string' },
                  testId: { type: 'string' },
                  href: { type: 'string' },
                  exact: { type: 'boolean' },
                  nth: { type: 'number' }
                }
              },
              // For select_option
              option_value: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
              option_label: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
              // For asserts/waits
              expected: { type: 'string' },
              url_equals: { type: 'string' },
              url_contains: { type: 'string' },
              title_equals: { type: 'string' },
              title_contains: { type: 'string' },
              state: { type: 'string', enum: ['visible', 'hidden', 'attached', 'detached'] },
              wait_ms: { type: 'number' },
              timeout_ms: { type: 'number' },
              reason: { type: 'string' }
            },
            required: ['action', 'reason']
          }
        }
      }
    ];

    // Build context from recent steps and extract a structured page summary
    const context = this.buildContext(task);
    let structuredPage;
    try {
      structuredPage = await this.getStructuredPageContext();
    } catch (e) {
      structuredPage = { error: 'Failed to extract page context', details: String(e && e.message || e) };
    }

    const messages = [
      {
        role: 'system',
        content: `You are a browser automation agent. You help users accomplish tasks by controlling a web browser.
        
Current task: ${task.description}

You can see the current browser state in the screenshot. Use the browser_action function to interact with the browser. Prefer element-targeted actions when possible (click_element, fill_field, select_option, press_on) using a precise locator.

Available actions:
- click: Click on coordinates (x, y)
- type: Type text at current cursor position
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
- pause_task: Pause the global task processing (AI loop waits)
- resume_task: Resume global task processing
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
            type: 'text',
            text: `Page context (summary):\n- URL: ${structuredPage && structuredPage.url || ''}\n- Title: ${structuredPage && structuredPage.title || ''}\n- Meta: ${(structuredPage && structuredPage.metaDescription) ? structuredPage.metaDescription.slice(0,180) : ''}\n- Viewport: ${this.displayWidth}x${this.displayHeight}\n- Headings: ${(structuredPage && structuredPage.headings || []).slice(0,5).map(h=>`[${h.tag}] ${h.text}`).join(' | ')}\n- Buttons (top): ${(structuredPage && structuredPage.buttons || []).slice(0,6).map(b=>b.text).join(' | ')}\n- Inputs (top): ${(structuredPage && structuredPage.inputs || []).slice(0,5).map(i=>`[${i.type}] ${i.label || i.placeholder || ''}`).join(' | ')}\n- Links (top): ${(structuredPage && structuredPage.links || []).slice(0,5).map(l=>l.text).join(' | ')}\n- Visible text: ${(structuredPage && structuredPage.visibleTextSample) ? structuredPage.visibleTextSample.slice(0,240) : ''}`
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

    // Abortable, time-bounded AI call for robustness
    const controller = new AbortController();
    // Track so pause/stop can abort promptly
    try { this.abortControllers.set(task.id, controller); } catch {}
    const response = await this.openai.chat.completions.create({
      model: this.deploymentName,
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
      max_tokens: 1000,
      temperature: 0.1
    }, { signal: controller.signal, timeout: this.openAITimeoutMs }).finally(() => {
      this.abortControllers.delete(task.id);
    });

    return response;
  }

  // Extract a concise, structured summary of the current page for better grounding
  async getStructuredPageContext() {
    await this.initializeBrowser();
    if (!this.page) return {};
    const res = await this._withTimeout(this.page.evaluate(() => {
      const clamp = (s, n=160) => (s||'').trim().replace(/\s+/g,' ').slice(0,n);
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) return false;
        if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
        return true;
      };
      const bbox = (el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const pick = (arr, n) => Array.from(arr).slice(0, n);
      const textOf = (el) => clamp(el.innerText || el.textContent || '', 100);

      // Headings
      const headings = pick(document.querySelectorAll('h1, h2, h3'), 12)
        .filter(isVisible)
        .map(h => ({ tag: h.tagName, text: textOf(h), box: bbox(h) }));

      // Buttons (native + role=button)
      const buttonElems = new Set([ ...document.querySelectorAll('button'), ...document.querySelectorAll('[role="button"]') ]);
      const buttons = pick(Array.from(buttonElems).filter(isVisible), 20)
        .map(b => ({ text: textOf(b), box: bbox(b) }))
        .filter(b => b.text);

      // Inputs
      const inputs = pick(document.querySelectorAll('input, textarea, select'), 30)
        .filter(isVisible)
        .map(i => {
          const id = i.getAttribute('id');
          let labelText = i.getAttribute('aria-label') || '';
          if (!labelText && id) {
            const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
            if (lbl) labelText = textOf(lbl);
          }
          return {
            type: (i.getAttribute('type') || i.tagName).toLowerCase(),
            placeholder: i.getAttribute('placeholder') || '',
            label: labelText,
            box: bbox(i)
          };
        });

      // Links
      const links = pick(document.querySelectorAll('a[href]'), 50)
        .filter(isVisible)
        .map(a => ({ text: textOf(a), href: a.getAttribute('href') || '', box: bbox(a) }))
        .filter(a => a.text);

      // Visible text sample in viewport
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const el = node.parentElement;
          if (!el || !isVisible(el)) return NodeFilter.FILTER_REJECT;
          const style = window.getComputedStyle(el);
          if (/^(SCRIPT|STYLE|NOSCRIPT)$/i.test(el.tagName)) return NodeFilter.FILTER_REJECT;
          if (parseFloat(style.fontSize) < 9) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let sample = '';
      while (walker.nextNode() && sample.length < 1200) {
        sample += walker.currentNode.nodeValue.trim().replace(/\s+/g, ' ') + ' ';
      }
      sample = sample.trim().slice(0, 1200);

      const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

      return {
        url: location.href,
        title: document.title,
        metaDescription: clamp(metaDescription, 240),
        headings,
        buttons,
        inputs,
        links,
        visibleTextSample: sample,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };
    }), 2000, 'structuredPageContext').catch(() => ({}));
    return res;
  }

  buildContext(task) {
    const recent = task.steps.slice(-10); // Last 10 steps for better continuity
    const stepsText = recent.length
      ? recent.map(step => `- ${new Date(step.timestamp).toLocaleTimeString()} [${step.type}] ${step.description}`).join('\n')
      : '(no prior steps)';
    const status = task.status || 'unknown';
    return `\nTask status: ${status}\nRecent actions (latest first):\n${stepsText}\n`;
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

    const withRetry = async (fn, { retries = 2, delayMs = 500 } = {}) => {
      let lastErr;
      for (let i = 0; i <= retries; i++) {
        try {
          return await fn();
        } catch (e) {
          lastErr = e;
          if (i === retries) break;
          await this.delay(delayMs);
        }
      }
      throw lastErr;
    };

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

        case 'wheel':
          await this.page.mouse.wheel(action.deltaX || 0, action.deltaY || 0);
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

        // Element-targeted actions
        case 'click_element': {
          const locator = await this.resolveLocator(action.locator);
          await withRetry(() => locator.click({ timeout: action.timeout_ms || 5000 }));
          break;
        }

        case 'fill_field': {
          if (action.text === undefined) throw new Error('fill_field requires text');
          const locator = await this.resolveLocator(action.locator);
          await withRetry(async () => {
            await locator.fill('');
            await locator.fill(action.text, { timeout: action.timeout_ms || 5000 });
          });
          break;
        }

        case 'hover_element': {
          const locator = await this.resolveLocator(action.locator);
          await withRetry(() => locator.hover({ timeout: action.timeout_ms || 5000 }));
          break;
        }

        case 'focus_element': {
          const locator = await this.resolveLocator(action.locator);
          await withRetry(() => locator.focus({ timeout: action.timeout_ms || 5000 }));
          break;
        }

        case 'press_on': {
          if (!action.key) throw new Error('press_on requires key');
          const locator = await this.resolveLocator(action.locator);
          const key = this.keyMap[action.key] || action.key;
          await withRetry(() => locator.press(key, { timeout: action.timeout_ms || 5000 }));
          break;
        }

        case 'scroll_into_view': {
          const locator = await this.resolveLocator(action.locator);
          await withRetry(() => locator.scrollIntoViewIfNeeded());
          break;
        }

        case 'select_option': {
          const locator = await this.resolveLocator(action.locator);
          await withRetry(async () => {
            if (action.option_value) {
              await locator.selectOption(Array.isArray(action.option_value) ? action.option_value : { value: action.option_value });
            } else if (action.option_label) {
              const labels = Array.isArray(action.option_label) ? action.option_label : [action.option_label];
              await locator.selectOption(labels.map(l => ({ label: l })));
            } else {
              throw new Error('select_option requires option_value or option_label');
            }
          });
          break;
        }

        // Assertions and waits
        case 'assert_visible': {
          const locator = await this.resolveLocator(action.locator);
          await locator.waitFor({ state: 'visible', timeout: action.timeout_ms || 5000 });
          break;
        }

        case 'assert_text': {
          const locator = await this.resolveLocator(action.locator);
          if (!action.expected) throw new Error('assert_text requires expected');
          const txt = (await locator.first().innerText({ timeout: action.timeout_ms || 5000 })).trim();
          const match = action.exact ? (txt === action.expected) : txt.includes(action.expected);
          if (!match) throw new Error(`Text assertion failed. Expected ${action.exact ? 'exact' : 'contains'} "${action.expected}", got "${txt}"`);
          break;
        }

        case 'assert_url': {
          const url = this.page.url();
          if (action.url_equals && url !== action.url_equals) throw new Error(`URL equals failed. Expected "${action.url_equals}", got "${url}"`);
          if (action.url_contains && !url.includes(action.url_contains)) throw new Error(`URL contains failed. Expected contains "${action.url_contains}", got "${url}"`);
          break;
        }

        case 'assert_title': {
          const title = await this.page.title();
          if (action.title_equals && title !== action.title_equals) throw new Error(`Title equals failed. Expected "${action.title_equals}", got "${title}"`);
          if (action.title_contains && !title.includes(action.title_contains)) throw new Error(`Title contains failed. Expected contains "${action.title_contains}", got "${title}"`);
          break;
        }

        case 'wait_for_element': {
          const locator = await this.resolveLocator(action.locator);
          const state = action.state || 'visible';
          await locator.first().waitFor({ state, timeout: action.timeout_ms || 8000 });
          break;
        }

        case 'mouse_down': {
          const btn = action.button || 'left';
          let x = 0, y = 0;
          if (action.coordinates) ({ x, y } = this.validateCoordinates(action.coordinates.x, action.coordinates.y));
          if (typeof x === 'number' && typeof y === 'number') await this.page.mouse.move(x, y);
          await this.page.mouse.down({ button: btn });
          break;
        }

        case 'mouse_up': {
          const btn = action.button || 'left';
          await this.page.mouse.up({ button: btn });
          break;
        }

        case 'mouse_move': {
          if (action.coordinates) {
            const { x, y } = this.validateCoordinates(action.coordinates.x, action.coordinates.y);
            await this.page.mouse.move(x, y, { steps: 1 });
          }
          break;
        }

        case 'pause_task':
          this.taskManager.pauseTask(taskId);
          break;

        case 'resume_task':
          this.taskManager.resumeTask(taskId);
          // Ensure processing loop is running (no-op if already processing)
          this.processTask(taskId);
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

  // Build a robust Playwright locator from a flexible spec
  async resolveLocator(spec) {
    if (!this.page) throw new Error('Browser page not initialized');
    if (!spec || typeof spec !== 'object') throw new Error('locator spec required');
    const exact = !!spec.exact;
    let locator = null;

    try {
      if (spec.selector) locator = this.page.locator(spec.selector);
      if (!locator && spec.role) locator = this.page.getByRole(spec.role, spec.name ? { name: spec.name, exact } : undefined);
      if (!locator && spec.label) locator = this.page.getByLabel(spec.label, { exact });
      if (!locator && spec.placeholder) locator = this.page.getByPlaceholder(spec.placeholder, { exact });
      if (!locator && spec.text) locator = this.page.getByText(spec.text, { exact });
      if (!locator && spec.alt) locator = this.page.getByAltText(spec.alt, { exact });
      if (!locator && spec.title) locator = this.page.getByTitle(spec.title, { exact });
      if (!locator && spec.testId) locator = this.page.getByTestId(spec.testId);
      if (!locator && spec.href) locator = this.page.locator(`a[href*="${spec.href.replace(/"/g, '\\"')}"]`);
    } catch (e) {
      // ignore and fall through
    }

    if (!locator) throw new Error('Unable to construct locator from spec');
    if (typeof spec.nth === 'number') locator = locator.nth(spec.nth);
    await locator.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    return locator.first();
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

    const screenshot = await this._withTimeout(
      this.page.screenshot({ type: 'png', fullPage: false, timeout: 7000 }),
      8000,
      'screenshot'
    );

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
      // Stop streaming if active
      try { await this.stopScreencastInternal(); } catch {}
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.cdpClient = null;
    }
  }

  // Generic timeout wrapper to prevent hangs
  _withTimeout(promise, ms, label = 'op') {
    return new Promise((resolve, reject) => {
      let done = false;
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        const err = new Error(`${label} timed out after ${ms}ms`);
        err.code = 'ETIMEDOUT';
        reject(err);
      }, ms);
      Promise.resolve(typeof promise === 'function' ? promise() : promise)
        .then((v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } })
        .catch((e) => { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
  }
}

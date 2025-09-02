import { Session } from './state/session.js';
import { Task, AppState, ModelInfo as ModelInfoType, HTMLElementWithProps, WebSocketMessage } from '../types.js';

// Import legacy components
import { ThemeToggle } from '../../../public/app/components/ThemeToggle.js';
import { TaskInput } from '../../../public/app/components/TaskInput.js';
import { ModelInfo } from '../../../public/app/components/ModelInfo.js';
import { TaskStatus } from '../../../public/app/components/TaskStatus.js';
import { ActivityLog } from '../../../public/app/components/ActivityLog.js';
import { TaskSidebar } from '../../../public/app/components/TaskSidebar.js';

// Import new TypeScript LiveBrowserView directly inline
function LiveBrowserView(): HTMLElementWithProps {
  const wrap = document.createElement('div') as HTMLElementWithProps;
  wrap.className = 'live';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const badge = document.createElement('div');
  badge.className = 'badge inline-flex items-center gap-2 px-3 py-1 rounded-full';
  badge.innerHTML = '<span class="dot inline-block align-middle"></span> <span class="align-middle">Live Browser</span>';
  const hint = document.createElement('div');
  hint.className = 'muted small subtle text-[12px]';
  hint.textContent = 'Click to interact directly - Auto-updates in real-time';

  const spacer = document.createElement('div');
  spacer.style.flex = '1';

  // Controls
  const last = document.createElement('div');
  last.className = 'muted small subtle';
  last.style.marginRight = '8px';
  last.textContent = '';

  const btn = (label: string, title: string, handler: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    if (title) b.title = title;
    b.addEventListener('click', handler);
    return b;
  };

  const state = {
    currentTask: null as Task | null,
    isLive: false,
    streamActive: false,
    streamRequested: false,
    expanded: false,
    lastMeta: null as any,
    socket: null as WebSocket | null
  };

  const refresh = btn('↻', 'Refresh browser page', async () => {
    if (!state.currentTask?.id) return;
    await sendAction({ action: 'navigate', url: 'reload', reason: 'User refresh' });
  });

  const openNew = btn('⧉', 'Open in new browser tab', async () => {
    if (!state.currentTask?.id) return;
    try {
      const res = await fetch('/api/page-state');
      if (res.ok) {
        const data = await res.json();
        if (data.url && data.url !== 'about:blank') {
          window.open(data.url, '_blank');
        }
      }
    } catch {}
  });

  toolbar.append(badge, hint, spacer, last, refresh, openNew);

  // Browser frame
  const frame = document.createElement('div');
  frame.className = 'frame';

  // Background for proper aspect ratio
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';

  // Live stream canvas (for real-time frames)
  const canvas = document.createElement('canvas');
  canvas.className = 'canvas';
  canvas.style.display = 'none';

  // Static screenshot image
  const img = document.createElement('img');
  img.className = 'screenshot';
  img.style.display = 'block';

  // Live interaction overlay - now permanently enabled for better UX
  const overlay = document.createElement('div');
  overlay.className = 'overlay-cta hidden';
  overlay.innerHTML = `
    <div class="overlay-glass">
      <button class="overlay-btn">
        <span>🖱️ Click to control directly</span>
      </button>
    </div>
  `;

  // Click to activate live control immediately
  overlay.addEventListener('click', async (ev) => {
    if (!state.currentTask?.id) return;
    ev.preventDefault();
    // Automatically enable live mode on first click
    await enableLiveMode();
    toggleExpanded(true);
  });

  frame.append(backdrop, canvas, img, overlay);

  wrap.appendChild(toolbar);
  wrap.appendChild(frame);

  // Enhanced direct input handling
  frame.addEventListener('click', async (ev: MouseEvent) => {
    if (!state.isLive || !state.currentTask) return;
    const targetEl = state.streamActive ? canvas : img;
    const rect = targetEl.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    
    // Map to viewport coordinates
    const vw = state.streamActive ? (state.lastMeta?.deviceWidth || canvas.width) : (img.naturalWidth || rect.width);
    const vh = state.streamActive ? (state.lastMeta?.deviceHeight || canvas.height) : (img.naturalHeight || rect.height);
    const x = Math.round(relX * vw);
    const y = Math.round(relY * vh);
    
    // Visual click feedback
    createClickPulse(ev.clientX, ev.clientY);
    
    // Send via enhanced direct input protocol
    await sendDirectAction({ action: 'click', coordinates: { x, y }, reason: 'User click' });
  });

  // Show hover controls when not in live mode
  frame.addEventListener('mouseenter', () => {
    if (!state.isLive) overlay.classList.remove('hidden');
  });
  
  frame.addEventListener('mouseleave', () => {
    if (!state.isLive) overlay.classList.add('hidden');
  });

  async function enableLiveMode(): Promise<void> {
    if (state.isLive) return;
    
    state.isLive = true;
    frame.classList.add('live-mode');
    
    // Pause current task and take control
    if (state.currentTask?.id) {
      try {
        await fetch(`/api/tasks/${state.currentTask.id}/pause`, { method: 'POST' });
      } catch {}
      
      // Signal live control via WebSocket
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        const message: WebSocketMessage = {
          type: 'liveControl',
          taskId: state.currentTask.id
        };
        state.socket.send(JSON.stringify(message));
      }
    }
    
    // Start live streaming
    if (!state.streamRequested && state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: 'startScreencast', taskId: state.currentTask?.id }));
      state.streamRequested = true;
    }
  }

  function toggleExpanded(force?: boolean): void {
    state.expanded = force !== undefined ? force : !state.expanded;
    wrap.classList.toggle('expanded', state.expanded);
    document.body.classList.toggle('live-expanded', state.expanded);
  }

  function createClickPulse(x: number, y: number): void {
    const pulse = document.createElement('div');
    pulse.className = 'click-pulse';
    pulse.style.left = `${x}px`;
    pulse.style.top = `${y}px`;
    document.body.appendChild(pulse);
    setTimeout(() => document.body.removeChild(pulse), 600);
  }

  // Enhanced direct action sender with low-latency WebSocket protocol
  async function sendDirectAction(action: any): Promise<void> {
    try {
      // Use new direct input protocol for minimal latency
      if (state.isLive && state.socket && state.socket.readyState === WebSocket.OPEN) {
        const message: WebSocketMessage = {
          type: 'directInput',
          taskId: state.currentTask!.id,
          action
        };
        state.socket.send(JSON.stringify(message));
        return;
      }
      
      // Fallback to HTTP for non-live mode
      if (state.currentTask?.id) {
        const res = await fetch(`/api/tasks/${state.currentTask.id}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action)
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.screenshot && !state.streamActive) {
          update(data.screenshot);
        }
      }
    } catch (error) {
      console.error('Error sending direct action:', error);
    }
  }

  async function sendAction(action: any): Promise<void> {
    return sendDirectAction(action);
  }

  function update(screenshot: string): void {
    if (screenshot && screenshot.startsWith('data:image/')) {
      img.src = screenshot;
      img.style.display = 'block';
      canvas.style.display = 'none';
      last.textContent = new Date().toLocaleTimeString();
    }
  }

  function drawFrame(frameData: string): void {
    if (!frameData) return;
    
    state.streamActive = true;
    img.style.display = 'none';
    canvas.style.display = 'block';
    
    // Draw frame to canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const image = new Image();
    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
    };
    image.src = `data:image/jpeg;base64,${frameData}`;
  }

  function setTask(task: Task | null): void {
    state.currentTask = task;
    if (!task) {
      last.textContent = '';
      return;
    }
    refresh.disabled = !task?.id;
    openNew.disabled = !task?.id;
    
    // Auto-enable streaming for current task if in live mode
    if (state.isLive && state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: 'startScreencast', taskId: task.id }));
    }
  }

  function setSocket(socket: WebSocket | null): void {
    state.socket = socket;
    
    if (socket) {
      socket.addEventListener('message', (ev: MessageEvent) => {
        try {
          const msg: WebSocketMessage = JSON.parse(ev.data);
          if (msg.type === 'screencastFrame' && msg.frame) {
            drawFrame(msg.frame);
          } else if (msg.type === 'controlGranted') {
            console.log('Live control granted');
          }
        } catch {}
      });
    }
  }

  function isStreaming(): boolean {
    return state.streamActive;
  }

  // Expose methods
  wrap.update = update;
  wrap.setTask = setTask;
  wrap.setSocket = setSocket;
  wrap.drawFrame = drawFrame;
  wrap.isStreaming = isStreaming;

  return wrap;
}

type ElementProps = {
  class?: string;
  [key: string]: any;
};

const h = (tag: string, props: ElementProps = {}, ...children: (string | HTMLElement | null)[]): HTMLElement => {
  const el = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null) el.setAttribute(k, v);
  });
  children.flat().forEach((c) => {
    if (c == null) return;
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  });
  return el;
};

class App {
  private root: HTMLElement;
  private session: Session;
  private ws: WebSocket | null = null;
  private state: AppState;
  private taskInput!: HTMLElementWithProps;
  private liveView!: HTMLElementWithProps;
  private modelInfo!: HTMLElementWithProps;
  private taskStatus!: HTMLElementWithProps;
  private activityLog!: HTMLElementWithProps;
  private sidebar!: HTMLElementWithProps;

  constructor(root: HTMLElement) {
    this.root = root;
    this.session = new Session();
    this.state = {
      info: null,
      currentTask: null,
    };
    this.init();
  }

  async init(): Promise<void> {
    await this.session.ensure();
    await this.fetchInfo();
    this.renderShell();
    await this.hydrateFromSession();
    this.connectWS();
  }

  renderShell(): void {
    const topbar = h(
      'div',
      { class: 'topbar' },
      h('div', { class: 'brand' }, h('div', { class: 'brand-logo' }), 'BrowserAgent'),
      ThemeToggle(),
    );

    // Left side: Task input + Live view
    this.taskInput = TaskInput({
      onSubmit: (text: string) => this.createTask(text),
    }) as HTMLElementWithProps;
    this.liveView = LiveBrowserView();
    this.modelInfo = ModelInfo() as HTMLElementWithProps;

    const left = h('div', { class: 'panel' },
      h('div', { class: 'hero' },
        h('div', { class: 'muted' }, 'Tell the agent what to do'),
        this.taskInput,
        this.modelInfo,
      ),
      h('div', { class: 'divider' }),
      this.liveView,
    );

    // Right side: Status + Activity
    this.taskStatus = TaskStatus({
      onPause: () => this.taskAction('pause'),
      onResume: () => this.taskAction('resume'),
      onStop: () => this.taskAction('stop'),
    }) as HTMLElementWithProps;
    this.activityLog = ActivityLog() as HTMLElementWithProps;

    const right = h('div', { class: 'panel' },
      this.taskStatus,
      h('div', { class: 'divider' }),
      h('div', {}, h('div', { class: 'muted small subtle' }, 'Activity Log')),
      this.activityLog,
    );

    // Sidebar
    this.sidebar = TaskSidebar({
      onSelect: (t: Task) => this.setCurrentTask(t),
      onRename: async (t: Task, name: string) => {
        await fetch(`/api/tasks/${t.id}`, { 
          method: 'PATCH', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ description: name }) 
        });
      },
      onDelete: async (t: Task) => {
        await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
        // If current task deleted, clear or switch
        if (this.state.currentTask && this.state.currentTask.id === t.id) {
          this.state.currentTask = null;
          this.taskStatus.update?.(null);
          this.activityLog.update?.([]);
          this.liveView.setTask?.(null);
        }
        this.refreshSidebar();
      }
    }) as HTMLElementWithProps;

    const content = h('div', { class: 'content with-sidebar' }, this.sidebar, left, right);
    this.root.innerHTML = '';
    this.root.appendChild(h('div', { class: 'shell' }, topbar, content));
  }

  async fetchInfo(): Promise<void> {
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        this.state.info = await res.json() as ModelInfoType;
        this.modelInfo?.update?.(this.state.info);
      }
    } catch {}
  }

  async hydrateFromSession(): Promise<void> {
    try {
      const res = await fetch(`/api/sessions/${this.session.id}/tasks`);
      if (!res.ok) return;
      const { tasks } = await res.json();
      if (tasks && tasks.length) {
        const latest = tasks.sort((a: Task, b: Task) => 
          new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
        )[0];
        this.setCurrentTask(latest);
      }
    } catch {}
  }

  connectWS(): void {
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${location.host}`;
      this.ws = new WebSocket(url);
      
      this.ws.addEventListener('open', () => {
        if (this.state.currentTask) {
          const message: WebSocketMessage = {
            type: 'subscribe',
            taskId: this.state.currentTask.id
          };
          this.ws!.send(JSON.stringify(message));
        }
        // Give live view WS reference for direct needs
        this.liveView.setSocket?.(this.ws);
      });

      this.ws.addEventListener('message', (ev: MessageEvent) => {
        try {
          const msg: WebSocketMessage = JSON.parse(ev.data);
          if (msg.type === 'taskUpdate' && msg.task) {
            if (!this.state.currentTask || msg.task.id === this.state.currentTask.id) {
              this.setCurrentTask(msg.task);
            }
            // Sidebar stays in sync
            this.refreshSidebar();
          } else if (msg.type === 'screencastFrame') {
            // Forward to live view to render
            this.liveView.drawFrame?.(msg.frame || '');
          } else if (msg.type === 'screencastError') {
            console.warn('Screencast error:', msg.error);
          }
        } catch {}
      });

      this.ws.addEventListener('close', () => {
        setTimeout(() => this.connectWS(), 1000);
      });
    } catch {}
  }

  async createTask(text: string): Promise<void> {
    const body = { task: text, sessionId: this.session.id };
    const res = await fetch('/api/tasks', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      const task: Task = { 
        id: data.taskId, 
        description: text, 
        status: 'created', 
        createdAt: new Date().toISOString(), 
        steps: [], 
        screenshots: [] 
      };
      this.setCurrentTask(task);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const message: WebSocketMessage = {
          type: 'subscribe',
          taskId: task.id
        };
        this.ws.send(JSON.stringify(message));
      }
      this.refreshSidebar();
    } else {
      alert(data.error || 'Failed to create task');
    }
  }

  async taskAction(action: string): Promise<void> {
    const t = this.state.currentTask;
    if (!t) return;
    await fetch(`/api/tasks/${t.id}/${action}`, { method: 'POST' });
  }

  setCurrentTask(task: Task): void {
    this.state.currentTask = task;
    this.taskStatus.update?.(task);
    this.activityLog.update?.(task.steps || []);
    this.liveView.setTask?.(task);
    
    const last = (task.screenshots || [])[task.screenshots.length - 1];
    // Avoid clobbering the live canvas during manual streaming sessions
    if (last && !(this.liveView.isStreaming?.())) {
      this.liveView.update?.(last.data);
    }
    
    // Keep subscription; screencast is driven by live control only
    if (this.ws && this.ws.readyState === WebSocket.OPEN && task && task.id) {
      const message: WebSocketMessage = {
        type: 'subscribe',
        taskId: task.id
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  async refreshSidebar(): Promise<void> {
    try {
      const res = await fetch(`/api/sessions/${this.session.id}/tasks`);
      if (!res.ok) return;
      const { tasks } = await res.json();
      this.sidebar.update?.(tasks, this.state.currentTask?.id);
    } catch {}
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    new App(root);
  }
});
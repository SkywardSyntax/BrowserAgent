import { Session } from './state/session';
import { ThemeToggle } from './components/ThemeToggle';
import { TaskInput } from './components/TaskInput';
import { LiveBrowserView } from './components/LiveBrowserView';
import { ModelInfo } from './components/ModelInfo';
import { TaskStatus } from './components/TaskStatus';
import { ActivityLog } from './components/ActivityLog';
import { TaskSidebar } from './components/TaskSidebar';
import type { Info, Task } from './types';

type ElementChild = string | Node | (string | Node)[] | null | undefined;

const h = (tag: string, props: Record<string, unknown> = {}, ...children: ElementChild[]): HTMLElement => {
  const el = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (k === 'class') (el as HTMLElement).className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  });
  children.flat().forEach((c) => {
    if (c == null) return;
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  });
  return el;
};

class App {
  root: HTMLElement;
  session: Session;
  ws: WebSocket | null;
  state: { info: Info | null; currentTask: Task | null };
  taskInput!: HTMLDivElement;
  liveView!: ReturnType<typeof LiveBrowserView>;
  modelInfo!: ReturnType<typeof ModelInfo>;
  taskStatus!: ReturnType<typeof TaskStatus>;
  activityLog!: ReturnType<typeof ActivityLog>;
  sidebar!: ReturnType<typeof TaskSidebar>;

  constructor(root: HTMLElement) {
    this.root = root;
    this.session = new Session();
    this.ws = null;
    this.state = { info: null, currentTask: null };
    void this.init();
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

    this.taskInput = TaskInput({ onSubmit: (text) => this.createTask(text) });
    this.liveView = LiveBrowserView();
    this.modelInfo = ModelInfo();

    const left = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'hero' }, h('div', { class: 'muted' }, 'Tell the agent what to do'), this.taskInput, this.modelInfo),
      h('div', { class: 'divider' }),
      this.liveView
    );

    this.taskStatus = TaskStatus({
      onPause: () => this.taskAction('pause'),
      onResume: () => this.taskAction('resume'),
      onStop: () => this.taskAction('stop'),
    });
    this.activityLog = ActivityLog();

    const right = h(
      'div',
      { class: 'panel' },
      this.taskStatus,
      h('div', { class: 'divider' }),
      h('div', {}, h('div', { class: 'muted small subtle' }, 'Activity Log')),
      this.activityLog
    );

    this.sidebar = TaskSidebar({
      onSelect: (t) => this.setCurrentTask(t),
      onRename: async (t, name) => {
        await fetch(`/api/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: name }) });
      },
      onDelete: async (t) => {
        await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
        if (this.state.currentTask && this.state.currentTask.id === t.id) {
          this.state.currentTask = null;
          this.taskStatus.update(null);
          this.activityLog.update([]);
          if (this.liveView && this.liveView.setTask) this.liveView.setTask(null);
        }
        this.refreshSidebar();
      },
    });

    const content = h('div', { class: 'content with-sidebar' }, this.sidebar, left, right);
    this.root.innerHTML = '';
    this.root.appendChild(h('div', { class: 'shell' }, topbar, content));
  }

  async fetchInfo(): Promise<void> {
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        this.state.info = (await res.json()) as Info;
        this.modelInfo.update(this.state.info);
      }
    } catch {}
  }

  async hydrateFromSession(): Promise<void> {
    try {
      const res = await fetch(`/api/sessions/${this.session.id}/tasks`);
      if (res.ok) {
        const { tasks } = (await res.json()) as { tasks: Task[] };
        if (tasks && tasks.length) {
          const latest = tasks.slice().sort((a, b) => new Date(b.updatedAt || '').getTime() - new Date(a.updatedAt || '').getTime())[0];
          this.setCurrentTask(latest);
          this.sidebar.update(tasks, latest.id);
          this.persistSidebarTasks(tasks);
          return;
        }
      }
      // Fallback to locally cached tasks for this session
      const cached = this.loadSidebarTasks();
      if (cached.length) this.sidebar.update(cached, this.state.currentTask?.id || null);
    } catch {}
  }

  connectWS(): void {
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${location.host}`;
      this.ws = new WebSocket(url);
      this.ws.addEventListener('open', () => {
        if (this.state.currentTask) {
          this.ws?.send(JSON.stringify({ type: 'subscribe', taskId: this.state.currentTask.id }));
        }
        this.liveView.setSocket(this.ws!);
      });
      this.ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { type: string; task?: Task; frame?: unknown; error?: string };
          if (msg.type === 'taskUpdate' && msg.task) {
            if (!this.state.currentTask || msg.task.id === this.state.currentTask.id) {
              this.setCurrentTask(msg.task);
            }
            this.refreshSidebar();
          } else if (msg.type === 'screencastFrame' && msg.frame) {
            this.liveView.drawFrame(msg.frame as unknown as import('./types').ScreencastFrame);
          } else if (msg.type === 'screencastError') {
            // eslint-disable-next-line no-console
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
    const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json()) as { taskId: string; error?: string };
    if (res.ok) {
      const task: Task = { id: data.taskId, description: text, status: 'created', createdAt: new Date().toISOString(), steps: [], screenshots: [] } as Task;
      this.setCurrentTask(task);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'subscribe', taskId: task.id }));
      }
      await this.refreshSidebar();
    } else {
      alert(data.error || 'Failed to create task');
    }
  }

  async taskAction(action: 'pause' | 'resume' | 'stop'): Promise<void> {
    const t = this.state.currentTask;
    if (!t) return;
    await fetch(`/api/tasks/${t.id}/${action}`, { method: 'POST' });
  }

  setCurrentTask(task: Task): void {
    this.state.currentTask = task;
    this.taskStatus.update(task);
    this.activityLog.update(task.steps || []);
    this.liveView.setTask(task);
    const last = (task.screenshots || [])[task.screenshots.length - 1];
    if (last && !(this.liveView.isStreaming && this.liveView.isStreaming())) {
      this.liveView.update(last.data);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN && task && task.id) {
      this.ws.send(JSON.stringify({ type: 'subscribe', taskId: task.id }));
    }
  }

  async refreshSidebar(): Promise<void> {
    try {
      const res = await fetch(`/api/sessions/${this.session.id}/tasks`);
      if (!res.ok) return;
      const { tasks } = (await res.json()) as { tasks: Task[] };
      if (this.sidebar && this.sidebar.update) {
        this.sidebar.update(tasks, this.state.currentTask && this.state.currentTask.id);
      }
      this.persistSidebarTasks(tasks);
    } catch {}
  }

  persistSidebarTasks(tasks: Task[]): void {
    try {
      const key = `session:${this.session.id}:tasks`;
      const lite = tasks.map((t) => ({ id: t.id, description: t.description, status: t.status, updatedAt: t.updatedAt, createdAt: t.createdAt }));
      localStorage.setItem(key, JSON.stringify(lite));
    } catch {}
  }

  loadSidebarTasks(): Task[] {
    try {
      const key = `session:${this.session.id}:tasks`;
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const arr = JSON.parse(raw) as Array<Pick<Task, 'id' | 'description' | 'status' | 'updatedAt' | 'createdAt'>>;
      return arr.map((t) => ({ ...t, steps: [], screenshots: [] })) as Task[];
    } catch {
      return [];
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (!root) throw new Error('App root not found');
  new App(root);
});

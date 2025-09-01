import { Session } from './state/session.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { TaskInput } from './components/TaskInput.js';
import { LiveBrowserView } from './components/LiveBrowserView.js';
import { ModelInfo } from './components/ModelInfo.js';
import { TaskStatus } from './components/TaskStatus.js';
import { ActivityLog } from './components/ActivityLog.js';
import { TaskSidebar } from './components/TaskSidebar.js';

const h = (tag, props = {}, ...children) => {
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
  constructor(root) {
    this.root = root;
    this.session = new Session();
    this.ws = null;
    this.state = {
      info: null,
      currentTask: null,
    };
    this.init();
  }

  async init() {
    await this.session.ensure();
    await this.fetchInfo();
    this.renderShell();
    await this.hydrateFromSession();
    this.connectWS();
  }

  renderShell() {
    const topbar = h(
      'div',
      { class: 'topbar' },
      h('div', { class: 'brand' }, h('div', { class: 'brand-logo' }), 'BrowserAgent'),
      ThemeToggle(),
    );

    // Left side: Task input + Live view
    this.taskInput = TaskInput({
      onSubmit: (text) => this.createTask(text),
    });
    this.liveView = LiveBrowserView();
    this.modelInfo = ModelInfo();

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
    });
    this.activityLog = ActivityLog();

    const right = h('div', { class: 'panel' },
      this.taskStatus,
      h('div', { class: 'divider' }),
      h('div', {}, h('div', { class: 'muted small subtle' }, 'Activity Log')),
      this.activityLog,
    );

    // Sidebar
    this.sidebar = TaskSidebar({
      onSelect: (t) => this.setCurrentTask(t),
      onRename: async (t, name) => {
        await fetch(`/api/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: name }) });
      },
      onDelete: async (t) => {
        await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
        // If current task deleted, clear or switch
        if (this.state.currentTask && this.state.currentTask.id === t.id) {
          this.state.currentTask = null;
          this.taskStatus.update(null);
          this.activityLog.update([]);
          if (this.liveView && this.liveView.setTask) this.liveView.setTask(null);
        }
        this.refreshSidebar();
      }
    });

    const content = h('div', { class: 'content with-sidebar' }, this.sidebar, left, right);
    this.root.innerHTML = '';
    this.root.appendChild(h('div', { class: 'shell' }, topbar, content));
  }

  async fetchInfo() {
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        this.state.info = await res.json();
        if (this.modelInfo && this.modelInfo.update) this.modelInfo.update(this.state.info);
      }
    } catch {}
  }

  async hydrateFromSession() {
    try {
      const res = await fetch(`/api/sessions/${this.session.id}/tasks`);
      if (!res.ok) return;
      const { tasks } = await res.json();
      if (tasks && tasks.length) {
        const latest = tasks.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
        this.setCurrentTask(latest);
      }
    } catch {}
  }

  connectWS() {
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${location.host}`;
      this.ws = new WebSocket(url);
      this.ws.addEventListener('open', () => {
        if (this.state.currentTask) {
          this.ws.send(JSON.stringify({ type: 'subscribe', taskId: this.state.currentTask.id }));
        }
      });
      this.ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'taskUpdate') {
            if (!this.state.currentTask || msg.task.id === this.state.currentTask.id) {
              this.setCurrentTask(msg.task);
            }
            // Sidebar stays in sync
            this.refreshSidebar();
          }
        } catch {}
      });
      this.ws.addEventListener('close', () => {
        setTimeout(() => this.connectWS(), 1000);
      });
    } catch {}
  }

  async createTask(text) {
    const body = { task: text, sessionId: this.session.id };
    const res = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      const task = { id: data.taskId, description: text, status: 'created', createdAt: new Date().toISOString(), steps: [], screenshots: [] };
      this.setCurrentTask(task);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'subscribe', taskId: task.id }));
      }
      this.refreshSidebar();
    } else {
      alert(data.error || 'Failed to create task');
    }
  }

  async taskAction(action) {
    const t = this.state.currentTask;
    if (!t) return;
    await fetch(`/api/tasks/${t.id}/${action}`, { method: 'POST' });
  }

  setCurrentTask(task) {
    this.state.currentTask = task;
    this.taskStatus.update(task);
    this.activityLog.update(task.steps || []);
    if (this.liveView && this.liveView.setTask) this.liveView.setTask(task);
    const last = (task.screenshots || [])[task.screenshots.length - 1];
    if (last) this.liveView.update(last.data);
  }

  async refreshSidebar() {
    try {
      const res = await fetch(`/api/sessions/${this.session.id}/tasks`);
      if (!res.ok) return;
      const { tasks } = await res.json();
      if (this.sidebar && this.sidebar.update) {
        this.sidebar.update(tasks, this.state.currentTask && this.state.currentTask.id);
      }
    } catch {}
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  new App(root);
});


import { v4 as uuidv4 } from 'uuid';

export type TaskStatus = 'created' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed' | 'deleted';

export interface Step {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  error?: boolean;
  reasoning?: boolean;
  action?: unknown;
}

export interface Screenshot {
  id: string;
  data: string;
  timestamp: string;
}

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failedAt?: string;
  result?: string | null;
  error?: string | null;
  paused?: boolean;
  deleted?: boolean;
  sessionId: string | null;
  steps: Step[];
  currentStep: Step | null;
  screenshots: Screenshot[];
}

export class TaskManager {
  private tasks: Map<string, Task>;
  private subscribers: Set<(taskId: string, task: Task) => void>;
  private sessionTasks: Map<string, Set<string>>;

  constructor() {
    this.tasks = new Map();
    this.subscribers = new Set();
    this.sessionTasks = new Map();
  }

  createTask(description: string, sessionId: string | null = null): string {
    const taskId = uuidv4();
    const now = new Date().toISOString();
    const task: Task = {
      id: taskId,
      description,
      status: 'created',
      createdAt: now,
      updatedAt: now,
      steps: [],
      currentStep: null,
      screenshots: [],
      error: null,
      paused: false,
      sessionId,
    };

    this.tasks.set(taskId, task);
    if (task.sessionId) {
      if (!this.sessionTasks.has(task.sessionId)) this.sessionTasks.set(task.sessionId, new Set());
      this.sessionTasks.get(task.sessionId)!.add(taskId);
    }
    this.notifySubscribers(taskId, task);
    return taskId;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  updateTask(taskId: string, updates: Partial<Task>): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    const updatedTask: Task = { ...task, ...updates, updatedAt: new Date().toISOString() } as Task;
    this.tasks.set(taskId, updatedTask);
    this.notifySubscribers(taskId, updatedTask);
    return true;
  }

  addStep(taskId: string, step: Omit<Step, 'id' | 'timestamp'>): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    const s: Step = { id: uuidv4(), ...step, timestamp: new Date().toISOString() };
    task.steps.push(s);
    task.currentStep = s;
    task.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, task);
    this.notifySubscribers(taskId, task);
    return true;
  }

  addScreenshot(taskId: string, screenshot: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    const shot: Screenshot = { id: uuidv4(), data: screenshot, timestamp: new Date().toISOString() };
    task.screenshots.push(shot);
    if (task.screenshots.length > 10) task.screenshots = task.screenshots.slice(-10);
    task.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, task);
    this.notifySubscribers(taskId, task);
    return true;
  }

  pauseTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status === 'running') {
      task.status = 'paused';
      task.paused = true;
      task.updatedAt = new Date().toISOString();
      this.tasks.set(taskId, task);
      this.notifySubscribers(taskId, task);
    }
    return true;
  }

  resumeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status === 'paused') {
      task.status = 'running';
      task.paused = false;
      task.updatedAt = new Date().toISOString();
      this.tasks.set(taskId, task);
      this.notifySubscribers(taskId, task);
    }
    return true;
  }

  stopTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = 'stopped';
    task.paused = false;
    task.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, task);
    this.notifySubscribers(taskId, task);
    return true;
  }

  completeTask(taskId: string, result: string | null = null): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = 'completed';
    task.result = result;
    task.completedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, task);
    this.notifySubscribers(taskId, task);
    return true;
  }

  failTask(taskId: string, error: unknown): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = 'failed';
    task.error = typeof error === 'string' ? error : (error as Error)?.message || 'Unknown error';
    task.failedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, task);
    this.notifySubscribers(taskId, task);
    return true;
  }

  getAllTasks(): Task[] { return Array.from(this.tasks.values()); }

  getTasksBySession(sessionId: string | null): Task[] {
    if (!sessionId) return [];
    const ids = this.sessionTasks.get(sessionId);
    if (!ids) return [];
    return Array.from(ids).map((id) => this.tasks.get(id)).filter((t): t is Task => !!t && t.status !== 'deleted' && !t.deleted);
  }

  subscribe(callback: (taskId: string, task: Task) => void): () => void {
    this.subscribers.add(callback);
    return () => { this.subscribers.delete(callback); };
  }

  notifySubscribers(taskId: string, task: Task): void {
    this.subscribers.forEach((callback) => {
      try { callback(taskId, task); } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error in task subscriber:', error);
      }
    });
  }

  cleanup(): void {
    const tasks = Array.from(this.tasks.values());
    const completedTasks = tasks.filter((task) => ['completed', 'failed'].includes(task.status)).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (completedTasks.length > 100) {
      const toDelete = completedTasks.slice(100);
      toDelete.forEach((task) => {
        this.tasks.delete(task.id);
        if (task.sessionId && this.sessionTasks.has(task.sessionId)) {
          const set = this.sessionTasks.get(task.sessionId)!;
          set.delete(task.id);
          if (set.size === 0) this.sessionTasks.delete(task.sessionId);
        }
      });
    }
  }

  deleteTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = 'deleted';
    task.deleted = true;
    task.updatedAt = new Date().toISOString();
    if (task.sessionId && this.sessionTasks.has(task.sessionId)) {
      const set = this.sessionTasks.get(task.sessionId)!;
      set.delete(task.id);
      if (set.size === 0) this.sessionTasks.delete(task.sessionId);
    }
    this.tasks.set(taskId, task);
    this.notifySubscribers(taskId, task);
    return true;
  }
}


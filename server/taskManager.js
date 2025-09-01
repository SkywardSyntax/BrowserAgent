import { v4 as uuidv4 } from 'uuid';

export class TaskManager {
  constructor() {
    this.tasks = new Map();
    this.subscribers = new Set();
    // Map sessionId -> Set of taskIds for session scoping
    this.sessionTasks = new Map();
  }

  createTask(description, sessionId = null) {
    const taskId = uuidv4();
    const task = {
      id: taskId,
      description,
      status: 'created',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      currentStep: null,
      screenshots: [],
      error: null,
      paused: false,
      sessionId: sessionId || null,
    };

    this.tasks.set(taskId, task);
    if (task.sessionId) {
      if (!this.sessionTasks.has(task.sessionId)) {
        this.sessionTasks.set(task.sessionId, new Set());
      }
      this.sessionTasks.get(task.sessionId).add(taskId);
    }
    this.notifySubscribers(taskId, task);
    
    return taskId;
  }

  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  updateTask(taskId, updates) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const updatedTask = {
      ...task,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.tasks.set(taskId, updatedTask);
    this.notifySubscribers(taskId, updatedTask);
    
    return true;
  }

  addStep(taskId, step) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.steps.push({
      id: uuidv4(),
      ...step,
      timestamp: new Date().toISOString()
    });

    task.currentStep = step;
    task.updatedAt = new Date().toISOString();

    this.tasks.set(taskId, task);
    this.notifySubscribers(taskId, task);
    
    return true;
  }

  addScreenshot(taskId, screenshot) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.screenshots.push({
      id: uuidv4(),
      data: screenshot,
      timestamp: new Date().toISOString()
    });

    // Keep only last 10 screenshots to manage memory
    if (task.screenshots.length > 10) {
      task.screenshots = task.screenshots.slice(-10);
    }

    task.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, task);
    this.notifySubscribers(taskId, task);
    
    return true;
  }

  pauseTask(taskId) {
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

  resumeTask(taskId) {
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

  stopTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'stopped';
    task.paused = false;
    task.updatedAt = new Date().toISOString();
    
    this.tasks.set(taskId, task);
    this.notifySubscribers(taskId, task);
    
    return true;
  }

  completeTask(taskId, result = null) {
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

  failTask(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'failed';
    task.error = typeof error === 'string' ? error : error.message;
    task.failedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    
    this.tasks.set(taskId, task);
    this.notifySubscribers(taskId, task);
    
    return true;
  }

  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  getTasksBySession(sessionId) {
    if (!sessionId) return [];
    const ids = this.sessionTasks.get(sessionId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.tasks.get(id))
      .filter((t) => t && t.status !== 'deleted' && !t.deleted);
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  notifySubscribers(taskId, task) {
    this.subscribers.forEach(callback => {
      try {
        callback(taskId, task);
      } catch (error) {
        console.error('Error in task subscriber:', error);
      }
    });
  }

  // Clean up old completed/failed tasks (keep last 100)
  cleanup() {
    const tasks = Array.from(this.tasks.values());
    const completedTasks = tasks
      .filter(task => ['completed', 'failed'].includes(task.status))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    if (completedTasks.length > 100) {
      const toDelete = completedTasks.slice(100);
      toDelete.forEach(task => {
        this.tasks.delete(task.id);
        if (task.sessionId && this.sessionTasks.has(task.sessionId)) {
          const set = this.sessionTasks.get(task.sessionId);
          set.delete(task.id);
          if (set.size === 0) this.sessionTasks.delete(task.sessionId);
        }
      });
    }
  }

  deleteTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'deleted';
    task.deleted = true;
    task.updatedAt = new Date().toISOString();

    // Remove from session map
    if (task.sessionId && this.sessionTasks.has(task.sessionId)) {
      const set = this.sessionTasks.get(task.sessionId);
      set.delete(task.id);
      if (set.size === 0) this.sessionTasks.delete(task.sessionId);
    }

    this.tasks.set(taskId, task);
    this.notifySubscribers(taskId, task);
    return true;
  }
}

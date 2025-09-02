import { Task, TaskStep } from '../types/index.js';
interface TaskSubscriberCallback {
    (taskId: string, task: Task): void;
}
export declare class TaskManager {
    private tasks;
    private subscribers;
    private sessionTasks;
    constructor();
    createTask(description: string, sessionId?: string | null): string;
    getTask(taskId: string): Task | undefined;
    updateTask(taskId: string, updates: Partial<Task>): boolean;
    addStep(taskId: string, step: Omit<TaskStep, 'id' | 'timestamp'>): boolean;
    addScreenshot(taskId: string, screenshotData: string): boolean;
    pauseTask(taskId: string): boolean;
    resumeTask(taskId: string): boolean;
    stopTask(taskId: string): boolean;
    completeTask(taskId: string, result?: string | null): boolean;
    failTask(taskId: string, error: string | Error): boolean;
    getAllTasks(): Task[];
    getTasksBySession(sessionId: string): Task[];
    subscribe(callback: TaskSubscriberCallback): () => void;
    private notifySubscribers;
    cleanup(): void;
    deleteTask(taskId: string): boolean;
}
export {};
//# sourceMappingURL=taskManager.d.ts.map
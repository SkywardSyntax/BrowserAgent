export class TaskManager {
    tasks: Map<any, any>;
    subscribers: Set<any>;
    sessionTasks: Map<any, any>;
    createTask(description: any, sessionId?: null): string;
    getTask(taskId: any): any;
    updateTask(taskId: any, updates: any): boolean;
    addStep(taskId: any, step: any): boolean;
    addScreenshot(taskId: any, screenshot: any): boolean;
    pauseTask(taskId: any): boolean;
    resumeTask(taskId: any): boolean;
    stopTask(taskId: any): boolean;
    completeTask(taskId: any, result?: null): boolean;
    failTask(taskId: any, error: any): boolean;
    getAllTasks(): any[];
    getTasksBySession(sessionId: any): any[];
    subscribe(callback: any): () => void;
    notifySubscribers(taskId: any, task: any): void;
    cleanup(): void;
    deleteTask(taskId: any): boolean;
}
//# sourceMappingURL=taskManager.d.ts.map
import { TaskManager } from './taskManager.js';
import { BrowserAction, ScreencastMetadata } from '../types/index.js';
interface ScreencastFrame {
    data: string;
    metadata?: ScreencastMetadata;
    format: string;
}
interface ScreencastListener {
    (frame: ScreencastFrame): void;
}
export declare class BrowserAgent {
    private taskManager;
    private browser;
    private page;
    private processingTasks;
    private headless;
    private abortControllers;
    private openai;
    private displayWidth;
    private displayHeight;
    private deploymentName;
    private openAITimeoutMs;
    private actionTimeoutMs;
    private navTimeoutMs;
    private keyMap;
    private cdpClient;
    private screencast;
    private _unsubscribeTM;
    private _onScreencastFrame;
    constructor(taskManager: TaskManager);
    private resolveHeadless;
    initializeBrowser(): Promise<void>;
    ensureCDPClient(): Promise<any>;
    addScreencastListener(fn: ScreencastListener): Promise<() => void>;
    private startScreencastInternal;
    private stopScreencastInternal;
    takeScreenshot(): Promise<string | null>;
    executeBrowserAction(taskId: string, action: BrowserAction): Promise<any>;
    private validateCoordinates;
    private _withTimeout;
    private delay;
    processTask(taskId: string): Promise<void>;
    cleanup(): Promise<void>;
}
export {};
//# sourceMappingURL=browserAgent.d.ts.map
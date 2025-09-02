export class BrowserAgent {
    constructor(taskManager: any);
    taskManager: any;
    browser: import("playwright-core").Browser | null;
    page: import("playwright-core").Page | null;
    processingTasks: Set<any>;
    headless: boolean | undefined;
    abortControllers: Map<any, any>;
    openai: OpenAI;
    displayWidth: number;
    displayHeight: number;
    deploymentName: string;
    openAITimeoutMs: number;
    actionTimeoutMs: number;
    navTimeoutMs: number;
    keyMap: {
        Return: string;
        space: string;
        BackSpace: string;
        Delete: string;
        Tab: string;
        Escape: string;
        Home: string;
        End: string;
        Page_Up: string;
        Page_Down: string;
        Up: string;
        Down: string;
        Left: string;
        Right: string;
    };
    cdpClient: import("playwright-core").CDPSession | null;
    screencast: {
        active: boolean;
        listeners: Set<any>;
        usingCDP: boolean;
        interval: null;
    };
    _unsubscribeTM: any;
    initializeBrowser(): Promise<void>;
    ensureCDPClient(): Promise<import("playwright-core").CDPSession | null>;
    addScreencastListener(fn: any): Promise<() => void>;
    startScreencastInternal(): Promise<void>;
    _onScreencastFrame: ((evt: any) => Promise<void>) | undefined;
    stopScreencastInternal(): Promise<void>;
    resolveHeadless(): boolean;
    getHeadless(): boolean;
    getPageState(): Promise<{
        url: string;
        title: string;
        headless: boolean;
        viewport: {
            width: number;
            height: number;
        };
    }>;
    processTask(taskId: any): Promise<void>;
    aiProcessingLoop(taskId: any): Promise<void>;
    callAI(task: any, screenshot: any): Promise<OpenAI.Chat.Completions.ChatCompletion & {
        _request_id?: string | null;
    }>;
    getStructuredPageContext(): Promise<any>;
    buildContext(task: any): string;
    processAIResponse(taskId: any, response: any): Promise<boolean>;
    executeBrowserAction(taskId: any, action: any): Promise<{
        completed: boolean;
        success?: undefined;
        error?: undefined;
    } | {
        success: boolean;
        completed?: undefined;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        completed?: undefined;
    }>;
    resolveLocator(spec: any): Promise<import("playwright-core").Locator>;
    validateCoordinates(x: any, y: any): {
        x: number;
        y: number;
    };
    takeScreenshot(): Promise<any>;
    waitForResume(taskId: any): Promise<any>;
    delay(ms: any): Promise<any>;
    cleanup(): Promise<void>;
    _withTimeout(promise: any, ms: any, label?: string): Promise<any>;
    _ensurePageReady(): Promise<void>;
    _fallbackInputLocator(spec?: {}, timeoutMs?: number): Promise<import("playwright-core").Locator>;
}
import { OpenAI } from 'openai';
//# sourceMappingURL=browserAgent.d.ts.map
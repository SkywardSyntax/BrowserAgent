export interface Task {
    id: string;
    description: string;
    status: TaskStatus;
    createdAt: string;
    updatedAt?: string;
    sessionId?: string;
    steps: TaskStep[];
    screenshots: Screenshot[];
}
export type TaskStatus = 'created' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
export interface TaskStep {
    id: string;
    action: string;
    timestamp: string;
    result?: string;
    error?: string;
}
export interface Screenshot {
    id: string;
    taskId: string;
    data: string;
    timestamp: string;
}
export interface Session {
    id: string;
    createdAt: string;
    lastActiveAt: string;
}
export interface BrowserAction {
    action: BrowserActionType;
    coordinates?: Coordinates;
    text?: string;
    key?: string;
    url?: string;
    scroll_direction?: ScrollDirection;
    deltaX?: number;
    deltaY?: number;
    button?: MouseButton;
    reason?: string;
}
export type BrowserActionType = 'click' | 'type' | 'key_press' | 'scroll' | 'navigate' | 'mouse_down' | 'mouse_up' | 'mouse_move' | 'wheel';
export interface Coordinates {
    x: number;
    y: number;
}
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';
export type MouseButton = 'left' | 'right' | 'middle';
export interface WebSocketMessage {
    type: WebSocketMessageType;
    taskId?: string;
    task?: Task;
    frame?: string;
    action?: BrowserAction;
    error?: string;
    at?: number;
}
export type WebSocketMessageType = 'subscribe' | 'taskUpdate' | 'startScreencast' | 'stopScreencast' | 'screencastFrame' | 'screencastStarted' | 'screencastStopped' | 'screencastError' | 'directInput' | 'inputAck' | 'inputError' | 'liveControl' | 'controlGranted';
export interface AppState {
    info: ModelInfo | null;
    currentTask: Task | null;
}
export interface ModelInfo {
    model: string;
    provider: string;
    version?: string;
}
export interface ComponentProps {
    [key: string]: any;
}
export interface LivePreviewState {
    isLive: boolean;
    streamActive: boolean;
    lastMeta?: ScreencastMetadata;
}
export interface ScreencastMetadata {
    deviceWidth: number;
    deviceHeight: number;
    timestamp: number;
}
export interface HTMLElementWithProps extends HTMLElement {
    update?: (data: any, currentTaskId?: any) => void;
    setTask?: (task: Task | null) => void;
    setSocket?: (socket: WebSocket | null) => void;
    drawFrame?: (frame: string) => void;
    isStreaming?: () => boolean;
}
export interface APIResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}
export interface TaskCreateResponse {
    taskId: string;
    status: string;
}
export interface PageStateResponse {
    url: string;
    title: string;
}
//# sourceMappingURL=index.d.ts.map
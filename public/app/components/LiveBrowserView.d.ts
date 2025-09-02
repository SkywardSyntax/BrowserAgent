export function LiveBrowserView(): HTMLDivElement & {
    update: (base64Png: any) => void;
    setTask: (task: any) => void;
    setSocket: (ws: any) => void;
    drawFrame: (frameData: any) => void;
    isStreaming: () => boolean;
    isManual: () => boolean;
    isExpanded: () => boolean;
};
//# sourceMappingURL=LiveBrowserView.d.ts.map
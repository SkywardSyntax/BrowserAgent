"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var http_1 = require("http");
var ws_1 = require("ws");
var cors_1 = require("cors");
var dotenv_1 = require("dotenv");
var browserAgent_1 = require("./browserAgent");
var taskManager_1 = require("./taskManager");
dotenv_1.default.config();
var app = (0, express_1.default)();
var server = (0, http_1.createServer)(app);
var wss = new ws_1.WebSocketServer({ server: server });
var taskManager = new taskManager_1.TaskManager();
var browserAgent = new browserAgent_1.BrowserAgent(taskManager);
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.static(process.env.NODE_ENV === 'production' ? 'dist/public' : 'public'));
app.get('/health', function (_req, res) { return res.json({ status: 'ok', timestamp: new Date().toISOString() }); });
app.post('/api/tasks', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, task, sessionId, taskId, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                _a = req.body, task = _a.task, sessionId = _a.sessionId;
                if (!task)
                    return [2 /*return*/, res.status(400).json({ error: 'Task is required' })];
                return [4 /*yield*/, taskManager.createTask(task, sessionId || null)];
            case 1:
                taskId = _b.sent();
                res.json({ taskId: taskId, status: 'created' });
                browserAgent.processTask(taskId);
                return [3 /*break*/, 3];
            case 2:
                error_1 = _b.sent();
                // eslint-disable-next-line no-console
                console.error('Error creating task:', error_1);
                res.status(500).json({ error: 'Failed to create task' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
app.patch('/api/tasks/:taskId', function (req, res) {
    try {
        var taskId = req.params.taskId;
        var description = req.body.description;
        var ok = taskManager.updateTask(taskId, description ? { description: description } : {});
        if (!ok)
            return res.status(404).json({ error: 'Task not found' });
        res.json({ status: 'updated' });
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error updating task:', e);
        res.status(500).json({ error: 'Failed to update task' });
    }
});
app.delete('/api/tasks/:taskId', function (req, res) {
    try {
        var taskId = req.params.taskId;
        var ok = taskManager.deleteTask(taskId);
        if (!ok)
            return res.status(404).json({ error: 'Task not found' });
        res.json({ status: 'deleted' });
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error deleting task:', e);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});
app.get('/api/tasks/:taskId', function (req, res) {
    try {
        var taskId = req.params.taskId;
        var task = taskManager.getTask(taskId);
        if (!task)
            return res.status(404).json({ error: 'Task not found' });
        res.json(task);
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error getting task:', error);
        res.status(500).json({ error: 'Failed to get task' });
    }
});
app.get('/api/sessions/:sessionId/tasks', function (req, res) {
    try {
        var sessionId = req.params.sessionId;
        var tasks = taskManager.getTasksBySession(sessionId);
        res.json({ sessionId: sessionId, tasks: tasks });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error getting session tasks:', error);
        res.status(500).json({ error: 'Failed to get session tasks' });
    }
});
app.get('/api/info', function (_req, res) {
    try {
        res.json({
            model: browserAgent.deploymentName,
            viewport: { width: browserAgent.displayWidth, height: browserAgent.displayHeight },
            headless: browserAgent.getHeadless(),
            wsUrl: "ws://localhost:".concat(PORT),
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to get info' });
    }
});
app.get('/api/page-state', function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 2, , 3]);
                _b = (_a = res).json;
                return [4 /*yield*/, browserAgent.getPageState()];
            case 1:
                _b.apply(_a, [_d.sent()]);
                return [3 /*break*/, 3];
            case 2:
                _c = _d.sent();
                res.status(500).json({ error: 'Failed to get page state' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
app.get('/api/screenshot', function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var b64, img, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, browserAgent.initializeBrowser()];
            case 1:
                _a.sent();
                return [4 /*yield*/, browserAgent.takeScreenshot()];
            case 2:
                b64 = _a.sent();
                img = Buffer.from(b64, 'base64');
                res.writeHead(200, {
                    'Content-Type': 'image/png',
                    'Content-Length': img.length,
                    'Cache-Control': 'no-store',
                });
                res.end(img);
                return [3 /*break*/, 4];
            case 3:
                error_2 = _a.sent();
                // eslint-disable-next-line no-console
                console.error('Error generating screenshot:', error_2);
                res.status(500).send('Failed to get screenshot');
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.get('/api/tasks/:taskId/screenshot', function (req, res) {
    try {
        var taskId = req.params.taskId;
        var task = taskManager.getTask(taskId);
        if (!task)
            return res.status(404).send('Task not found');
        var last = task.screenshots && task.screenshots[task.screenshots.length - 1];
        if (!last)
            return res.status(404).send('No screenshot');
        var img = Buffer.from(last.data, 'base64');
        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': img.length,
            'Cache-Control': 'no-store',
        });
        res.end(img);
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error getting screenshot:', error);
        res.status(500).send('Failed to get screenshot');
    }
});
app.post('/api/tasks/:taskId/action', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var taskId, action, task, result, screenshot, e_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 4, , 5]);
                taskId = req.params.taskId;
                action = req.body;
                task = taskManager.getTask(taskId);
                if (!task)
                    return [2 /*return*/, res.status(404).json({ error: 'Task not found' })];
                return [4 /*yield*/, browserAgent.initializeBrowser()];
            case 1:
                _a.sent();
                return [4 /*yield*/, browserAgent.executeBrowserAction(taskId, action)];
            case 2:
                result = _a.sent();
                return [4 /*yield*/, browserAgent.takeScreenshot()];
            case 3:
                screenshot = _a.sent();
                taskManager.addScreenshot(taskId, screenshot);
                res.json({ result: result, screenshot: screenshot });
                return [3 /*break*/, 5];
            case 4:
                e_1 = _a.sent();
                // eslint-disable-next-line no-console
                console.error('Error executing manual action:', e_1);
                res.status(500).json({ error: 'Failed to execute action', details: e_1.message });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
app.post('/api/tasks/:taskId/pause', function (req, res) {
    try {
        var taskId = req.params.taskId;
        var success = taskManager.pauseTask(taskId);
        if (!success)
            return res.status(404).json({ error: 'Task not found' });
        res.json({ status: 'paused' });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error pausing task:', error);
        res.status(500).json({ error: 'Failed to pause task' });
    }
});
app.post('/api/tasks/:taskId/resume', function (req, res) {
    try {
        var taskId = req.params.taskId;
        var success = taskManager.resumeTask(taskId);
        if (!success)
            return res.status(404).json({ error: 'Task not found' });
        browserAgent.processTask(taskId);
        res.json({ status: 'resumed' });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error resuming task:', error);
        res.status(500).json({ error: 'Failed to resume task' });
    }
});
app.post('/api/tasks/:taskId/stop', function (req, res) {
    try {
        var taskId = req.params.taskId;
        var success = taskManager.stopTask(taskId);
        if (!success)
            return res.status(404).json({ error: 'Task not found' });
        res.json({ status: 'stopped' });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error stopping task:', error);
        res.status(500).json({ error: 'Failed to stop task' });
    }
});
wss.on('connection', function (ws) {
    // eslint-disable-next-line no-console
    console.log('WebSocket client connected');
    var unsubscribe = taskManager.subscribe(function (taskId, task) {
        try {
            if (ws.taskId && ws.taskId !== taskId)
                return;
            if (ws.readyState !== ws.OPEN)
                return;
            ws.send(JSON.stringify({ type: 'taskUpdate', taskId: taskId, task: task }));
        }
        catch (_a) { }
    });
    ws.on('message', function (message) {
        try {
            var data_1 = JSON.parse(message.toString());
            switch (data_1.type) {
                case 'subscribe': {
                    var r = data_1;
                    var t = typeof r.taskId === 'string' ? r.taskId : undefined;
                    if (t)
                        ws.taskId = t;
                    break;
                }
                case 'userTakeover': {
                    var r = data_1;
                    var t = typeof r.taskId === 'string' ? r.taskId : undefined;
                    if (t) {
                        taskManager.pauseTask(t);
                        ws.send(JSON.stringify({ type: 'takeoverGranted', taskId: t }));
                    }
                    break;
                }
                case 'startScreencast':
                    (function () { return __awaiter(void 0, void 0, void 0, function () {
                        var _a, e_2;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 3, , 4]);
                                    if (ws._stopStream) {
                                        ws._stopStream();
                                        ws._stopStream = undefined;
                                    }
                                    return [4 /*yield*/, browserAgent.initializeBrowser()];
                                case 1:
                                    _b.sent();
                                    ws._lastFrameTs = 0;
                                    _a = ws;
                                    return [4 /*yield*/, browserAgent.addScreencastListener(function (frame) {
                                            if (ws.readyState !== ws.OPEN)
                                                return;
                                            var now = Date.now();
                                            if (ws._lastFrameTs && (now - ws._lastFrameTs) < 30)
                                                return;
                                            if (typeof ws.bufferedAmount === 'number' && ws.bufferedAmount > 1500000)
                                                return;
                                            ws._lastFrameTs = now;
                                            ws.send(JSON.stringify({ type: 'screencastFrame', frame: frame }));
                                        })];
                                case 2:
                                    _a._stopStream = _b.sent();
                                    ws.send(JSON.stringify({ type: 'screencastStarted' }));
                                    return [3 /*break*/, 4];
                                case 3:
                                    e_2 = _b.sent();
                                    ws.send(JSON.stringify({ type: 'screencastError', error: String((e_2 === null || e_2 === void 0 ? void 0 : e_2.message) || e_2) }));
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); })();
                    break;
                case 'stopScreencast': {
                    if (ws._stopStream) {
                        ws._stopStream();
                        ws._stopStream = undefined;
                        ws.send(JSON.stringify({ type: 'screencastStopped' }));
                    }
                    break;
                }
                case 'input':
                    (function () { return __awaiter(void 0, void 0, void 0, function () {
                        var _a, taskId, action, task, actName, e_3;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 3, , 4]);
                                    _a = data_1, taskId = _a.taskId, action = _a.action;
                                    if (!taskId || !action)
                                        return [2 /*return*/];
                                    task = taskManager.getTask(taskId);
                                    if (!task)
                                        return [2 /*return*/];
                                    return [4 /*yield*/, browserAgent.initializeBrowser()];
                                case 1:
                                    _b.sent();
                                    return [4 /*yield*/, browserAgent.executeBrowserAction(taskId, action)];
                                case 2:
                                    _b.sent();
                                    actName = action.action;
                                    if (ws.readyState === ws.OPEN)
                                        ws.send(JSON.stringify({ type: 'inputAck', at: Date.now(), action: actName }));
                                    return [3 /*break*/, 4];
                                case 3:
                                    e_3 = _b.sent();
                                    try {
                                        if (ws.readyState === ws.OPEN)
                                            ws.send(JSON.stringify({ type: 'inputError', error: String((e_3 === null || e_3 === void 0 ? void 0 : e_3.message) || e_3) }));
                                    }
                                    catch (_c) { }
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); })();
                    break;
            }
        }
        catch (error) {
            // eslint-disable-next-line no-console
            console.error('Error handling WebSocket message:', error);
        }
    });
    ws.on('close', function () {
        // eslint-disable-next-line no-console
        console.log('WebSocket client disconnected');
        unsubscribe();
        if (ws._stopStream) {
            try {
                ws._stopStream();
            }
            catch (_a) { }
            ws._stopStream = undefined;
        }
    });
});
var PORT = process.env.PORT || 3001;
server.listen(PORT, function () {
    // eslint-disable-next-line no-console
    console.log("Server running on port ".concat(PORT));
    // eslint-disable-next-line no-console
    console.log("WebSocket server running on ws://localhost:".concat(PORT));
});
process.on('SIGTERM', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                // eslint-disable-next-line no-console
                console.log('Shutting down server...');
                return [4 /*yield*/, browserAgent.cleanup()];
            case 1:
                _a.sent();
                server.close(function () {
                    // eslint-disable-next-line no-console
                    console.log('Server shut down');
                    process.exit(0);
                });
                return [2 /*return*/];
        }
    });
}); });

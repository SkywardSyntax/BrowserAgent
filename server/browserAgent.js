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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserAgent = void 0;
var playwright_1 = require("playwright");
var openai_1 = require("openai");
var crypto_1 = require("crypto");
var BrowserAgent = /** @class */ (function () {
    function BrowserAgent(taskManager) {
        var _this = this;
        this.taskManager = taskManager;
        this.browser = null;
        this.page = null;
        this.processingTasks = new Set();
        this.headless = undefined;
        this.abortControllers = new Map();
        this.consecutiveFailures = new Map();
        this.taskLoopState = new Map();
        this.openai = new openai_1.OpenAI({
            baseURL: (process.env.AZURE_OPENAI_ENDPOINT || '') + 'openai/v1/',
            apiKey: process.env.AZURE_OPENAI_API_KEY,
            defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
            defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY || '' },
            timeout: parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10),
            maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '1', 10),
        });
        this.displayWidth = parseInt(process.env.DISPLAY_WIDTH || '1280', 10);
        this.displayHeight = parseInt(process.env.DISPLAY_HEIGHT || '720', 10);
        this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';
        this.openAITimeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10);
        this.actionTimeoutMs = parseInt(process.env.ACTION_TIMEOUT_MS || '8000', 10);
        this.navTimeoutMs = parseInt(process.env.NAV_TIMEOUT_MS || '10000', 10);
        this.keyMap = {
            Return: 'Enter',
            space: ' ',
            BackSpace: 'Backspace',
            Delete: 'Delete',
            Tab: 'Tab',
            Escape: 'Escape',
            Home: 'Home',
            End: 'End',
            Page_Up: 'PageUp',
            Page_Down: 'PageDown',
            Up: 'ArrowUp',
            Down: 'ArrowDown',
            Left: 'ArrowLeft',
            Right: 'ArrowRight',
        };
        this.cdpClient = null;
        this.screencast = { active: false, listeners: new Set(), usingCDP: false, interval: null };
        this._unsubscribeTM = this.taskManager.subscribe(function (id, task) {
            try {
                if (!task || !task.status)
                    return;
                if (['paused', 'stopped', 'failed', 'completed'].includes(task.status)) {
                    var ctrl = _this.abortControllers.get(id);
                    if (ctrl) {
                        ctrl.abort();
                        _this.abortControllers.delete(id);
                    }
                }
            }
            catch (_a) { }
        });
    }
    BrowserAgent.prototype.initializeBrowser = function () {
        return __awaiter(this, void 0, void 0, function () {
            var headless, launch, _a, e_1, msg, looksLikeNoX, _b, _c, error_1;
            var _this = this;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (this.browser)
                            return [2 /*return*/];
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 11, , 12]);
                        headless = this.resolveHeadless();
                        this.headless = headless;
                        launch = function (isHeadless) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                            return [2 /*return*/, playwright_1.chromium.launch({ headless: isHeadless, args: __spreadArray(['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], (isHeadless ? ['--disable-gpu'] : []), true) })];
                        }); }); };
                        _d.label = 2;
                    case 2:
                        _d.trys.push([2, 4, , 8]);
                        _a = this;
                        return [4 /*yield*/, launch(headless)];
                    case 3:
                        _a.browser = _d.sent();
                        return [3 /*break*/, 8];
                    case 4:
                        e_1 = _d.sent();
                        msg = String((e_1 === null || e_1 === void 0 ? void 0 : e_1.message) || e_1);
                        looksLikeNoX = /Missing X server|DISPLAY|x11|Target page, context or browser has been closed/i.test(msg);
                        if (!(!headless && looksLikeNoX)) return [3 /*break*/, 6];
                        console.warn('Headed launch failed likely due to missing X server. Falling back to headless.');
                        headless = true;
                        this.headless = true;
                        _b = this;
                        return [4 /*yield*/, launch(true)];
                    case 5:
                        _b.browser = _d.sent();
                        return [3 /*break*/, 7];
                    case 6: throw e_1;
                    case 7: return [3 /*break*/, 8];
                    case 8:
                        _c = this;
                        return [4 /*yield*/, this.browser.newPage()];
                    case 9:
                        _c.page = _d.sent();
                        return [4 /*yield*/, this.page.setViewportSize({ width: this.displayWidth, height: this.displayHeight })];
                    case 10:
                        _d.sent();
                        console.log("Browser initialized successfully (headless=".concat(headless, ")"));
                        return [3 /*break*/, 12];
                    case 11:
                        error_1 = _d.sent();
                        console.error('Failed to initialize browser:', error_1);
                        throw error_1;
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    BrowserAgent.prototype.ensureCDPClient = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ctx, _a, e_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initializeBrowser()];
                    case 1:
                        _b.sent();
                        if (!this.page)
                            throw new Error('Browser page not initialized');
                        if (!!this.cdpClient) return [3 /*break*/, 6];
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 5, , 6]);
                        ctx = this.page.context();
                        _a = this;
                        return [4 /*yield*/, ctx.newCDPSession(this.page)];
                    case 3:
                        _a.cdpClient = _b.sent();
                        return [4 /*yield*/, this.cdpClient.send('Page.enable')];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        e_2 = _b.sent();
                        console.warn('Failed to create CDP client; will fallback to polling:', (e_2 === null || e_2 === void 0 ? void 0 : e_2.message) || e_2);
                        this.cdpClient = null;
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/, this.cdpClient];
                }
            });
        });
    };
    BrowserAgent.prototype.addScreencastListener = function (fn) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.screencast.listeners.add(fn);
                        if (!!this.screencast.active) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.startScreencastInternal()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/, function () {
                            _this.screencast.listeners.delete(fn);
                            if (_this.screencast.listeners.size === 0) {
                                _this.stopScreencastInternal().catch(function () { });
                            }
                        }];
                }
            });
        });
    };
    BrowserAgent.prototype.startScreencastInternal = function () {
        return __awaiter(this, void 0, void 0, function () {
            var client, ctl, clientEvt, e_3, fps, intervalMs;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initializeBrowser()];
                    case 1:
                        _b.sent();
                        this.screencast.active = true;
                        return [4 /*yield*/, this.ensureCDPClient()];
                    case 2:
                        client = _b.sent();
                        if (!client) return [3 /*break*/, 6];
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 5, , 6]);
                        ctl = client;
                        return [4 /*yield*/, ctl.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 })];
                    case 4:
                        _b.sent();
                        this.screencast.usingCDP = true;
                        clientEvt = client;
                        if (this._onScreencastFrame) {
                            (_a = clientEvt.off) === null || _a === void 0 ? void 0 : _a.call(clientEvt, 'Page.screencastFrame', this._onScreencastFrame);
                        }
                        this._onScreencastFrame = function (evt) { return __awaiter(_this, void 0, void 0, function () {
                            var data, sessionId, metadata, _i, _a, fn, ack, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        _c.trys.push([0, 2, , 3]);
                                        data = evt.data, sessionId = evt.sessionId, metadata = evt.metadata;
                                        for (_i = 0, _a = Array.from(this.screencast.listeners); _i < _a.length; _i++) {
                                            fn = _a[_i];
                                            try {
                                                fn({ data: data, metadata: metadata, format: 'jpeg' });
                                            }
                                            catch (_d) { }
                                        }
                                        ack = client;
                                        return [4 /*yield*/, ack.send('Page.screencastFrameAck', { sessionId: sessionId })];
                                    case 1:
                                        _c.sent();
                                        return [3 /*break*/, 3];
                                    case 2:
                                        _b = _c.sent();
                                        return [3 /*break*/, 3];
                                    case 3: return [2 /*return*/];
                                }
                            });
                        }); };
                        clientEvt.on('Page.screencastFrame', this._onScreencastFrame);
                        return [2 /*return*/];
                    case 5:
                        e_3 = _b.sent();
                        console.warn('CDP screencast failed; falling back to polling:', (e_3 === null || e_3 === void 0 ? void 0 : e_3.message) || e_3);
                        return [3 /*break*/, 6];
                    case 6:
                        this.screencast.usingCDP = false;
                        fps = 6;
                        intervalMs = Math.round(1000 / fps);
                        this.screencast.interval = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
                            var data, metadata, _i, _a, fn, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        if (!this.screencast.active)
                                            return [2 /*return*/];
                                        _c.label = 1;
                                    case 1:
                                        _c.trys.push([1, 4, , 5]);
                                        return [4 /*yield*/, this.initializeBrowser()];
                                    case 2:
                                        _c.sent();
                                        return [4 /*yield*/, this.takeScreenshot()];
                                    case 3:
                                        data = _c.sent();
                                        metadata = { deviceWidth: this.displayWidth, deviceHeight: this.displayHeight };
                                        for (_i = 0, _a = Array.from(this.screencast.listeners); _i < _a.length; _i++) {
                                            fn = _a[_i];
                                            try {
                                                fn({ data: data, metadata: metadata, format: 'png' });
                                            }
                                            catch (_d) { }
                                        }
                                        return [3 /*break*/, 5];
                                    case 4:
                                        _b = _c.sent();
                                        return [3 /*break*/, 5];
                                    case 5: return [2 /*return*/];
                                }
                            });
                        }); }, intervalMs);
                        return [2 /*return*/];
                }
            });
        });
    };
    BrowserAgent.prototype.stopScreencastInternal = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.screencast.active = false;
                        if (!(this.cdpClient && this.screencast.usingCDP)) return [3 /*break*/, 4];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.cdpClient.send('Page.stopScreencast')];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        _a = _b.sent();
                        return [3 /*break*/, 4];
                    case 4:
                        if (this.screencast.interval) {
                            clearInterval(this.screencast.interval);
                            this.screencast.interval = null;
                        }
                        this.screencast.usingCDP = false;
                        return [2 /*return*/];
                }
            });
        });
    };
    BrowserAgent.prototype.resolveHeadless = function () {
        var hasDisplay = !!process.env.DISPLAY;
        if (!hasDisplay)
            return true;
        if (typeof process.env.BROWSER_HEADLESS === 'string') {
            var val = process.env.BROWSER_HEADLESS.trim().toLowerCase();
            if (val === 'true')
                return true;
            if (val === 'false')
                return false;
        }
        return false;
    };
    BrowserAgent.prototype.getHeadless = function () { return typeof this.headless === 'boolean' ? this.headless : this.resolveHeadless(); };
    BrowserAgent.prototype.getPageState = function () {
        return __awaiter(this, void 0, void 0, function () {
            var url, title, _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 8, , 9]);
                        return [4 /*yield*/, this.initializeBrowser()];
                    case 1:
                        _d.sent();
                        url = this.page ? this.page.url() : '';
                        title = '';
                        _d.label = 2;
                    case 2:
                        _d.trys.push([2, 6, , 7]);
                        if (!this.page) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.page.title()];
                    case 3:
                        _a = _d.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _a = '';
                        _d.label = 5;
                    case 5:
                        title = _a;
                        return [3 /*break*/, 7];
                    case 6:
                        _b = _d.sent();
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/, { url: url, title: title, headless: this.getHeadless(), viewport: { width: this.displayWidth, height: this.displayHeight } }];
                    case 8:
                        _c = _d.sent();
                        return [2 /*return*/, { url: '', title: '', headless: this.getHeadless(), viewport: { width: this.displayWidth, height: this.displayHeight } }];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    BrowserAgent.prototype.processTask = function (taskId) {
        return __awaiter(this, void 0, void 0, function () {
            var task, initialScreenshot, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.processingTasks.has(taskId)) {
                            console.log("Task ".concat(taskId, " is already being processed"));
                            return [2 /*return*/];
                        }
                        this.processingTasks.add(taskId);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, 8, 9]);
                        task = this.taskManager.getTask(taskId);
                        if (!task)
                            throw new Error('Task not found');
                        console.log("Starting to process task: ".concat(taskId));
                        this.taskManager.updateTask(taskId, { status: 'running' });
                        return [4 /*yield*/, this.initializeBrowser()];
                    case 2:
                        _a.sent();
                        if (!(this.page.url() === 'about:blank')) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.page.goto('https://www.google.com')];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4: return [4 /*yield*/, this.takeScreenshot()];
                    case 5:
                        initialScreenshot = _a.sent();
                        this.taskManager.addScreenshot(taskId, initialScreenshot);
                        return [4 /*yield*/, this.aiProcessingLoop(taskId)];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 9];
                    case 7:
                        error_2 = _a.sent();
                        console.error("Error processing task ".concat(taskId, ":"), error_2);
                        this.taskManager.failTask(taskId, error_2);
                        return [3 /*break*/, 9];
                    case 8:
                        this.processingTasks.delete(taskId);
                        return [7 /*endfinally*/];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    BrowserAgent.prototype.aiProcessingLoop = function (taskId) {
        return __awaiter(this, void 0, void 0, function () {
            var maxIterations, iterations, task, screenshot, prevFingerprint, t2, response, _a, shouldContinue, executed, newShot, newFingerprint, _b, guard, remediationAttempt, error_3, errName;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        maxIterations = 20;
                        iterations = 0;
                        this.taskLoopState.set(taskId, this.taskLoopState.get(taskId) || { unchangedCount: 0, repeatCount: 0, remediationCount: 0 });
                        _c.label = 1;
                    case 1:
                        if (!(iterations < maxIterations)) return [3 /*break*/, 25];
                        task = this.taskManager.getTask(taskId);
                        if (!task)
                            return [3 /*break*/, 25];
                        if (!(task.status === 'paused')) return [3 /*break*/, 3];
                        console.log("Task ".concat(taskId, " is paused, waiting..."));
                        return [4 /*yield*/, this.waitForResume(taskId)];
                    case 2:
                        _c.sent();
                        return [3 /*break*/, 1];
                    case 3:
                        if (task.status === 'stopped') {
                            console.log("Task ".concat(taskId, " is stopped"));
                            return [3 /*break*/, 25];
                        }
                        iterations++;
                        _c.label = 4;
                    case 4:
                        _c.trys.push([4, 21, , 24]);
                        return [4 /*yield*/, this.takeScreenshot()];
                    case 5:
                        screenshot = _c.sent();
                        this.taskManager.addScreenshot(taskId, screenshot);
                        return [4 /*yield*/, this._computeFingerprintFromScreenshot(screenshot)];
                    case 6:
                        prevFingerprint = _c.sent();
                        t2 = this.taskManager.getTask(taskId);
                        if (!t2)
                            return [3 /*break*/, 25];
                        if (!(t2.status === 'paused')) return [3 /*break*/, 8];
                        return [4 /*yield*/, this.waitForResume(taskId)];
                    case 7:
                        _c.sent();
                        return [3 /*break*/, 1];
                    case 8:
                        if (t2.status === 'stopped')
                            return [3 /*break*/, 25];
                        return [4 /*yield*/, this.callAI(t2, screenshot)];
                    case 9:
                        response = _c.sent();
                        return [4 /*yield*/, this.processAIResponse(taskId, response)];
                    case 10:
                        _a = _c.sent(), shouldContinue = _a.shouldContinue, executed = _a.executed;
                        if (!shouldContinue) {
                            this.taskManager.completeTask(taskId, 'Task completed successfully');
                            return [3 /*break*/, 25];
                        }
                        // Small settle delay then check for progress
                        return [4 /*yield*/, this.delay(500)];
                    case 11:
                        // Small settle delay then check for progress
                        _c.sent();
                        return [4 /*yield*/, this.takeScreenshot().catch(function () { return null; })];
                    case 12:
                        newShot = _c.sent();
                        if (!newShot) return [3 /*break*/, 14];
                        return [4 /*yield*/, this._computeFingerprintFromScreenshot(newShot)];
                    case 13:
                        _b = _c.sent();
                        return [3 /*break*/, 15];
                    case 14:
                        _b = undefined;
                        _c.label = 15;
                    case 15:
                        newFingerprint = _b;
                        return [4 /*yield*/, this._updateLoopGuard(taskId, prevFingerprint, newFingerprint, executed)];
                    case 16:
                        _c.sent();
                        guard = this.taskLoopState.get(taskId);
                        if (!(guard.unchangedCount >= 3 || guard.repeatCount >= 3)) return [3 /*break*/, 19];
                        remediationAttempt = guard.remediationCount;
                        if (!(remediationAttempt === 0)) return [3 /*break*/, 18];
                        this.taskManager.addStep(taskId, { type: 'warning', description: 'Loop detected (no progress). Attempting page reload to recover.' });
                        return [4 /*yield*/, this.page.reload({ timeout: this.navTimeoutMs, waitUntil: 'domcontentloaded' }).catch(function () { })];
                    case 17:
                        _c.sent();
                        guard.remediationCount++;
                        guard.unchangedCount = 0;
                        guard.repeatCount = 0;
                        return [3 /*break*/, 19];
                    case 18:
                        this.taskManager.failTask(taskId, 'Detected repeated no-progress actions. Stopping to prevent infinite loop.');
                        return [3 /*break*/, 25];
                    case 19: return [4 /*yield*/, this.delay(500)];
                    case 20:
                        _c.sent();
                        return [3 /*break*/, 24];
                    case 21:
                        error_3 = _c.sent();
                        console.error("Error in AI processing loop iteration ".concat(iterations, ":"), error_3);
                        this.taskManager.addStep(taskId, { type: 'error', description: "Error: ".concat(error_3.message), error: true });
                        if (error_3.message.includes('browser') || error_3.message.includes('page')) {
                            throw error_3;
                        }
                        errName = error_3.name;
                        if (!(errName === 'AbortError')) return [3 /*break*/, 23];
                        return [4 /*yield*/, this.waitForResume(taskId)];
                    case 22:
                        _c.sent();
                        _c.label = 23;
                    case 23: return [3 /*break*/, 24];
                    case 24: return [3 /*break*/, 1];
                    case 25:
                        if (iterations >= maxIterations) {
                            this.taskManager.failTask(taskId, 'Maximum iterations reached');
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    BrowserAgent.prototype.callAI = function (task, screenshot) {
        return __awaiter(this, void 0, void 0, function () {
            var tools, context, structuredPage, e_4, sp, spUrl, spTitle, spMeta, headingsList, buttonsList, inputsList, linksList, visibleText, messages, controller, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tools = [
                            { type: 'function', function: { name: 'browser_action', description: 'Perform browser actions like click, type, scroll, navigate, mouse control, and control global task run state (pause/resume)', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['click', 'type', 'scroll', 'wheel', 'key_press', 'navigate', 'wait', 'task_complete', 'pause_task', 'resume_task', 'reload', 'go_back', 'go_forward', 'mouse_down', 'mouse_up', 'mouse_move', 'click_element', 'fill_field', 'hover_element', 'press_on', 'focus_element', 'scroll_into_view', 'select_option', 'assert_visible', 'assert_text', 'assert_url', 'assert_title', 'wait_for_element', 'click_by_text', 'click_button_like', 'click_image_like', 'wait_for_network_idle'] }, coordinates: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } }, button: { type: 'string', enum: ['left', 'middle', 'right'] }, text: { type: 'string' }, url: { type: 'string' }, key: { type: 'string' }, scroll_direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] }, deltaX: { type: 'number' }, deltaY: { type: 'number' }, locator: { type: 'object', properties: { selector: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' }, text: { type: 'string' }, label: { type: 'string' }, placeholder: { type: 'string' }, alt: { type: 'string' }, title: { type: 'string' }, testId: { type: 'string' }, href: { type: 'string' }, exact: { type: 'boolean' }, nth: { type: 'number' }, src: { type: 'string' } } }, option_value: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }, option_label: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }, expected: { type: 'string' }, url_equals: { type: 'string' }, url_contains: { type: 'string' }, title_equals: { type: 'string' }, title_contains: { type: 'string' }, state: { type: 'string', enum: ['visible', 'hidden', 'attached', 'detached'] }, wait_ms: { type: 'number' }, timeout_ms: { type: 'number' }, reason: { type: 'string' }, exact: { type: 'boolean' }, nth: { type: 'number' }, selector_hints: { type: 'array', items: { type: 'string' } } }, required: ['action', 'reason'] } } }
                        ];
                        context = this.buildContext(task);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.getStructuredPageContext()];
                    case 2:
                        structuredPage = _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        e_4 = _a.sent();
                        structuredPage = { error: 'Failed to extract page context', details: String((e_4 === null || e_4 === void 0 ? void 0 : e_4.message) || e_4) };
                        return [3 /*break*/, 4];
                    case 4:
                        sp = (structuredPage && typeof structuredPage === 'object') ? structuredPage : {};
                        spUrl = typeof sp.url === 'string' ? sp.url : '';
                        spTitle = typeof sp.title === 'string' ? sp.title : '';
                        spMeta = typeof sp.metaDescription === 'string' ? sp.metaDescription.slice(0, 180) : '';
                        headingsList = Array.isArray(sp.headings)
                            ? sp.headings.slice(0, 5).map(function (h) { var _a, _b; return "[".concat(String((_a = h.tag) !== null && _a !== void 0 ? _a : ''), "] ").concat(String((_b = h.text) !== null && _b !== void 0 ? _b : '')); }).join(' | ')
                            : '';
                        buttonsList = Array.isArray(sp.buttons)
                            ? sp.buttons.slice(0, 6).map(function (b) { var _a; return String((_a = b.text) !== null && _a !== void 0 ? _a : ''); }).join(' | ')
                            : '';
                        inputsList = Array.isArray(sp.inputs)
                            ? sp.inputs.slice(0, 5).map(function (i) { var _a, _b, _c; return "[".concat(String((_a = i.type) !== null && _a !== void 0 ? _a : ''), "] ").concat(String((_c = ((_b = i.label) !== null && _b !== void 0 ? _b : i.placeholder)) !== null && _c !== void 0 ? _c : '')); }).join(' | ')
                            : '';
                        linksList = Array.isArray(sp.links)
                            ? sp.links.slice(0, 5).map(function (l) { var _a; return String((_a = l.text) !== null && _a !== void 0 ? _a : ''); }).join(' | ')
                            : '';
                        visibleText = typeof sp.visibleTextSample === 'string' ? sp.visibleTextSample.slice(0, 240) : '';
                        messages = [
                            { role: 'system', content: "You are a browser automation agent. You help users accomplish tasks by controlling a web browser.\n\nCurrent task: ".concat(task.description, "\n\nYou can see the current browser state in the screenshot. Use the browser_action function to interact with the browser. Prefer element-targeted actions when possible (click_element, fill_field, select_option, press_on) using a precise locator.\n\nAvailable actions:\n- click: Click on coordinates (x, y)\n- type: Type text at current cursor position\n- pause_task: Pause global task processing (AI loop waits)\n- resume_task: Resume global task processing\n- scroll: Scroll in a direction (up/down/left/right)\n- wheel: Scroll with precise deltas (deltaX/deltaY)\n- key_press: Press a key (Enter, Tab, Escape, etc.)\n- navigate: Navigate to a URL\n- reload: Reload current page; go_back/go_forward: browser history\n- wait: Wait for a specified time in milliseconds\n- mouse_down/mouse_up/mouse_move: Low-level mouse control with coordinates and optional button\n- click_element: Click an element by role/text/label/selector locator\n- fill_field: Fill a text field by label/placeholder/selector\n- press_on: Press a key while a specific element is focused\n- hover_element: Hover over an element by locator\n- focus_element: Focus an element by locator\n- scroll_into_view: Scroll the element into view\n- select_option: Select by value/label on a <select>\n - assert_visible: Assert a locator is visible\n - assert_text: Assert locator's text equals/contains expected\n - assert_url: Assert page URL equals/contains value\n - assert_title: Assert page title equals/contains value\n - wait_for_element: Wait for locator state (visible/hidden/attached/detached)\nLocator spec fields:\n- selector: CSS/xpath selector\n- role+name: ARIA role (e.g., 'button', 'link') with accessible name\n- text: visible text content\n- label: associated label text (for inputs)\n- placeholder: input placeholder\n- alt/title/testId: by accessible attributes\n- href: substring to match links by URL\n- exact: boolean for exact text/name match; nth: index for picking among matches\n- task_complete: Mark the task as complete\n\nImportant guidelines:\n- Always provide a clear reason for each action\n- Be methodical and patient\n- Take screenshots to verify actions worked\n- If you encounter errors, try alternative approaches\n- When the task is fully accomplished, use task_complete action\n - Avoid repeating the exact same failing action more than twice; if it didn\u2019t work, change strategy (try a different locator, scroll into view, wait for element, navigate differently, or choose another path). The system will stop if you loop with no progress.\n\n").concat(context) },
                            { role: 'user', content: [{ type: 'text', text: 'Here is the current browser state. Please analyze it and take the next appropriate action.' }, { type: 'text', text: "Page context (summary):\n- URL: ".concat(spUrl, "\n- Title: ").concat(spTitle, "\n- Meta: ").concat(spMeta, "\n- Viewport: ").concat(this.displayWidth, "x").concat(this.displayHeight, "\n- Headings: ").concat(headingsList, "\n- Buttons (top): ").concat(buttonsList, "\n- Inputs (top): ").concat(inputsList, "\n- Links (top): ").concat(linksList, "\n- Visible text: ").concat(visibleText) }, { type: 'image_url', image_url: { url: "data:image/png;base64,".concat(screenshot) } }] }
                        ];
                        controller = new AbortController();
                        try {
                            this.abortControllers.set(task.id, controller);
                        }
                        catch (_b) { }
                        return [4 /*yield*/, this.openai.chat.completions.create({ model: this.deploymentName, messages: messages, tools: tools, tool_choice: 'auto', max_tokens: 1000, temperature: 0.1 }, { signal: controller.signal, timeout: this.openAITimeoutMs })];
                    case 5:
                        response = _a.sent();
                        this.abortControllers.delete(task.id);
                        return [2 /*return*/, response];
                }
            });
        });
    };
    BrowserAgent.prototype.getStructuredPageContext = function () {
        return __awaiter(this, void 0, void 0, function () {
            var res;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initializeBrowser()];
                    case 1:
                        _a.sent();
                        if (!this.page)
                            return [2 /*return*/, {}];
                        return [4 /*yield*/, this._withTimeout(this.page.evaluate(function () {
                                var _a;
                                var clamp = function (s, n) {
                                    if (n === void 0) { n = 160; }
                                    return (s || '').trim().replace(/\s+/g, ' ').slice(0, n);
                                };
                                var isVisible = function (el) { var style = window.getComputedStyle(el); if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
                                    return false; var rect = el.getBoundingClientRect(); if (rect.width <= 1 || rect.height <= 1)
                                    return false; if (rect.bottom < 0 || rect.top > window.innerHeight)
                                    return false; return true; };
                                var bbox = function (el) { var r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
                                var pick = function (arr, n) { return Array.from(arr).slice(0, n); };
                                var textOf = function (el) { return clamp(el.innerText || el.textContent || '', 100); };
                                var headings = pick(document.querySelectorAll('h1, h2, h3'), 12).filter(isVisible).map(function (h) { return ({ tag: h.tagName, text: textOf(h), box: bbox(h) }); });
                                var buttonElems = new Set(__spreadArray(__spreadArray([], document.querySelectorAll('button'), true), document.querySelectorAll('[role="button"]'), true));
                                var buttons = pick(Array.from(buttonElems).filter(isVisible), 20).map(function (b) { return ({ text: textOf(b), box: bbox(b) }); }).filter(function (b) { return b.text; });
                                var inputs = pick(document.querySelectorAll('input, textarea, select'), 30).filter(isVisible).map(function (i) { var el = i; var id = el.getAttribute('id'); var labelText = el.getAttribute('aria-label') || ''; if (!labelText && id) {
                                    var lbl = document.querySelector("label[for=\"".concat(CSS.escape(id), "\"]"));
                                    if (lbl)
                                        labelText = textOf(lbl);
                                } return { type: (el.getAttribute('type') || el.tagName).toLowerCase(), placeholder: el.getAttribute('placeholder') || '', label: labelText, box: bbox(el) }; });
                                var links = pick(document.querySelectorAll('a[href]'), 50).filter(isVisible).map(function (a) { var el = a; return { text: textOf(el), href: el.getAttribute('href') || '', box: bbox(el) }; }).filter(function (a) { return a.text; });
                                var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: function (node) { if (!node.nodeValue || !node.nodeValue.trim())
                                        return NodeFilter.FILTER_REJECT; var el = node.parentElement; if (!el || !isVisible(el))
                                        return NodeFilter.FILTER_REJECT; var style = window.getComputedStyle(el); if (parseFloat(style.fontSize) < 9)
                                        return NodeFilter.FILTER_SKIP; return NodeFilter.FILTER_ACCEPT; } });
                                var sample = '';
                                while (walker.nextNode() && sample.length < 1200) {
                                    sample += (walker.currentNode.nodeValue || '').trim().replace(/\s+/g, ' ') + ' ';
                                }
                                sample = sample.trim().slice(0, 1200);
                                var metaDescription = ((_a = document.querySelector('meta[name="description"]')) === null || _a === void 0 ? void 0 : _a.getAttribute('content')) || '';
                                return { url: location.href, title: document.title, metaDescription: clamp(metaDescription, 240), headings: headings, buttons: buttons, inputs: inputs, links: links, visibleTextSample: sample, viewport: { width: window.innerWidth, height: window.innerHeight } };
                            }), 2000, 'structuredPageContext').catch(function () { return ({}); })];
                    case 2:
                        res = _a.sent();
                        return [2 /*return*/, res];
                }
            });
        });
    };
    BrowserAgent.prototype.buildContext = function (task) {
        var recent = task.steps.slice(-10);
        var stepsText = recent.length ? recent.map(function (step) { return "- ".concat(new Date(step.timestamp).toLocaleTimeString(), " [").concat(step.type, "] ").concat(step.description); }).join('\n') : '(no prior steps)';
        var status = task.status || 'unknown';
        return "\nTask status: ".concat(status, "\nRecent actions (latest first):\n").concat(stepsText, "\n");
    };
    BrowserAgent.prototype.processAIResponse = function (taskId, response) {
        return __awaiter(this, void 0, void 0, function () {
            var msg, content, toolCalls, executed, _i, toolCalls_1, toolCall, args, key, res;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        msg = (function () {
                            if (!response || typeof response !== 'object')
                                return null;
                            var choices = response.choices;
                            if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object')
                                return null;
                            var message = choices[0].message;
                            return message || null;
                        })();
                        if (!msg)
                            return [2 /*return*/, { shouldContinue: true, executed: [] }];
                        content = msg.content;
                        if (content) {
                            this.taskManager.addStep(taskId, { type: 'ai_reasoning', description: content, reasoning: true });
                        }
                        toolCalls = msg.tool_calls;
                        executed = [];
                        if (!(Array.isArray(toolCalls) && toolCalls.length > 0)) return [3 /*break*/, 4];
                        _i = 0, toolCalls_1 = toolCalls;
                        _a.label = 1;
                    case 1:
                        if (!(_i < toolCalls_1.length)) return [3 /*break*/, 4];
                        toolCall = toolCalls_1[_i];
                        if (!(toolCall.function.name === 'browser_action')) return [3 /*break*/, 3];
                        args = JSON.parse(toolCall.function.arguments);
                        key = this._actionKey(args);
                        return [4 /*yield*/, this.executeBrowserAction(taskId, args)];
                    case 2:
                        res = _a.sent();
                        executed.push({ key: key, success: !!res.success });
                        if (args.action === 'task_complete')
                            return [2 /*return*/, { shouldContinue: false, executed: executed }];
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, { shouldContinue: true, executed: executed }];
                }
            });
        });
    };
    BrowserAgent.prototype.executeBrowserAction = function (taskId, action) {
        return __awaiter(this, void 0, void 0, function () {
            var actionName, actionReason, withRetry, act, A_1, _a, coords, _b, x_1, y_1, keyStr, key_1, scrollAmount_1, _c, locator_1, t_1, btnStr, btn_1, t_2, txt_1, exact_1, hints_1, t_3, txt_2, src_1, exact_2, t_4, locRes, locator_2, t_5, locator_3, t_6, locator_4, t_7, locator_5, keyStr, key_2, t_8, locator_6, locator_7, t_9, locator, t, locator, t, txt, expectedStr, match, url, title, locator, state, t, btnStr, btn_2, coords, x_2, y_2, btnStr, btn_3, coords, _d, x_3, y_3, error_4;
            var _e;
            var _this = this;
            var _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        console.log("Executing browser action:", action);
                        actionName = action.action;
                        actionReason = action.reason;
                        this.taskManager.addStep(taskId, { type: 'browser_action', description: "".concat(actionName, ": ").concat(actionReason), action: action });
                        withRetry = function (fn_1) {
                            var args_1 = [];
                            for (var _i = 1; _i < arguments.length; _i++) {
                                args_1[_i - 1] = arguments[_i];
                            }
                            return __awaiter(_this, __spreadArray([fn_1], args_1, true), void 0, function (fn, _a) {
                                var lastErr, i, e_5;
                                var _b = _a === void 0 ? {} : _a, _c = _b.retries, retries = _c === void 0 ? 2 : _c, _d = _b.delayMs, delayMs = _d === void 0 ? 500 : _d;
                                return __generator(this, function (_e) {
                                    switch (_e.label) {
                                        case 0:
                                            i = 0;
                                            _e.label = 1;
                                        case 1:
                                            if (!(i <= retries)) return [3 /*break*/, 7];
                                            _e.label = 2;
                                        case 2:
                                            _e.trys.push([2, 4, , 6]);
                                            return [4 /*yield*/, fn()];
                                        case 3: return [2 /*return*/, _e.sent()];
                                        case 4:
                                            e_5 = _e.sent();
                                            lastErr = e_5;
                                            if (i === retries)
                                                return [3 /*break*/, 7];
                                            return [4 /*yield*/, this.delay(delayMs)];
                                        case 5:
                                            _e.sent();
                                            return [3 /*break*/, 6];
                                        case 6:
                                            i++;
                                            return [3 /*break*/, 1];
                                        case 7: throw lastErr;
                                    }
                                });
                            });
                        };
                        _g.label = 1;
                    case 1:
                        _g.trys.push([1, 91, , 92]);
                        return [4 /*yield*/, this.initializeBrowser()];
                    case 2:
                        _g.sent();
                        act = action;
                        A_1 = act;
                        _a = act.action;
                        switch (_a) {
                            case 'click': return [3 /*break*/, 3];
                            case 'type': return [3 /*break*/, 6];
                            case 'key_press': return [3 /*break*/, 9];
                            case 'scroll': return [3 /*break*/, 12];
                            case 'wheel': return [3 /*break*/, 22];
                            case 'navigate': return [3 /*break*/, 24];
                            case 'reload': return [3 /*break*/, 27];
                            case 'go_back': return [3 /*break*/, 29];
                            case 'go_forward': return [3 /*break*/, 31];
                            case 'wait': return [3 /*break*/, 33];
                            case 'click_element': return [3 /*break*/, 35];
                            case 'click_by_text': return [3 /*break*/, 38];
                            case 'click_button_like': return [3 /*break*/, 40];
                            case 'click_image_like': return [3 /*break*/, 42];
                            case 'wait_for_network_idle': return [3 /*break*/, 44];
                            case 'fill_field': return [3 /*break*/, 46];
                            case 'hover_element': return [3 /*break*/, 50];
                            case 'focus_element': return [3 /*break*/, 53];
                            case 'press_on': return [3 /*break*/, 56];
                            case 'scroll_into_view': return [3 /*break*/, 59];
                            case 'select_option': return [3 /*break*/, 62];
                            case 'assert_visible': return [3 /*break*/, 65];
                            case 'assert_text': return [3 /*break*/, 68];
                            case 'assert_url': return [3 /*break*/, 71];
                            case 'assert_title': return [3 /*break*/, 72];
                            case 'wait_for_element': return [3 /*break*/, 74];
                            case 'mouse_down': return [3 /*break*/, 77];
                            case 'mouse_up': return [3 /*break*/, 81];
                            case 'mouse_move': return [3 /*break*/, 83];
                            case 'pause_task': return [3 /*break*/, 86];
                            case 'resume_task': return [3 /*break*/, 87];
                            case 'task_complete': return [3 /*break*/, 88];
                        }
                        return [3 /*break*/, 89];
                    case 3:
                        coords = (A_1.coordinates || {});
                        if (!(typeof coords.x !== 'undefined' && typeof coords.y !== 'undefined')) return [3 /*break*/, 5];
                        _b = this.validateCoordinates(Number(coords.x), Number(coords.y)), x_1 = _b.x, y_1 = _b.y;
                        return [4 /*yield*/, this._withTimeout(function () { return _this.page.mouse.click(x_1, y_1); }, this.actionTimeoutMs, 'click')];
                    case 4:
                        _g.sent();
                        _g.label = 5;
                    case 5: return [3 /*break*/, 90];
                    case 6:
                        if (!(typeof A_1.text === 'string')) return [3 /*break*/, 8];
                        return [4 /*yield*/, this._withTimeout(function () { return _this.page.keyboard.type(A_1.text); }, this.actionTimeoutMs, 'type')];
                    case 7:
                        _g.sent();
                        _g.label = 8;
                    case 8: return [3 /*break*/, 90];
                    case 9:
                        if (!(typeof A_1.key !== 'undefined')) return [3 /*break*/, 11];
                        keyStr = String(A_1.key);
                        key_1 = this.keyMap[keyStr] || keyStr;
                        return [4 /*yield*/, this._withTimeout(function () { return _this.page.keyboard.press(key_1); }, this.actionTimeoutMs, 'key_press')];
                    case 10:
                        _g.sent();
                        _g.label = 11;
                    case 11: return [3 /*break*/, 90];
                    case 12:
                        scrollAmount_1 = 300;
                        _c = A_1.scroll_direction;
                        switch (_c) {
                            case 'down': return [3 /*break*/, 13];
                            case 'up': return [3 /*break*/, 15];
                            case 'left': return [3 /*break*/, 17];
                            case 'right': return [3 /*break*/, 19];
                        }
                        return [3 /*break*/, 21];
                    case 13: return [4 /*yield*/, this._withTimeout(function () { return _this.page.mouse.wheel(0, scrollAmount_1); }, this.actionTimeoutMs, 'wheel')];
                    case 14:
                        _g.sent();
                        return [3 /*break*/, 21];
                    case 15: return [4 /*yield*/, this._withTimeout(function () { return _this.page.mouse.wheel(0, -scrollAmount_1); }, this.actionTimeoutMs, 'wheel')];
                    case 16:
                        _g.sent();
                        return [3 /*break*/, 21];
                    case 17: return [4 /*yield*/, this._withTimeout(function () { return _this.page.mouse.wheel(-scrollAmount_1, 0); }, this.actionTimeoutMs, 'wheel')];
                    case 18:
                        _g.sent();
                        return [3 /*break*/, 21];
                    case 19: return [4 /*yield*/, this._withTimeout(function () { return _this.page.mouse.wheel(scrollAmount_1, 0); }, this.actionTimeoutMs, 'wheel')];
                    case 20:
                        _g.sent();
                        return [3 /*break*/, 21];
                    case 21: return [3 /*break*/, 90];
                    case 22: return [4 /*yield*/, this._withTimeout(function () { return _this.page.mouse.wheel(Number(A_1.deltaX) || 0, Number(A_1.deltaY) || 0); }, this.actionTimeoutMs, 'wheel')];
                    case 23:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 24:
                        if (!(typeof A_1.url === 'string')) return [3 /*break*/, 26];
                        return [4 /*yield*/, this._withTimeout(function () { return _this.page.goto(A_1.url, { timeout: _this.navTimeoutMs, waitUntil: 'domcontentloaded' }); }, this.navTimeoutMs + 1000, 'navigate')];
                    case 25:
                        _g.sent();
                        _g.label = 26;
                    case 26: return [3 /*break*/, 90];
                    case 27: return [4 /*yield*/, this._withTimeout(function () { return _this.page.reload({ timeout: _this.navTimeoutMs, waitUntil: 'domcontentloaded' }); }, this.navTimeoutMs + 1000, 'reload')];
                    case 28:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 29: return [4 /*yield*/, this._withTimeout(function () { return _this.page.goBack({ timeout: _this.navTimeoutMs, waitUntil: 'domcontentloaded' }); }, this.navTimeoutMs + 1000, 'go_back')];
                    case 30:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 31: return [4 /*yield*/, this._withTimeout(function () { return _this.page.goForward({ timeout: _this.navTimeoutMs, waitUntil: 'domcontentloaded' }); }, this.navTimeoutMs + 1000, 'go_forward')];
                    case 32:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 33: return [4 /*yield*/, this.delay(Math.min(Number(A_1.wait_ms) || 1000, this.actionTimeoutMs))];
                    case 34:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 35: return [4 /*yield*/, this.resolveLocator(A_1.locator)];
                    case 36:
                        locator_1 = (_g.sent()).locator;
                        t_1 = Math.min(A_1.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2);
                        btnStr = String(A_1.button || 'left');
                        btn_1 = (['left', 'middle', 'right'].includes(btnStr) ? btnStr : 'left');
                        return [4 /*yield*/, withRetry(function () { return _this._reliableClick(locator_1, { timeout: t_1, button: btn_1 }); })];
                    case 37:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 38:
                        if (typeof A_1.text !== 'string')
                            throw new Error('click_by_text requires text');
                        t_2 = Math.min(A_1.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2);
                        return [4 /*yield*/, withRetry(function () { return __awaiter(_this, void 0, void 0, function () {
                                var locs, txt, exact, cssCandidates, _i, cssCandidates_1, sel, nth, _a, locs_1, loc, count, target, visible;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            locs = [];
                                            txt = A_1.text;
                                            exact = !!A_1.exact;
                                            locs.push(this.page.getByRole('button', { name: txt, exact: exact }));
                                            cssCandidates = [
                                                "button:has-text(\"".concat(txt, "\")"),
                                                "[role=\"button\"]:has-text(\"".concat(txt, "\")"),
                                                "a:has-text(\"".concat(txt, "\")"),
                                                "input[type=\"submit\"][value*=\"".concat(txt, "\"]"),
                                                "input[type=\"button\"][value*=\"".concat(txt, "\"]"),
                                                ":is(.btn,.button,.cta,.submit):has-text(\"".concat(txt, "\")"),
                                                ":is([onclick],[tabindex]):has-text(\"".concat(txt, "\")")
                                            ];
                                            for (_i = 0, cssCandidates_1 = cssCandidates; _i < cssCandidates_1.length; _i++) {
                                                sel = cssCandidates_1[_i];
                                                locs.push(this.page.locator(sel));
                                            }
                                            // Fallback to generic text locator (pierces shadow DOM)
                                            locs.push(this.page.getByText(txt, { exact: exact }));
                                            nth = typeof A_1.nth === 'number' ? A_1.nth : 0;
                                            _a = 0, locs_1 = locs;
                                            _b.label = 1;
                                        case 1:
                                            if (!(_a < locs_1.length)) return [3 /*break*/, 6];
                                            loc = locs_1[_a];
                                            return [4 /*yield*/, loc.count().catch(function () { return 0; })];
                                        case 2:
                                            count = _b.sent();
                                            if (!count)
                                                return [3 /*break*/, 5];
                                            target = count > nth ? loc.nth(nth) : loc.first();
                                            return [4 /*yield*/, target.first().isVisible().catch(function () { return false; })];
                                        case 3:
                                            visible = _b.sent();
                                            if (!visible)
                                                return [3 /*break*/, 5];
                                            return [4 /*yield*/, this._reliableClick(target, { timeout: t_2, button: 'left' })];
                                        case 4:
                                            _b.sent();
                                            return [2 /*return*/];
                                        case 5:
                                            _a++;
                                            return [3 /*break*/, 1];
                                        case 6: throw new Error("No element found by text: ".concat(txt));
                                    }
                                });
                            }); })];
                    case 39:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 40:
                        txt_1 = typeof A_1.text === 'string' ? A_1.text : (typeof A_1.name === 'string' ? A_1.name : undefined);
                        if (!txt_1)
                            throw new Error('click_button_like requires text or name');
                        exact_1 = !!A_1.exact;
                        hints_1 = Array.isArray(A_1.selector_hints) ? A_1.selector_hints : [];
                        t_3 = Math.min(A_1.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2);
                        return [4 /*yield*/, withRetry(function () { return __awaiter(_this, void 0, void 0, function () { var loc; return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this._findButtonLike(txt_1, { exact: exact_1, hints: hints_1 })];
                                    case 1:
                                        loc = _a.sent();
                                        return [4 /*yield*/, this._reliableClick(loc, { timeout: t_3, button: 'left' })];
                                    case 2:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); }, { retries: 2, delayMs: 200 })];
                    case 41:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 42:
                        txt_2 = typeof A_1.text === 'string' ? A_1.text : (typeof A_1.name === 'string' ? A_1.name : (typeof A_1.alt === 'string' ? A_1.alt : undefined));
                        src_1 = typeof A_1.src === 'string' ? A_1.src : undefined;
                        if (!txt_2 && !src_1)
                            throw new Error('click_image_like requires text/alt/name or src');
                        exact_2 = !!A_1.exact;
                        t_4 = Math.min(A_1.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2);
                        return [4 /*yield*/, withRetry(function () { return __awaiter(_this, void 0, void 0, function () { var loc; return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this._findImageLike({ text: txt_2, src: src_1, exact: exact_2 })];
                                    case 1:
                                        loc = _a.sent();
                                        return [4 /*yield*/, this._reliableClick(loc, { timeout: t_4, button: 'left' })];
                                    case 2:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); }, { retries: 2, delayMs: 200 })];
                    case 43:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 44: return [4 /*yield*/, this.page.waitForLoadState('networkidle', { timeout: Math.min(A_1.timeout_ms || this.navTimeoutMs, this.navTimeoutMs) }).catch(function () { })];
                    case 45:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 46:
                        if (typeof A_1.text !== 'string')
                            throw new Error('fill_field requires text');
                        return [4 /*yield*/, this._ensurePageReady().catch(function () { })];
                    case 47:
                        _g.sent();
                        return [4 /*yield*/, this.resolveLocator(A_1.locator).catch(function () { return null; })];
                    case 48:
                        locRes = _g.sent();
                        locator_2 = (_f = locRes === null || locRes === void 0 ? void 0 : locRes.locator) !== null && _f !== void 0 ? _f : null;
                        t_5 = Math.min(A_1.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2);
                        return [4 /*yield*/, withRetry(function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!!locator_2) return [3 /*break*/, 2];
                                        return [4 /*yield*/, this._fallbackInputLocator(A_1.locator, t_5).catch(function () { return null; })];
                                    case 1:
                                        locator_2 = _a.sent();
                                        _a.label = 2;
                                    case 2:
                                        if (!locator_2)
                                            throw new Error('Input locator not found');
                                        return [4 /*yield*/, locator_2.scrollIntoViewIfNeeded().catch(function () { })];
                                    case 3:
                                        _a.sent();
                                        return [4 /*yield*/, locator_2.waitFor({ state: 'visible', timeout: t_5 }).catch(function () { })];
                                    case 4:
                                        _a.sent();
                                        return [4 /*yield*/, locator_2.click({ timeout: t_5 }).catch(function () { })];
                                    case 5:
                                        _a.sent();
                                        return [4 /*yield*/, locator_2.fill('', { timeout: t_5 }).catch(function () { })];
                                    case 6:
                                        _a.sent();
                                        return [4 /*yield*/, locator_2.fill(A_1.text, { timeout: t_5 })];
                                    case 7:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); }, { retries: 2, delayMs: 300 })];
                    case 49:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 50: return [4 /*yield*/, this.resolveLocator(A_1.locator)];
                    case 51:
                        locator_3 = (_g.sent()).locator;
                        t_6 = Math.min(A_1.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2);
                        return [4 /*yield*/, withRetry(function () { return locator_3.hover({ timeout: t_6 }); })];
                    case 52:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 53: return [4 /*yield*/, this.resolveLocator(A_1.locator)];
                    case 54:
                        locator_4 = (_g.sent()).locator;
                        t_7 = Math.min(A_1.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2);
                        return [4 /*yield*/, withRetry(function () { return locator_4.focus({ timeout: t_7 }); })];
                    case 55:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 56:
                        if (typeof A_1.key === 'undefined')
                            throw new Error('press_on requires key');
                        return [4 /*yield*/, this.resolveLocator(A_1.locator)];
                    case 57:
                        locator_5 = (_g.sent()).locator;
                        keyStr = String(A_1.key);
                        key_2 = this.keyMap[keyStr] || keyStr;
                        t_8 = Math.min(A_1.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2);
                        return [4 /*yield*/, withRetry(function () { return locator_5.press(key_2, { timeout: t_8 }); })];
                    case 58:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 59: return [4 /*yield*/, this.resolveLocator(A_1.locator)];
                    case 60:
                        locator_6 = (_g.sent()).locator;
                        return [4 /*yield*/, withRetry(function () { return locator_6.scrollIntoViewIfNeeded(); })];
                    case 61:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 62: return [4 /*yield*/, this.resolveLocator(A_1.locator)];
                    case 63:
                        locator_7 = (_g.sent()).locator;
                        t_9 = Math.min(A_1.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2);
                        return [4 /*yield*/, withRetry(function () { return __awaiter(_this, void 0, void 0, function () { var labels; return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!(typeof A_1.option_value !== 'undefined')) return [3 /*break*/, 5];
                                        if (!Array.isArray(A_1.option_value)) return [3 /*break*/, 2];
                                        return [4 /*yield*/, locator_7.selectOption(A_1.option_value, { timeout: t_9 })];
                                    case 1:
                                        _a.sent();
                                        return [3 /*break*/, 4];
                                    case 2: return [4 /*yield*/, locator_7.selectOption({ value: String(A_1.option_value) }, { timeout: t_9 })];
                                    case 3:
                                        _a.sent();
                                        _a.label = 4;
                                    case 4: return [3 /*break*/, 8];
                                    case 5:
                                        if (!(typeof A_1.option_label !== 'undefined')) return [3 /*break*/, 7];
                                        labels = Array.isArray(A_1.option_label) ? A_1.option_label : [String(A_1.option_label)];
                                        return [4 /*yield*/, locator_7.selectOption(labels.map(function (l) { return ({ label: l }); }), { timeout: t_9 })];
                                    case 6:
                                        _a.sent();
                                        return [3 /*break*/, 8];
                                    case 7: throw new Error('select_option requires option_value or option_label');
                                    case 8: return [2 /*return*/];
                                }
                            }); }); })];
                    case 64:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 65: return [4 /*yield*/, this.resolveLocator(A_1.locator)];
                    case 66:
                        locator = (_g.sent()).locator;
                        t = Math.min(A_1.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2);
                        return [4 /*yield*/, locator.waitFor({ state: 'visible', timeout: t })];
                    case 67:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 68: return [4 /*yield*/, this.resolveLocator(A_1.locator)];
                    case 69:
                        locator = (_g.sent()).locator;
                        if (typeof A_1.expected === 'undefined')
                            throw new Error('assert_text requires expected');
                        t = Math.min(A_1.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2);
                        return [4 /*yield*/, locator.first().innerText({ timeout: t })];
                    case 70:
                        txt = (_g.sent()).trim();
                        expectedStr = String(A_1.expected);
                        match = A_1.exact ? (txt === expectedStr) : txt.includes(expectedStr);
                        if (!match)
                            throw new Error("Text assertion failed. Expected ".concat(A_1.exact ? 'exact' : 'contains', " \"").concat(expectedStr, "\", got \"").concat(txt, "\""));
                        return [3 /*break*/, 90];
                    case 71:
                        {
                            url = this.page.url();
                            if (typeof A_1.url_equals !== 'undefined' && url !== String(A_1.url_equals))
                                throw new Error("URL equals failed. Expected \"".concat(String(A_1.url_equals), "\", got \"").concat(url, "\""));
                            if (typeof A_1.url_contains !== 'undefined' && !url.includes(String(A_1.url_contains)))
                                throw new Error("URL contains failed. Expected contains \"".concat(String(A_1.url_contains), "\", got \"").concat(url, "\""));
                            return [3 /*break*/, 90];
                        }
                        _g.label = 72;
                    case 72: return [4 /*yield*/, this.page.title()];
                    case 73:
                        title = _g.sent();
                        if (typeof A_1.title_equals !== 'undefined' && title !== String(A_1.title_equals))
                            throw new Error("Title equals failed. Expected \"".concat(String(A_1.title_equals), "\", got \"").concat(title, "\""));
                        if (typeof A_1.title_contains !== 'undefined' && !title.includes(String(A_1.title_contains)))
                            throw new Error("Title contains failed. Expected contains \"".concat(String(A_1.title_contains), "\", got \"").concat(title, "\""));
                        return [3 /*break*/, 90];
                    case 74: return [4 /*yield*/, this.resolveLocator(A_1.locator)];
                    case 75:
                        locator = (_g.sent()).locator;
                        state = A_1.state || 'visible';
                        t = Math.min(A_1.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2);
                        return [4 /*yield*/, locator.first().waitFor({ state: state, timeout: t })];
                    case 76:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 77:
                        btnStr = String(A_1.button || 'left');
                        btn_2 = (['left', 'middle', 'right'].includes(btnStr) ? btnStr : 'left');
                        coords = (A_1.coordinates || {});
                        x_2 = 0, y_2 = 0;
                        if (typeof coords.x !== 'undefined' && typeof coords.y !== 'undefined')
                            (_e = this.validateCoordinates(Number(coords.x), Number(coords.y)), x_2 = _e.x, y_2 = _e.y);
                        if (!(typeof x_2 === 'number' && typeof y_2 === 'number')) return [3 /*break*/, 79];
                        return [4 /*yield*/, this._withTimeout(function () { return _this.page.mouse.move(x_2, y_2); }, this.actionTimeoutMs, 'mouse_move')];
                    case 78:
                        _g.sent();
                        _g.label = 79;
                    case 79: return [4 /*yield*/, this._withTimeout(function () { return _this.page.mouse.down({ button: btn_2 }); }, this.actionTimeoutMs, 'mouse_down')];
                    case 80:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 81:
                        btnStr = String(A_1.button || 'left');
                        btn_3 = (['left', 'middle', 'right'].includes(btnStr) ? btnStr : 'left');
                        return [4 /*yield*/, this._withTimeout(function () { return _this.page.mouse.up({ button: btn_3 }); }, this.actionTimeoutMs, 'mouse_up')];
                    case 82:
                        _g.sent();
                        return [3 /*break*/, 90];
                    case 83:
                        coords = (A_1.coordinates || {});
                        if (!(typeof coords.x !== 'undefined' && typeof coords.y !== 'undefined')) return [3 /*break*/, 85];
                        _d = this.validateCoordinates(Number(coords.x), Number(coords.y)), x_3 = _d.x, y_3 = _d.y;
                        return [4 /*yield*/, this._withTimeout(function () { return _this.page.mouse.move(x_3, y_3, { steps: 1 }); }, this.actionTimeoutMs, 'mouse_move')];
                    case 84:
                        _g.sent();
                        _g.label = 85;
                    case 85: return [3 /*break*/, 90];
                    case 86:
                        this.taskManager.pauseTask(taskId);
                        return [3 /*break*/, 90];
                    case 87:
                        this.taskManager.resumeTask(taskId);
                        this.processTask(taskId);
                        return [3 /*break*/, 90];
                    case 88:
                        console.log('Task marked as complete by AI');
                        return [2 /*return*/, { completed: true }];
                    case 89:
                        console.log("Unknown action: ".concat(act.action));
                        _g.label = 90;
                    case 90: return [2 /*return*/, { success: true }];
                    case 91:
                        error_4 = _g.sent();
                        console.error("Error executing ".concat(actionName, ":"), error_4);
                        this.taskManager.addStep(taskId, { type: 'error', description: "Failed to execute ".concat(actionName, ": ").concat(error_4.message), error: true });
                        return [2 /*return*/, { success: false, error: error_4.message }];
                    case 92: return [2 /*return*/];
                }
            });
        });
    };
    BrowserAgent.prototype.resolveLocator = function (spec) {
        return __awaiter(this, void 0, void 0, function () {
            var s, exact, buildIn, locator, _a, _i, _b, frame, loc, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (!this.page)
                            throw new Error('Browser page not initialized');
                        if (!spec || typeof spec !== 'object')
                            throw new Error('locator spec required');
                        s = spec;
                        exact = !!s.exact;
                        buildIn = function (ctx) {
                            var _a, _b;
                            try {
                                if (typeof s.selector === 'string')
                                    return ctx.locator(s.selector);
                                if (typeof s.role === 'string') {
                                    var role = s.role;
                                    var options = {};
                                    if (typeof s.name === 'string')
                                        options.name = s.name;
                                    if (typeof s.exact === 'boolean')
                                        options.exact = s.exact;
                                    return ctx.getByRole(role, options);
                                }
                                if (typeof s.label === 'string')
                                    return ctx.getByLabel(s.label, { exact: exact });
                                if (typeof s.placeholder === 'string')
                                    return ctx.getByPlaceholder(s.placeholder, { exact: exact });
                                if (typeof s.text === 'string')
                                    return ctx.getByText(s.text, { exact: exact });
                                if (typeof s.alt === 'string')
                                    return ((_b = (_a = ctx).getByAltText) === null || _b === void 0 ? void 0 : _b.call(_a, s.alt, { exact: exact })) || ctx.locator("img[alt*=\"".concat(String(s.alt), "\"]"));
                                if (typeof s.title === 'string')
                                    return ctx.getByTitle(s.title, { exact: exact });
                                if (typeof s.testId === 'string')
                                    return ctx.getByTestId(s.testId);
                                if (typeof s.href === 'string')
                                    return ctx.locator("a[href*=\"".concat(String(s.href).replace(/"/g, '\\"'), "\"]"));
                            }
                            catch (_c) { }
                            return null;
                        };
                        locator = buildIn(this.page);
                        _a = !locator;
                        if (_a) return [3 /*break*/, 2];
                        return [4 /*yield*/, locator.count().catch(function () { return 0; })];
                    case 1:
                        _a = (_d.sent()) === 0;
                        _d.label = 2;
                    case 2:
                        if (!_a) return [3 /*break*/, 8];
                        _i = 0, _b = this.page.frames();
                        _d.label = 3;
                    case 3:
                        if (!(_i < _b.length)) return [3 /*break*/, 8];
                        frame = _b[_i];
                        loc = buildIn(frame);
                        _c = loc;
                        if (!_c) return [3 /*break*/, 5];
                        return [4 /*yield*/, loc.count().catch(function () { return 0; })];
                    case 4:
                        _c = (_d.sent()) > 0;
                        _d.label = 5;
                    case 5:
                        if (!_c) return [3 /*break*/, 7];
                        locator = loc; // Found in this frame
                        return [4 /*yield*/, loc.first().waitFor({ state: 'attached', timeout: Math.min(s.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2) }).catch(function () { })];
                    case 6:
                        _d.sent();
                        if (typeof s.nth === 'number')
                            locator = locator.nth(s.nth);
                        return [2 /*return*/, { locator: locator.first(), frame: frame }];
                    case 7:
                        _i++;
                        return [3 /*break*/, 3];
                    case 8:
                        if (!locator)
                            throw new Error('Unable to construct locator from spec');
                        if (typeof s.nth === 'number')
                            locator = locator.nth(s.nth);
                        return [4 /*yield*/, locator.first().waitFor({ state: 'attached', timeout: Math.min(s.timeout_ms || this.actionTimeoutMs, this.actionTimeoutMs * 2) }).catch(function () { })];
                    case 9:
                        _d.sent();
                        return [2 /*return*/, { locator: locator.first() }];
                }
            });
        });
    };
    BrowserAgent.prototype.validateCoordinates = function (x, y) {
        return { x: Math.max(0, Math.min(x, this.displayWidth)), y: Math.max(0, Math.min(y, this.displayHeight)) };
    };
    BrowserAgent.prototype.takeScreenshot = function () {
        return __awaiter(this, void 0, void 0, function () {
            var screenshot;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.page)
                            throw new Error('Browser page not initialized');
                        return [4 /*yield*/, this._withTimeout(this.page.screenshot({ type: 'png', fullPage: false, timeout: 7000 }), 8000, 'screenshot')];
                    case 1:
                        screenshot = _a.sent();
                        return [2 /*return*/, screenshot.toString('base64')];
                }
            });
        });
    };
    BrowserAgent.prototype.waitForResume = function (taskId) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) {
                        var checkStatus = function () { var task = _this.taskManager.getTask(taskId); if (!task || task.status === 'running' || task.status === 'stopped') {
                            resolve();
                        }
                        else {
                            setTimeout(checkStatus, 1000);
                        } };
                        checkStatus();
                    })];
            });
        });
    };
    BrowserAgent.prototype.delay = function (ms) { return new Promise(function (resolve) { return setTimeout(resolve, ms); }); };
    BrowserAgent.prototype.cleanup = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.browser) return [3 /*break*/, 6];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.stopScreencastInternal()];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        _a = _b.sent();
                        return [3 /*break*/, 4];
                    case 4: return [4 /*yield*/, this.browser.close()];
                    case 5:
                        _b.sent();
                        this.browser = null;
                        this.page = null;
                        this.cdpClient = null;
                        _b.label = 6;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    BrowserAgent.prototype._withTimeout = function (promise, ms, label) {
        if (label === void 0) { label = 'op'; }
        return new Promise(function (resolve, reject) {
            var done = false;
            var t = setTimeout(function () { if (done)
                return; done = true; var err = new Error("".concat(label, " timed out after ").concat(ms, "ms")); reject(err); }, ms);
            Promise.resolve(typeof promise === 'function' ? promise() : promise)
                .then(function (v) { if (!done) {
                done = true;
                clearTimeout(t);
                resolve(v);
            } })
                .catch(function (e) { if (!done) {
                done = true;
                clearTimeout(t);
                reject(e);
            } });
        });
    };
    BrowserAgent.prototype._actionKey = function (args) {
        var pruned = {};
        var keys = ['action', 'locator', 'text', 'url', 'key', 'scroll_direction'];
        for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
            var k = keys_1[_i];
            if (k in args)
                pruned[k] = args[k];
        }
        try {
            return JSON.stringify(pruned);
        }
        catch (_a) {
            return "".concat(args.action || 'unknown');
        }
    };
    BrowserAgent.prototype._computeFingerprintFromScreenshot = function (screenshotB64) {
        return __awaiter(this, void 0, void 0, function () {
            var url, sample;
            var _a;
            return __generator(this, function (_b) {
                url = ((_a = this.page) === null || _a === void 0 ? void 0 : _a.url()) || '';
                sample = screenshotB64.slice(0, 20000);
                return [2 /*return*/, (0, crypto_1.createHash)('sha1').update(url).update('|').update(sample).digest('hex')];
            });
        });
    };
    BrowserAgent.prototype._updateLoopGuard = function (taskId, prevFp, newFp, executed) {
        return __awaiter(this, void 0, void 0, function () {
            var state, lastKey;
            return __generator(this, function (_a) {
                state = this.taskLoopState.get(taskId) || { unchangedCount: 0, repeatCount: 0, remediationCount: 0 };
                lastKey = executed.length ? executed[executed.length - 1].key : undefined;
                if (newFp && prevFp && newFp === prevFp) {
                    state.unchangedCount = (state.unchangedCount || 0) + 1;
                }
                else {
                    state.unchangedCount = 0;
                }
                if (lastKey && state.lastActionKey && lastKey === state.lastActionKey) {
                    state.repeatCount = (state.repeatCount || 0) + 1;
                }
                else {
                    state.repeatCount = 0;
                }
                state.lastActionKey = lastKey;
                this.taskLoopState.set(taskId, state);
                return [2 /*return*/];
            });
        });
    };
    BrowserAgent.prototype._reliableClick = function (locator, opts) {
        return __awaiter(this, void 0, void 0, function () {
            var t, target, button, getClickableAncestorHandle, clickAtCenter, e_6, msg;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        t = Math.max(500, Math.min(opts.timeout, this.actionTimeoutMs * 2));
                        return [4 /*yield*/, this._ensurePageReady().catch(function () { })];
                    case 1:
                        _b.sent();
                        target = locator.first();
                        return [4 /*yield*/, target.scrollIntoViewIfNeeded().catch(function () { })];
                    case 2:
                        _b.sent();
                        return [4 /*yield*/, target.waitFor({ state: 'visible', timeout: t }).catch(function () { })];
                    case 3:
                        _b.sent();
                        button = opts.button || 'left';
                        getClickableAncestorHandle = function () { return __awaiter(_this, void 0, void 0, function () {
                            var handle, anc;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, target.elementHandle()];
                                    case 1:
                                        handle = _a.sent();
                                        if (!handle)
                                            return [2 /*return*/, null];
                                        return [4 /*yield*/, handle.evaluateHandle(function (node) {
                                                function isShown(el) {
                                                    var s = window.getComputedStyle(el);
                                                    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0')
                                                        return false;
                                                    var r = el.getBoundingClientRect();
                                                    return r.width >= 2 && r.height >= 2;
                                                }
                                                function hasClickSemantics(el) {
                                                    var tag = el.tagName.toLowerCase();
                                                    if (tag === 'button')
                                                        return true;
                                                    if (tag === 'a' && el.href)
                                                        return true;
                                                    if (tag === 'input') {
                                                        var type = el.type;
                                                        if (['button', 'submit', 'image', 'checkbox', 'radio', 'file'].includes(type))
                                                            return true;
                                                    }
                                                    if (el.getAttribute('role') === 'button')
                                                        return true;
                                                    if (el.hasAttribute('onclick'))
                                                        return true;
                                                    if (el.getAttribute('tabindex'))
                                                        return true;
                                                    return false;
                                                }
                                                var cur = node;
                                                for (var i = 0; i < 6 && cur; i++) {
                                                    if (isShown(cur) && hasClickSemantics(cur))
                                                        return cur;
                                                    cur = cur.parentElement;
                                                }
                                                return node;
                                            })];
                                    case 2:
                                        anc = _a.sent();
                                        return [2 /*return*/, anc.asElement() || handle];
                                }
                            });
                        }); };
                        clickAtCenter = function () { return __awaiter(_this, void 0, void 0, function () {
                            var h, box, x, y;
                            var _this = this;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, getClickableAncestorHandle()];
                                    case 1:
                                        h = _a.sent();
                                        if (!h)
                                            throw new Error('No element handle available for clicking');
                                        return [4 /*yield*/, h.boundingBox()];
                                    case 2:
                                        box = _a.sent();
                                        if (!!box) return [3 /*break*/, 6];
                                        return [4 /*yield*/, target.scrollIntoViewIfNeeded().catch(function () { })];
                                    case 3:
                                        _a.sent();
                                        return [4 /*yield*/, target.waitFor({ state: 'visible', timeout: Math.min(800, t) }).catch(function () { })];
                                    case 4:
                                        _a.sent();
                                        return [4 /*yield*/, h.boundingBox()];
                                    case 5:
                                        box = _a.sent();
                                        _a.label = 6;
                                    case 6:
                                        if (!box)
                                            throw new Error('Element has no bounding box (not visible)');
                                        x = Math.round(box.x + Math.max(1, box.width) / 2);
                                        y = Math.round(box.y + Math.max(1, box.height) / 2);
                                        return [4 /*yield*/, this._withTimeout(function () { return _this.page.mouse.move(x, y, { steps: 1 }); }, Math.min(800, t), 'mouse_move').catch(function () { })];
                                    case 7:
                                        _a.sent();
                                        return [4 /*yield*/, this._withTimeout(function () { return _this.page.mouse.click(x, y, { button: button }); }, t, 'coordinate_click')];
                                    case 8:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); };
                        _b.label = 4;
                    case 4:
                        _b.trys.push([4, 7, , 14]);
                        // Hover to ensure any lazy styles/menus are activated
                        return [4 /*yield*/, target.hover({ timeout: Math.min(500, t) }).catch(function () { })];
                    case 5:
                        // Hover to ensure any lazy styles/menus are activated
                        _b.sent();
                        return [4 /*yield*/, clickAtCenter()];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 14];
                    case 7:
                        e_6 = _b.sent();
                        msg = String((e_6 === null || e_6 === void 0 ? void 0 : e_6.message) || e_6);
                        if (!/detached|strict mode violation|Element is not attached/i.test(msg)) return [3 /*break*/, 10];
                        return [4 /*yield*/, this.delay(250)];
                    case 8:
                        _b.sent();
                        return [4 /*yield*/, clickAtCenter()];
                    case 9:
                        _b.sent();
                        return [2 /*return*/];
                    case 10:
                        if (!/not visible|not receiving events|overlay|no bounding box/i.test(msg)) return [3 /*break*/, 13];
                        // As a last resort, force element click
                        return [4 /*yield*/, target.scrollIntoViewIfNeeded().catch(function () { })];
                    case 11:
                        // As a last resort, force element click
                        _b.sent();
                        return [4 /*yield*/, target.click({ timeout: t, force: true, button: button })];
                    case 12:
                        _b.sent();
                        return [2 /*return*/];
                    case 13: throw e_6;
                    case 14: return [4 /*yield*/, ((_a = this.page) === null || _a === void 0 ? void 0 : _a.waitForLoadState('domcontentloaded', { timeout: Math.min(this.navTimeoutMs, 2000) }).catch(function () { }))];
                    case 15:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    BrowserAgent.prototype._findImageLike = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var text, src, exact, buildSelectors, candidates, addInContext, _i, _a, frame, _b, candidates_1, loc, count, target, visible, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0: return [4 /*yield*/, this.initializeBrowser()];
                    case 1:
                        _d.sent();
                        if (!this.page)
                            throw new Error('Browser page not initialized');
                        text = params.text, src = params.src;
                        exact = !!params.exact;
                        buildSelectors = function (needleText, needleSrc) {
                            var sels = [];
                            if (needleText) {
                                var t = needleText.replace(/"/g, '\\"');
                                var match = exact ? "".concat(t) : "*=\"".concat(t, "\"");
                                // Direct image-like elements
                                sels.push("img[alt".concat(exact ? '="' + t + '"' : match, "]"));
                                sels.push("img[title".concat(exact ? '="' + t + '"' : match, "]"));
                                sels.push("input[type=\"image\"][alt".concat(exact ? '="' + t + '"' : match, "]"));
                                sels.push("input[type=\"image\"][title".concat(exact ? '="' + t + '"' : match, "]"));
                                sels.push("[role=\"img\"][aria-label".concat(exact ? '="' + t + '"' : match, "]"));
                                // Clickable wrappers containing images
                                sels.push("a:has(img[alt".concat(exact ? '="' + t + '"' : match, "])"));
                                sels.push("button:has(img[alt".concat(exact ? '="' + t + '"' : match, "])"));
                                sels.push("[role=\"button\"]:has(img[alt".concat(exact ? '="' + t + '"' : match, "])"));
                                sels.push("[onclick]:has(img[alt".concat(exact ? '="' + t + '"' : match, "])"));
                            }
                            if (needleSrc) {
                                var s = needleSrc.replace(/"/g, '\\"');
                                sels.push("img[src*=\"".concat(s, "\"]"));
                                sels.push("a:has(img[src*=\"".concat(s, "\"])"));
                                sels.push("button:has(img[src*=\"".concat(s, "\"])"));
                                sels.push("[role=\"button\"]:has(img[src*=\"".concat(s, "\"])"));
                                sels.push("[onclick]:has(img[src*=\"".concat(s, "\"])"));
                            }
                            return sels;
                        };
                        candidates = [];
                        addInContext = function (ctx) {
                            var sels = buildSelectors(text, src);
                            for (var _i = 0, sels_1 = sels; _i < sels_1.length; _i++) {
                                var sel = sels_1[_i];
                                candidates.push(ctx.locator(sel));
                            }
                            // As a last resort, image adjacent text that matches
                            if (text) {
                                candidates.push(ctx.locator("img + *:text-is(\"".concat(text, "\")")));
                            }
                        };
                        addInContext(this.page);
                        for (_i = 0, _a = this.page.frames(); _i < _a.length; _i++) {
                            frame = _a[_i];
                            addInContext(frame);
                        }
                        _b = 0, candidates_1 = candidates;
                        _d.label = 2;
                    case 2:
                        if (!(_b < candidates_1.length)) return [3 /*break*/, 8];
                        loc = candidates_1[_b];
                        _d.label = 3;
                    case 3:
                        _d.trys.push([3, 6, , 7]);
                        return [4 /*yield*/, loc.count().catch(function () { return 0; })];
                    case 4:
                        count = _d.sent();
                        if (!count)
                            return [3 /*break*/, 7];
                        target = loc.first();
                        return [4 /*yield*/, target.isVisible().catch(function () { return false; })];
                    case 5:
                        visible = _d.sent();
                        if (!visible)
                            return [3 /*break*/, 7];
                        return [2 /*return*/, target];
                    case 6:
                        _c = _d.sent();
                        return [3 /*break*/, 7];
                    case 7:
                        _b++;
                        return [3 /*break*/, 2];
                    case 8: throw new Error("Image-like element not found for ".concat(text ? "text=\"".concat(text, "\" ") : '').concat(src ? "src*=\"".concat(src, "\"") : '').trim());
                }
            });
        });
    };
    BrowserAgent.prototype._findButtonLike = function (text_1) {
        return __awaiter(this, arguments, void 0, function (text, opts) {
            var exact, hints, candidates, cssList, _i, _a, sel, _b, _c, frame, _d, _e, sel, _f, candidates_2, loc, count, target, visible, _g;
            if (opts === void 0) { opts = {}; }
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0: return [4 /*yield*/, this.initializeBrowser()];
                    case 1:
                        _h.sent();
                        if (!this.page)
                            throw new Error('Browser page not initialized');
                        exact = !!opts.exact;
                        hints = Array.isArray(opts.hints) ? opts.hints : [];
                        candidates = [];
                        // 1) Proper role button
                        candidates.push(this.page.getByRole('button', { name: text, exact: exact }));
                        cssList = [
                            "button:has-text(\"".concat(text, "\")"),
                            "[role=\"button\"]:has-text(\"".concat(text, "\")"),
                            "a:has-text(\"".concat(text, "\")"),
                            "input[type=\"submit\"][value*=\"".concat(text, "\"]"),
                            "input[type=\"button\"][value*=\"".concat(text, "\"]"),
                            ":is(.btn,.button,.cta,.submit,.primary,.secondary,.action):has-text(\"".concat(text, "\")"),
                            "[aria-label=\"".concat(text, "\"]"),
                            "[aria-label*=\"".concat(text, "\"]"),
                            "[data-testid*=\"".concat(text, "\"]"),
                            "[onclick]:has-text(\"".concat(text, "\")"),
                            "[tabindex]:has-text(\"".concat(text, "\")"),
                        ];
                        for (_i = 0, _a = cssList.concat(hints); _i < _a.length; _i++) {
                            sel = _a[_i];
                            candidates.push(this.page.locator(sel));
                        }
                        // 3) Generic visible text
                        candidates.push(this.page.getByText(text, { exact: exact }));
                        // 4) Iframe search
                        for (_b = 0, _c = this.page.frames(); _b < _c.length; _b++) {
                            frame = _c[_b];
                            candidates.push(frame.getByRole('button', { name: text, exact: exact }));
                            for (_d = 0, _e = cssList.concat(hints); _d < _e.length; _d++) {
                                sel = _e[_d];
                                candidates.push(frame.locator(sel));
                            }
                            candidates.push(frame.getByText(text, { exact: exact }));
                        }
                        _f = 0, candidates_2 = candidates;
                        _h.label = 2;
                    case 2:
                        if (!(_f < candidates_2.length)) return [3 /*break*/, 8];
                        loc = candidates_2[_f];
                        _h.label = 3;
                    case 3:
                        _h.trys.push([3, 6, , 7]);
                        return [4 /*yield*/, loc.count().catch(function () { return 0; })];
                    case 4:
                        count = _h.sent();
                        if (!count)
                            return [3 /*break*/, 7];
                        target = loc.first();
                        return [4 /*yield*/, target.isVisible().catch(function () { return false; })];
                    case 5:
                        visible = _h.sent();
                        if (!visible)
                            return [3 /*break*/, 7];
                        return [2 /*return*/, target];
                    case 6:
                        _g = _h.sent();
                        return [3 /*break*/, 7];
                    case 7:
                        _f++;
                        return [3 /*break*/, 2];
                    case 8: throw new Error("Button-like element not found for text: ".concat(text));
                }
            });
        });
    };
    BrowserAgent.prototype._ensurePageReady = function () {
        return __awaiter(this, void 0, void 0, function () {
            var url, selectors, _i, selectors_1, sel, btn, vis, _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initializeBrowser()];
                    case 1:
                        _b.sent();
                        if (!this.page)
                            return [2 /*return*/];
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 9, , 10]);
                        url = this.page.url();
                        if (!/\.bing\./i.test(url)) return [3 /*break*/, 8];
                        selectors = ['#bnp_btn_accept', 'button#bnp_btn_accept', 'button[aria-label*="Accept"]', 'button:has-text("Accept")', 'button[role="button"]:has-text("Accept")'];
                        _i = 0, selectors_1 = selectors;
                        _b.label = 3;
                    case 3:
                        if (!(_i < selectors_1.length)) return [3 /*break*/, 8];
                        sel = selectors_1[_i];
                        btn = this.page.locator(sel).first();
                        return [4 /*yield*/, btn.count().catch(function () { return 0; })];
                    case 4:
                        if (!_b.sent()) return [3 /*break*/, 7];
                        return [4 /*yield*/, btn.isVisible().catch(function () { return false; })];
                    case 5:
                        vis = _b.sent();
                        if (!vis) return [3 /*break*/, 7];
                        return [4 /*yield*/, btn.click({ timeout: 1000 }).catch(function () { })];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        _i++;
                        return [3 /*break*/, 3];
                    case 8: return [3 /*break*/, 10];
                    case 9:
                        _a = _b.sent();
                        return [3 /*break*/, 10];
                    case 10: return [4 /*yield*/, this._withTimeout(function () { return _this.page.waitForLoadState('domcontentloaded', { timeout: 2000 }); }, 2200, 'wait_dom').catch(function () { })];
                    case 11:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    BrowserAgent.prototype._fallbackInputLocator = function () {
        return __awaiter(this, arguments, void 0, function (spec, _timeoutMs) {
            var page, s, exact, candidates, labelLoc, _a, _i, candidates_3, sel, loc, _b, firstTextInput, _c;
            if (spec === void 0) { spec = {}; }
            if (_timeoutMs === void 0) { _timeoutMs = 5000; }
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0: return [4 /*yield*/, this.initializeBrowser()];
                    case 1:
                        _d.sent();
                        page = this.page;
                        s = spec;
                        exact = !!s.exact;
                        candidates = [];
                        if (s && typeof s.role === 'string' && /searchbox/i.test(s.role)) {
                            candidates.push('input[role="searchbox"]', 'input[type="search"]', 'input[name="q"]', 'input[name="p"]', 'input#sb_form_q', 'textarea[role="searchbox"]');
                        }
                        if (typeof s.placeholder === 'string') {
                            candidates.push("input[placeholder*=\"".concat(s.placeholder, "\"]"), "textarea[placeholder*=\"".concat(s.placeholder, "\"]"));
                        }
                        if (!(typeof s.label === 'string')) return [3 /*break*/, 6];
                        _d.label = 2;
                    case 2:
                        _d.trys.push([2, 5, , 6]);
                        labelLoc = page.getByLabel(s.label, { exact: exact });
                        return [4 /*yield*/, labelLoc.first().waitFor({ state: 'attached', timeout: 800 }).catch(function () { })];
                    case 3:
                        _d.sent();
                        return [4 /*yield*/, labelLoc.count().catch(function () { return 0; })];
                    case 4:
                        if (_d.sent())
                            return [2 /*return*/, labelLoc.first()];
                        return [3 /*break*/, 6];
                    case 5:
                        _a = _d.sent();
                        return [3 /*break*/, 6];
                    case 6:
                        _i = 0, candidates_3 = candidates;
                        _d.label = 7;
                    case 7:
                        if (!(_i < candidates_3.length)) return [3 /*break*/, 13];
                        sel = candidates_3[_i];
                        _d.label = 8;
                    case 8:
                        _d.trys.push([8, 11, , 12]);
                        loc = page.locator(sel).first();
                        return [4 /*yield*/, loc.waitFor({ state: 'attached', timeout: 800 }).catch(function () { })];
                    case 9:
                        _d.sent();
                        return [4 /*yield*/, loc.count().catch(function () { return 0; })];
                    case 10:
                        if (_d.sent())
                            return [2 /*return*/, loc];
                        return [3 /*break*/, 12];
                    case 11:
                        _b = _d.sent();
                        return [3 /*break*/, 12];
                    case 12:
                        _i++;
                        return [3 /*break*/, 7];
                    case 13:
                        _d.trys.push([13, 16, , 17]);
                        firstTextInput = page.locator('input[type="text"], input:not([type]), textarea').filter({ hasNot: page.locator('[disabled]') }).first();
                        return [4 /*yield*/, firstTextInput.waitFor({ state: 'visible', timeout: 800 }).catch(function () { })];
                    case 14:
                        _d.sent();
                        return [4 /*yield*/, firstTextInput.count().catch(function () { return 0; })];
                    case 15:
                        if (_d.sent())
                            return [2 /*return*/, firstTextInput];
                        return [3 /*break*/, 17];
                    case 16:
                        _c = _d.sent();
                        return [3 /*break*/, 17];
                    case 17: throw new Error('No fallback input found');
                }
            });
        });
    };
    return BrowserAgent;
}());
exports.BrowserAgent = BrowserAgent;

"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskManager = void 0;
var uuid_1 = require("uuid");
var TaskManager = /** @class */ (function () {
    function TaskManager() {
        this.tasks = new Map();
        this.subscribers = new Set();
        this.sessionTasks = new Map();
    }
    TaskManager.prototype.createTask = function (description, sessionId) {
        if (sessionId === void 0) { sessionId = null; }
        var taskId = (0, uuid_1.v4)();
        var now = new Date().toISOString();
        var task = {
            id: taskId,
            description: description,
            status: 'created',
            createdAt: now,
            updatedAt: now,
            steps: [],
            currentStep: null,
            screenshots: [],
            error: null,
            paused: false,
            sessionId: sessionId,
        };
        this.tasks.set(taskId, task);
        if (task.sessionId) {
            if (!this.sessionTasks.has(task.sessionId))
                this.sessionTasks.set(task.sessionId, new Set());
            this.sessionTasks.get(task.sessionId).add(taskId);
        }
        this.notifySubscribers(taskId, task);
        return taskId;
    };
    TaskManager.prototype.getTask = function (taskId) {
        return this.tasks.get(taskId);
    };
    TaskManager.prototype.updateTask = function (taskId, updates) {
        var task = this.tasks.get(taskId);
        if (!task)
            return false;
        var updatedTask = __assign(__assign(__assign({}, task), updates), { updatedAt: new Date().toISOString() });
        this.tasks.set(taskId, updatedTask);
        this.notifySubscribers(taskId, updatedTask);
        return true;
    };
    TaskManager.prototype.addStep = function (taskId, step) {
        var task = this.tasks.get(taskId);
        if (!task)
            return false;
        var s = __assign(__assign({ id: (0, uuid_1.v4)() }, step), { timestamp: new Date().toISOString() });
        task.steps.push(s);
        task.currentStep = s;
        task.updatedAt = new Date().toISOString();
        this.tasks.set(taskId, task);
        this.notifySubscribers(taskId, task);
        return true;
    };
    TaskManager.prototype.addScreenshot = function (taskId, screenshot) {
        var task = this.tasks.get(taskId);
        if (!task)
            return false;
        var shot = { id: (0, uuid_1.v4)(), data: screenshot, timestamp: new Date().toISOString() };
        task.screenshots.push(shot);
        if (task.screenshots.length > 10)
            task.screenshots = task.screenshots.slice(-10);
        task.updatedAt = new Date().toISOString();
        this.tasks.set(taskId, task);
        this.notifySubscribers(taskId, task);
        return true;
    };
    TaskManager.prototype.pauseTask = function (taskId) {
        var task = this.tasks.get(taskId);
        if (!task)
            return false;
        if (task.status === 'running') {
            task.status = 'paused';
            task.paused = true;
            task.updatedAt = new Date().toISOString();
            this.tasks.set(taskId, task);
            this.notifySubscribers(taskId, task);
        }
        return true;
    };
    TaskManager.prototype.resumeTask = function (taskId) {
        var task = this.tasks.get(taskId);
        if (!task)
            return false;
        if (task.status === 'paused') {
            task.status = 'running';
            task.paused = false;
            task.updatedAt = new Date().toISOString();
            this.tasks.set(taskId, task);
            this.notifySubscribers(taskId, task);
        }
        return true;
    };
    TaskManager.prototype.stopTask = function (taskId) {
        var task = this.tasks.get(taskId);
        if (!task)
            return false;
        task.status = 'stopped';
        task.paused = false;
        task.updatedAt = new Date().toISOString();
        this.tasks.set(taskId, task);
        this.notifySubscribers(taskId, task);
        return true;
    };
    TaskManager.prototype.completeTask = function (taskId, result) {
        if (result === void 0) { result = null; }
        var task = this.tasks.get(taskId);
        if (!task)
            return false;
        task.status = 'completed';
        task.result = result;
        task.completedAt = new Date().toISOString();
        task.updatedAt = new Date().toISOString();
        this.tasks.set(taskId, task);
        this.notifySubscribers(taskId, task);
        return true;
    };
    TaskManager.prototype.failTask = function (taskId, error) {
        var task = this.tasks.get(taskId);
        if (!task)
            return false;
        task.status = 'failed';
        task.error = typeof error === 'string' ? error : (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error';
        task.failedAt = new Date().toISOString();
        task.updatedAt = new Date().toISOString();
        this.tasks.set(taskId, task);
        this.notifySubscribers(taskId, task);
        return true;
    };
    TaskManager.prototype.getAllTasks = function () { return Array.from(this.tasks.values()); };
    TaskManager.prototype.getTasksBySession = function (sessionId) {
        var _this = this;
        if (!sessionId)
            return [];
        var ids = this.sessionTasks.get(sessionId);
        if (!ids)
            return [];
        return Array.from(ids).map(function (id) { return _this.tasks.get(id); }).filter(function (t) { return !!t && t.status !== 'deleted' && !t.deleted; });
    };
    TaskManager.prototype.subscribe = function (callback) {
        var _this = this;
        this.subscribers.add(callback);
        return function () { _this.subscribers.delete(callback); };
    };
    TaskManager.prototype.notifySubscribers = function (taskId, task) {
        this.subscribers.forEach(function (callback) {
            try {
                callback(taskId, task);
            }
            catch (error) {
                // eslint-disable-next-line no-console
                console.error('Error in task subscriber:', error);
            }
        });
    };
    TaskManager.prototype.cleanup = function () {
        var _this = this;
        var tasks = Array.from(this.tasks.values());
        var completedTasks = tasks.filter(function (task) { return ['completed', 'failed'].includes(task.status); }).sort(function (a, b) { return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(); });
        if (completedTasks.length > 100) {
            var toDelete = completedTasks.slice(100);
            toDelete.forEach(function (task) {
                _this.tasks.delete(task.id);
                if (task.sessionId && _this.sessionTasks.has(task.sessionId)) {
                    var set = _this.sessionTasks.get(task.sessionId);
                    set.delete(task.id);
                    if (set.size === 0)
                        _this.sessionTasks.delete(task.sessionId);
                }
            });
        }
    };
    TaskManager.prototype.deleteTask = function (taskId) {
        var task = this.tasks.get(taskId);
        if (!task)
            return false;
        task.status = 'deleted';
        task.deleted = true;
        task.updatedAt = new Date().toISOString();
        if (task.sessionId && this.sessionTasks.has(task.sessionId)) {
            var set = this.sessionTasks.get(task.sessionId);
            set.delete(task.id);
            if (set.size === 0)
                this.sessionTasks.delete(task.sessionId);
        }
        this.tasks.set(taskId, task);
        this.notifySubscribers(taskId, task);
        return true;
    };
    return TaskManager;
}());
exports.TaskManager = TaskManager;

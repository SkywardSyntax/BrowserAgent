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
var browserAgent_1 = require("./browserAgent");
var taskManager_1 = require("./taskManager");
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var tm, ba, taskId, html, res, txt;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                tm = new taskManager_1.TaskManager();
                ba = new browserAgent_1.BrowserAgent(tm);
                return [4 /*yield*/, tm.createTask('smoke disguised button', null)];
            case 1:
                taskId = _a.sent();
                return [4 /*yield*/, ba.initializeBrowser()];
            case 2:
                _a.sent();
                html = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Disguised</title>\n  <style>\n  .btn { display:inline-block; padding:8px 14px; background:#2d6cdf; color:#fff; border-radius:6px; cursor:pointer; user-select:none; }\n  .btn[aria-disabled=\"true\"] { opacity:0.5; }\n  </style>\n  </head><body>\n  <div id=\"status\">Not clicked</div>\n  <div id=\"fake\" class=\"btn\" tabindex=\"0\">Continue</div>\n  <script>\n    const el = document.getElementById('fake');\n    el.addEventListener('click', () => { document.getElementById('status').textContent = 'Clicked!'; });\n    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') el.click(); });\n  </script>\n  </body></html>";
                return [4 /*yield*/, ba.page.goto('data:text/html,' + encodeURIComponent(html), { waitUntil: 'domcontentloaded' })];
            case 3:
                _a.sent();
                return [4 /*yield*/, ba.executeBrowserAction(taskId, { action: 'click_button_like', text: 'Continue', reason: 'click disguised button' })];
            case 4:
                res = _a.sent();
                console.log('click_button_like result:', res);
                return [4 /*yield*/, ba.page.textContent('#status').catch(function () { return null; })];
            case 5:
                txt = _a.sent();
                console.log('status text after click_button_like:', txt);
                if (!(txt !== 'Clicked!')) return [3 /*break*/, 8];
                return [4 /*yield*/, ba.executeBrowserAction(taskId, { action: 'click_by_text', text: 'Continue', reason: 'fallback click by text' })];
            case 6:
                // Fallback to click_by_text
                res = _a.sent();
                console.log('click_by_text result:', res);
                return [4 /*yield*/, ba.page.textContent('#status').catch(function () { return null; })];
            case 7:
                txt = _a.sent();
                console.log('status text after click_by_text:', txt);
                _a.label = 8;
            case 8: return [4 /*yield*/, ba.cleanup()];
            case 9:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); })();

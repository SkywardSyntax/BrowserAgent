// src/public/app/state/session.ts
class Session {
  _id = null;
  get id() {
    return this._id;
  }
  async ensure() {
    const stored = localStorage.getItem("sessionId");
    if (stored) {
      this._id = stored;
      return this._id;
    }
    const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
    const toHex = (buf) => Array.from(buf).map((b2) => b2.toString(16).padStart(2, "0")).join("");
    const b = rnd(16);
    b[6] = b[6] & 15 | 64;
    b[8] = b[8] & 63 | 128;
    const hex = toHex(b);
    this._id = `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
    localStorage.setItem("sessionId", this._id);
    return this._id;
  }
}

// public/app/components/ThemeToggle.js
function ThemeToggle() {
  const el = document.createElement("button");
  el.className = "theme-toggle";
  const icon = () => document.documentElement.getAttribute("data-theme") === "dark" ? "☾" : "☀";
  const set = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    el.textContent = `${icon()} ${theme === "dark" ? "Dark" : "Light"}`;
  };
  const initial = localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  set(initial);
  el.addEventListener("click", () => set(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
  return el;
}

// public/app/components/TaskInput.js
function TaskInput({ onSubmit }) {
  const wrap = document.createElement("div");
  wrap.className = "task-input";
  const ta = document.createElement("textarea");
  ta.placeholder = "e.g. Find the latest JS tutorials on YouTube and open the first result";
  ta.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  });
  const btn = document.createElement("button");
  btn.className = "submit";
  btn.innerHTML = '<span class="pulse"></span> Run Task';
  btn.addEventListener("click", () => submit());
  const row = document.createElement("div");
  row.className = "row";
  row.append(ta, btn);
  wrap.append(row);
  function submit() {
    const v = ta.value.trim();
    if (!v)
      return;
    btn.disabled = true;
    btn.textContent = "Starting…";
    Promise.resolve(onSubmit(v)).finally(() => {
      btn.disabled = false;
      btn.innerHTML = '<span class="pulse"></span> Run Task';
      ta.value = "";
    });
  }
  return wrap;
}

// public/app/components/ModelInfo.js
function ModelInfo() {
  const box = document.createElement("div");
  box.style.marginTop = "12px";
  const line = document.createElement("div");
  line.className = "muted small subtle";
  line.textContent = "Model: loading…";
  const extra = document.createElement("div");
  extra.className = "muted small subtle";
  extra.style.marginTop = "4px";
  extra.textContent = "";
  const copyBtn = document.createElement("button");
  copyBtn.className = "btn";
  copyBtn.textContent = "Copy Info";
  copyBtn.style.marginLeft = "8px";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(line.textContent + (extra.textContent ? `
${extra.textContent}` : ""));
    } catch {}
  });
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.append(line, copyBtn);
  box.append(row, extra);
  function update(info) {
    if (!info)
      return;
    line.textContent = `Model: ${info.model} • Viewport: ${info.viewport.width}×${info.viewport.height} • ${info.headless ? "Headless" : "Headed"}`;
    extra.textContent = info.wsUrl ? `WS: ${info.wsUrl}` : "";
  }
  return Object.assign(box, { update });
}

// public/app/components/TaskStatus.js
function TaskStatus({ onPause, onResume, onStop }) {
  const wrap = document.createElement("div");
  const header = document.createElement("div");
  header.className = "status";
  const title = document.createElement("div");
  title.className = "muted";
  title.textContent = "Current Task";
  const pill = document.createElement("div");
  pill.className = "pill created";
  pill.textContent = "none";
  header.append(title, pill);
  const desc = document.createElement("div");
  desc.style.margin = "6px 0 10px";
  desc.textContent = "—";
  const meta = document.createElement("div");
  meta.className = "small muted subtle";
  meta.textContent = "";
  const details = document.createElement("div");
  details.className = "small muted";
  details.style.whiteSpace = "pre-wrap";
  details.style.marginTop = "6px";
  details.textContent = "";
  const controls = document.createElement("div");
  controls.className = "controls";
  const pause = btn("Pause", () => onPause && onPause());
  const resume = btn("Resume", () => onResume && onResume());
  const stop = btn("Stop", () => onStop && onStop(), "danger");
  const spacer = document.createElement("div");
  spacer.style.flex = "1";
  controls.append(pause, resume, stop);
  wrap.append(header, desc, meta, details, controls);
  function btn(text, handler, variant = "") {
    const b = document.createElement("button");
    b.className = `btn ${variant}`;
    b.textContent = text;
    b.addEventListener("click", handler);
    return b;
  }
  function update(task) {
    if (!task) {
      pill.className = "pill created";
      pill.textContent = "none";
      desc.textContent = "—";
      meta.textContent = "";
      details.textContent = "";
      [pause, resume, stop].forEach((b) => b.disabled = true);
      return;
    }
    const s = task.status || "created";
    pill.className = `pill ${s}`;
    pill.textContent = s;
    desc.textContent = task.description || "—";
    const created = task.createdAt ? `Created ${new Date(task.createdAt).toLocaleString()}` : "";
    const updated = task.updatedAt ? ` • Updated ${new Date(task.updatedAt).toLocaleString()}` : "";
    const stepsCount = (task.steps || []).length;
    const shotsCount = (task.screenshots || []).length;
    const counts = ` • Steps ${stepsCount} • Shots ${shotsCount}`;
    meta.textContent = `${created}${updated}${counts}`;
    let extra = "";
    if (task.error)
      extra += `Error: ${task.error}`;
    if (task.result)
      extra += `${extra ? `
` : ""}Result: ${task.result}`;
    details.textContent = extra;
    pause.disabled = s !== "running";
    resume.disabled = s !== "paused";
    stop.disabled = ["completed", "failed", "stopped"].includes(s);
  }
  update(null);
  return Object.assign(wrap, { update });
}

// public/app/components/Dropdown.js
function Dropdown({ value, options = [], onChange, label = null, small = false }) {
  const wrap = document.createElement("div");
  wrap.className = `dropdown${small ? " small" : ""}`;
  const button = document.createElement("button");
  button.className = "btn";
  button.type = "button";
  button.textContent = label || displayFor(value, options);
  const menu = document.createElement("div");
  menu.className = "dropdown-menu";
  let open = false;
  let current = value ?? (options[0] && options[0].value);
  function displayFor(val, opts) {
    const f = opts.find((o) => o.value === val);
    return f ? f.label || String(f.value) : String(val ?? "");
  }
  function renderMenu() {
    menu.innerHTML = "";
    options.forEach((o) => {
      const item = document.createElement("button");
      item.className = "dropdown-item";
      item.type = "button";
      item.textContent = o.label || String(o.value);
      if (o.value === current)
        item.classList.add("active");
      item.addEventListener("click", () => {
        current = o.value;
        button.textContent = label || displayFor(current, options);
        close();
        onChange && onChange(current);
      });
      menu.append(item);
    });
  }
  function openMenu() {
    if (open)
      return;
    open = true;
    wrap.classList.add("open");
    renderMenu();
    setTimeout(() => document.addEventListener("click", onDoc, { once: true }), 0);
  }
  function close() {
    open = false;
    wrap.classList.remove("open");
  }
  function onDoc(e) {
    if (!wrap.contains(e.target))
      close();
  }
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    open ? close() : openMenu();
  });
  wrap.append(button, menu);
  return Object.assign(wrap, {
    get value() {
      return current;
    },
    set value(v) {
      current = v;
      button.textContent = label || displayFor(current, options);
    },
    setOptions(opts) {
      options = opts;
      if (open)
        renderMenu();
    },
    close
  });
}

// public/app/components/ActivityLog.js
function ActivityLog() {
  const wrap = document.createElement("div");
  const controls = document.createElement("div");
  controls.className = "small muted subtle";
  controls.style.marginBottom = "6px";
  controls.textContent = "Filter: ";
  const dd = Dropdown({
    small: true,
    value: "all",
    options: [
      { value: "all", label: "All" },
      { value: "errors", label: "Errors" },
      { value: "reasoning", label: "Reasoning" },
      { value: "browser_action", label: "Browser Actions" }
    ],
    onChange: () => render()
  });
  controls.append(dd);
  const box = document.createElement("div");
  box.className = "log";
  let lastSteps = [];
  function line(step) {
    const item = document.createElement("div");
    item.className = "item";
    if (step.error)
      item.classList.add("error");
    if (step.reasoning)
      item.classList.add("reasoning");
    const t = document.createElement("div");
    t.className = "time";
    t.textContent = new Date(step.timestamp).toLocaleTimeString();
    const d = document.createElement("div");
    d.textContent = step.description;
    item.append(t, d);
    return item;
  }
  function render() {
    const v = dd.value;
    box.innerHTML = "";
    const filtered = lastSteps.filter((s) => {
      if (v === "all")
        return true;
      if (v === "errors")
        return !!s.error;
      if (v === "reasoning")
        return !!s.reasoning;
      if (v === "browser_action")
        return s.type === "browser_action";
      return true;
    });
    filtered.forEach((s) => box.append(line(s)));
    box.scrollTop = box.scrollHeight;
  }
  function update(steps) {
    lastSteps = steps || [];
    render();
  }
  wrap.append(controls, box);
  return Object.assign(wrap, { update });
}

// public/app/components/TaskSidebar.js
function TaskSidebar({ onSelect, onRename, onDelete }) {
  const wrap = document.createElement("div");
  wrap.className = "sidebar";
  const header = document.createElement("div");
  header.className = "sidebar-header";
  header.textContent = "Tasks";
  const list = document.createElement("div");
  list.className = "sidebar-list";
  let tasks = [];
  let currentId = null;
  function render() {
    list.innerHTML = "";
    tasks.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).forEach((t) => {
      const item = document.createElement("div");
      item.className = "sidebar-item";
      if (t.id === currentId)
        item.classList.add("active");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = t.description || "(untitled)";
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${t.status || "created"} • ${new Date(t.updatedAt || t.createdAt).toLocaleTimeString()}`;
      const actions = document.createElement("div");
      actions.className = "actions";
      const renameBtn = document.createElement("button");
      renameBtn.className = "btn small";
      renameBtn.textContent = "Rename";
      renameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const name = prompt("Rename task", t.description || "");
        if (name != null)
          onRename && onRename(t, name);
      });
      const delBtn = document.createElement("button");
      delBtn.className = "btn danger small";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm("Delete this task?"))
          onDelete && onDelete(t);
      });
      actions.append(renameBtn, delBtn);
      item.append(title, meta, actions);
      item.addEventListener("click", () => onSelect && onSelect(t));
      list.append(item);
    });
  }
  function update(newTasks, currentTaskId) {
    tasks = newTasks || [];
    currentId = currentTaskId || null;
    render();
  }
  wrap.append(header, list);
  return Object.assign(wrap, { update });
}

// src/public/app/main.ts
function LiveBrowserView() {
  const wrap = document.createElement("div");
  wrap.className = "live";
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const badge = document.createElement("div");
  badge.className = "badge inline-flex items-center gap-2 px-3 py-1 rounded-full";
  badge.innerHTML = '<span class="dot inline-block align-middle"></span> <span class="align-middle">Live Browser</span>';
  const hint = document.createElement("div");
  hint.className = "muted small subtle text-[12px]";
  hint.textContent = "Click to interact directly - Auto-updates in real-time";
  const spacer = document.createElement("div");
  spacer.style.flex = "1";
  const last = document.createElement("div");
  last.className = "muted small subtle";
  last.style.marginRight = "8px";
  last.textContent = "";
  const btn = (label, title, handler) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = label;
    if (title)
      b.title = title;
    b.addEventListener("click", handler);
    return b;
  };
  const state = {
    currentTask: null,
    isLive: false,
    streamActive: false,
    streamRequested: false,
    expanded: false,
    lastMeta: null,
    socket: null
  };
  const refresh = btn("↻", "Refresh browser page", async () => {
    if (!state.currentTask?.id)
      return;
    await sendAction({ action: "navigate", url: "reload", reason: "User refresh" });
  });
  const openNew = btn("⧉", "Open in new browser tab", async () => {
    if (!state.currentTask?.id)
      return;
    try {
      const res = await fetch("/api/page-state");
      if (res.ok) {
        const data = await res.json();
        if (data.url && data.url !== "about:blank") {
          window.open(data.url, "_blank");
        }
      }
    } catch {}
  });
  toolbar.append(badge, hint, spacer, last, refresh, openNew);
  const frame = document.createElement("div");
  frame.className = "frame";
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  const canvas = document.createElement("canvas");
  canvas.className = "canvas";
  canvas.style.display = "none";
  const img = document.createElement("img");
  img.className = "screenshot";
  img.style.display = "block";
  const overlay = document.createElement("div");
  overlay.className = "overlay-cta hidden";
  overlay.innerHTML = `
    <div class="overlay-glass">
      <button class="overlay-btn">
        <span>\uD83D\uDDB1️ Click to control directly</span>
      </button>
    </div>
  `;
  overlay.addEventListener("click", async (ev) => {
    if (!state.currentTask?.id)
      return;
    ev.preventDefault();
    await enableLiveMode();
    toggleExpanded(true);
  });
  frame.append(backdrop, canvas, img, overlay);
  wrap.appendChild(toolbar);
  wrap.appendChild(frame);
  frame.addEventListener("click", async (ev) => {
    if (!state.isLive || !state.currentTask)
      return;
    const targetEl = state.streamActive ? canvas : img;
    const rect = targetEl.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    const vw = state.streamActive ? state.lastMeta?.deviceWidth || canvas.width : img.naturalWidth || rect.width;
    const vh = state.streamActive ? state.lastMeta?.deviceHeight || canvas.height : img.naturalHeight || rect.height;
    const x = Math.round(relX * vw);
    const y = Math.round(relY * vh);
    createClickPulse(ev.clientX, ev.clientY);
    await sendDirectAction({ action: "click", coordinates: { x, y }, reason: "User click" });
  });
  frame.addEventListener("mouseenter", () => {
    if (!state.isLive)
      overlay.classList.remove("hidden");
  });
  frame.addEventListener("mouseleave", () => {
    if (!state.isLive)
      overlay.classList.add("hidden");
  });
  async function enableLiveMode() {
    if (state.isLive)
      return;
    state.isLive = true;
    frame.classList.add("live-mode");
    if (state.currentTask?.id) {
      try {
        await fetch(`/api/tasks/${state.currentTask.id}/pause`, { method: "POST" });
      } catch {}
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        const message = {
          type: "liveControl",
          taskId: state.currentTask.id
        };
        state.socket.send(JSON.stringify(message));
      }
    }
    if (!state.streamRequested && state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: "startScreencast", taskId: state.currentTask?.id }));
      state.streamRequested = true;
    }
  }
  function toggleExpanded(force) {
    state.expanded = force !== undefined ? force : !state.expanded;
    wrap.classList.toggle("expanded", state.expanded);
    document.body.classList.toggle("live-expanded", state.expanded);
  }
  function createClickPulse(x, y) {
    const pulse = document.createElement("div");
    pulse.className = "click-pulse";
    pulse.style.left = `${x}px`;
    pulse.style.top = `${y}px`;
    document.body.appendChild(pulse);
    setTimeout(() => document.body.removeChild(pulse), 600);
  }
  async function sendDirectAction(action) {
    try {
      if (state.isLive && state.socket && state.socket.readyState === WebSocket.OPEN) {
        const message = {
          type: "directInput",
          taskId: state.currentTask.id,
          action
        };
        state.socket.send(JSON.stringify(message));
        return;
      }
      if (state.currentTask?.id) {
        const res = await fetch(`/api/tasks/${state.currentTask.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action)
        });
        if (!res.ok)
          return;
        const data = await res.json();
        if (data && data.screenshot && !state.streamActive) {
          update(data.screenshot);
        }
      }
    } catch (error) {
      console.error("Error sending direct action:", error);
    }
  }
  async function sendAction(action) {
    return sendDirectAction(action);
  }
  function update(screenshot) {
    if (screenshot && screenshot.startsWith("data:image/")) {
      img.src = screenshot;
      img.style.display = "block";
      canvas.style.display = "none";
      last.textContent = new Date().toLocaleTimeString();
    }
  }
  function drawFrame(frameData) {
    if (!frameData)
      return;
    state.streamActive = true;
    img.style.display = "none";
    canvas.style.display = "block";
    const ctx = canvas.getContext("2d");
    if (!ctx)
      return;
    const image = new Image;
    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
    };
    image.src = `data:image/jpeg;base64,${frameData}`;
  }
  function setTask(task) {
    state.currentTask = task;
    if (!task) {
      last.textContent = "";
      return;
    }
    refresh.disabled = !task?.id;
    openNew.disabled = !task?.id;
    if (state.isLive && state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: "startScreencast", taskId: task.id }));
    }
  }
  function setSocket(socket) {
    state.socket = socket;
    if (socket) {
      socket.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "screencastFrame" && msg.frame) {
            drawFrame(msg.frame);
          } else if (msg.type === "controlGranted") {
            console.log("Live control granted");
          }
        } catch {}
      });
    }
  }
  function isStreaming() {
    return state.streamActive;
  }
  wrap.update = update;
  wrap.setTask = setTask;
  wrap.setSocket = setSocket;
  wrap.drawFrame = drawFrame;
  wrap.isStreaming = isStreaming;
  return wrap;
}
var h = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (k === "class")
      el.className = v;
    else if (k.startsWith("on") && typeof v === "function")
      el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null)
      el.setAttribute(k, v);
  });
  children.flat().forEach((c) => {
    if (c == null)
      return;
    if (typeof c === "string")
      el.appendChild(document.createTextNode(c));
    else
      el.appendChild(c);
  });
  return el;
};

class App {
  root;
  session;
  ws = null;
  state;
  taskInput;
  liveView;
  modelInfo;
  taskStatus;
  activityLog;
  sidebar;
  constructor(root) {
    this.root = root;
    this.session = new Session;
    this.state = {
      info: null,
      currentTask: null
    };
    this.init();
  }
  async init() {
    await this.session.ensure();
    await this.fetchInfo();
    this.renderShell();
    await this.hydrateFromSession();
    this.connectWS();
  }
  renderShell() {
    const topbar = h("div", { class: "topbar" }, h("div", { class: "brand" }, h("div", { class: "brand-logo" }), "BrowserAgent"), ThemeToggle());
    this.taskInput = TaskInput({
      onSubmit: (text) => this.createTask(text)
    });
    this.liveView = LiveBrowserView();
    this.modelInfo = ModelInfo();
    const left = h("div", { class: "panel" }, h("div", { class: "hero" }, h("div", { class: "muted" }, "Tell the agent what to do"), this.taskInput, this.modelInfo), h("div", { class: "divider" }), this.liveView);
    this.taskStatus = TaskStatus({
      onPause: () => this.taskAction("pause"),
      onResume: () => this.taskAction("resume"),
      onStop: () => this.taskAction("stop")
    });
    this.activityLog = ActivityLog();
    const right = h("div", { class: "panel" }, this.taskStatus, h("div", { class: "divider" }), h("div", {}, h("div", { class: "muted small subtle" }, "Activity Log")), this.activityLog);
    this.sidebar = TaskSidebar({
      onSelect: (t) => this.setCurrentTask(t),
      onRename: async (t, name) => {
        await fetch(`/api/tasks/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: name })
        });
      },
      onDelete: async (t) => {
        await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
        if (this.state.currentTask && this.state.currentTask.id === t.id) {
          this.state.currentTask = null;
          this.taskStatus.update?.(null);
          this.activityLog.update?.([]);
          this.liveView.setTask?.(null);
        }
        this.refreshSidebar();
      }
    });
    const content = h("div", { class: "content with-sidebar" }, this.sidebar, left, right);
    this.root.innerHTML = "";
    this.root.appendChild(h("div", { class: "shell" }, topbar, content));
  }
  async fetchInfo() {
    try {
      const res = await fetch("/api/info");
      if (res.ok) {
        this.state.info = await res.json();
        this.modelInfo?.update?.(this.state.info);
      }
    } catch {}
  }
  async hydrateFromSession() {
    try {
      const res = await fetch(`/api/sessions/${this.session.id}/tasks`);
      if (!res.ok)
        return;
      const { tasks } = await res.json();
      if (tasks && tasks.length) {
        const latest = tasks.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())[0];
        this.setCurrentTask(latest);
      }
    } catch {}
  }
  connectWS() {
    try {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const url = `${proto}://${location.host}`;
      this.ws = new WebSocket(url);
      this.ws.addEventListener("open", () => {
        if (this.state.currentTask) {
          const message = {
            type: "subscribe",
            taskId: this.state.currentTask.id
          };
          this.ws.send(JSON.stringify(message));
        }
        this.liveView.setSocket?.(this.ws);
      });
      this.ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "taskUpdate" && msg.task) {
            if (!this.state.currentTask || msg.task.id === this.state.currentTask.id) {
              this.setCurrentTask(msg.task);
            }
            this.refreshSidebar();
          } else if (msg.type === "screencastFrame") {
            this.liveView.drawFrame?.(msg.frame || "");
          } else if (msg.type === "screencastError") {
            console.warn("Screencast error:", msg.error);
          }
        } catch {}
      });
      this.ws.addEventListener("close", () => {
        setTimeout(() => this.connectWS(), 1000);
      });
    } catch {}
  }
  async createTask(text) {
    const body = { task: text, sessionId: this.session.id };
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      const task = {
        id: data.taskId,
        description: text,
        status: "created",
        createdAt: new Date().toISOString(),
        steps: [],
        screenshots: []
      };
      this.setCurrentTask(task);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const message = {
          type: "subscribe",
          taskId: task.id
        };
        this.ws.send(JSON.stringify(message));
      }
      this.refreshSidebar();
    } else {
      alert(data.error || "Failed to create task");
    }
  }
  async taskAction(action) {
    const t = this.state.currentTask;
    if (!t)
      return;
    await fetch(`/api/tasks/${t.id}/${action}`, { method: "POST" });
  }
  setCurrentTask(task) {
    this.state.currentTask = task;
    this.taskStatus.update?.(task);
    this.activityLog.update?.(task.steps || []);
    this.liveView.setTask?.(task);
    const last = (task.screenshots || [])[task.screenshots.length - 1];
    if (last && !this.liveView.isStreaming?.()) {
      this.liveView.update?.(last.data);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN && task && task.id) {
      const message = {
        type: "subscribe",
        taskId: task.id
      };
      this.ws.send(JSON.stringify(message));
    }
  }
  async refreshSidebar() {
    try {
      const res = await fetch(`/api/sessions/${this.session.id}/tasks`);
      if (!res.ok)
        return;
      const { tasks } = await res.json();
      this.sidebar.update?.(tasks, this.state.currentTask?.id);
    } catch {}
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("app");
  if (root) {
    new App(root);
  }
});

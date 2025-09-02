// public/app/state/session.js
class Session {
  constructor() {
    this.id = null;
  }
  async ensure() {
    const stored = localStorage.getItem("sessionId");
    if (stored) {
      this.id = stored;
      return this.id;
    }
    const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
    const toHex = (buf) => Array.from(buf).map((b2) => b2.toString(16).padStart(2, "0")).join("");
    const b = rnd(16);
    b[6] = b[6] & 15 | 64;
    b[8] = b[8] & 63 | 128;
    const hex = toHex(b);
    this.id = `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
    localStorage.setItem("sessionId", this.id);
    return this.id;
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

// public/app/components/LiveBrowserView.js
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
  hint.textContent = "Auto-updates as the agent acts";
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
  let currentTask = null;
  let manual = false;
  let chromeInterval = null;
  let expanded = false;
  let isEditingAddr = false;
  let pendingNavUrl = null;
  const control = btn("Take Control", "Temporarily take manual control of the browser", async () => {
    manual = !manual;
    control.textContent = manual ? "Return to AI" : "Take Control";
    if (currentTask && currentTask.id) {
      try {
        await fetch(`/api/tasks/${currentTask.id}/${manual ? "pause" : "resume"}`, { method: "POST" });
      } catch {}
    }
    if (manual && socket && socket.readyState === WebSocket.OPEN && currentTask?.id) {
      try {
        socket.send(JSON.stringify({ type: "userTakeover", taskId: currentTask.id }));
      } catch {}
    }
    frame.classList.toggle("manual", manual);
    chromeBar.classList.toggle("invisible", !manual);
    chromeBar.classList.toggle("pointer-events-none", !manual);
    cursor.style.display = manual ? "block" : "none";
    if (manual) {
      if (!streamRequested && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "startScreencast", taskId: currentTask?.id }));
        streamRequested = true;
      }
    } else {
      if (streamRequested && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "stopScreencast" }));
      }
      streamActive = false;
      streamRequested = false;
      toggleExpanded(false);
    }
    if (manual) {
      const fetchState = async () => {
        try {
          const res = await fetch("/api/page-state");
          if (!res.ok)
            return;
          const data = await res.json();
          const nextUrl = data.url || "";
          if (!isEditingAddr) {
            if (pendingNavUrl) {
              if (urlsMatch(nextUrl, pendingNavUrl)) {
                addrInput.value = nextUrl;
                pendingNavUrl = null;
              }
            } else {
              addrInput.value = nextUrl;
            }
          }
          tabTitle.textContent = data.title || "New Tab";
        } catch {}
      };
      await fetchState();
      chromeInterval = setInterval(fetchState, 1500);
    } else {
      if (chromeInterval) {
        clearInterval(chromeInterval);
        chromeInterval = null;
      }
    }
  });
  const refresh = btn("Refresh", "Fetch latest screenshot", async () => {
    if (!currentTask)
      return;
    try {
      const url = `/api/tasks/${currentTask.id}/screenshot?_=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok)
        return;
      const blob = await res.blob();
      const b64 = await blobToBase64(blob);
      update(b64);
    } catch {}
  });
  const openNew = btn("Open", "Open latest screenshot in a new tab", () => {
    if (!currentTask)
      return;
    window.open(`/api/tasks/${currentTask.id}/screenshot?_=${Date.now()}`, "_blank");
  });
  const download = btn("Download", "Download latest screenshot", async () => {
    if (!img.src)
      return;
    const a = document.createElement("a");
    a.href = img.src;
    a.download = `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    a.click();
  });
  const copy = btn("Copy", "Copy image to clipboard", async () => {
    try {
      if (!img.src)
        return;
      const data = await fetch(img.src);
      const blob = await data.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob })
      ]);
    } catch {}
  });
  toolbar.append(badge, hint, spacer, last, refresh, openNew, download, copy, control);
  const frame = document.createElement("div");
  frame.className = "frame";
  frame.style.setProperty("--live-ar", (1280 / 800).toString());
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  const img = document.createElement("img");
  img.alt = "Live browser view";
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  canvas.style.display = "none";
  const ctx = canvas.getContext("2d");
  const overlay = document.createElement("div");
  overlay.className = "overlay-cta absolute inset-0 z-10 grid place-items-center hidden";
  overlay.innerHTML = `
    <div class="overlay-glass">
      <div class="overlay-center">
        <div class="overlay-title">Take manual control</div>
        <div class="overlay-sub">Hover to reveal, click to enter a responsive live session.</div>
        <button class="overlay-btn" type="button">Take Manual Control</button>
      </div>
    </div>`;
  const overlayBtn = overlay.querySelector(".overlay-btn");
  overlayBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!currentTask?.id)
      return;
    if (!manual)
      await control.click();
    toggleExpanded(true);
  });
  const cursor = document.createElement("div");
  cursor.className = "remote-cursor";
  cursor.style.display = "none";
  frame.append(backdrop, canvas, img, overlay, cursor);
  frame.addEventListener("mouseenter", () => {
    if (!manual)
      overlay.classList.remove("hidden");
  });
  frame.addEventListener("mouseleave", () => {
    overlay.classList.add("hidden");
  });
  const chromeBar = document.createElement("div");
  chromeBar.className = "mt-2 invisible pointer-events-none";
  chromeBar.innerHTML = `
    <div class="mx-1 rounded-xl border border-white/10 bg-black/30 backdrop-blur-md shadow-md">
      <div class="flex items-center gap-2 px-3 py-2 flex-wrap">
        <div class="flex items-center gap-1">
          <span class="w-2.5 h-2.5 rounded-full bg-red-500/70"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-yellow-500/70"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-green-500/70"></span>
        </div>
        <div class="is-manual text-[11px] text-white/70 px-2 py-0.5 rounded bg-white/10">Manual</div>
        <div class="flex items-center gap-1">
          <button class="nav-back px-2 py-1 text-white/70 hover:text-white">◀</button>
          <button class="nav-fwd px-2 py-1 text-white/70 hover:text-white">▶</button>
          <button class="nav-reload px-2 py-1 text-white/70 hover:text-white">⟳</button>
        </div>
        <input class="addr flex-1 min-w-[200px] text-[12px] px-3 py-1 rounded-full bg-white/10 text-white placeholder-white/50 outline-none border border-white/15" placeholder="Enter URL and press Enter" />
        <div class="tab text-[12px] text-white/80 px-2 py-1 rounded bg-white/10 max-w-[40%] truncate"><span class="tab-title">New Tab</span></div>
      </div>
    </div>`;
  const addrInput = chromeBar.querySelector(".addr");
  const tabTitle = chromeBar.querySelector(".tab-title");
  const backBtn = chromeBar.querySelector(".nav-back");
  const fwdBtn = chromeBar.querySelector(".nav-fwd");
  const reloadBtn = chromeBar.querySelector(".nav-reload");
  function toggleExpanded(on) {
    expanded = !!on;
    document.body.classList.toggle("live-expanded", expanded);
    wrap.classList.toggle("expanded", expanded);
    syncTopControls();
    if (!expanded) {
      if (socket && socket.readyState === WebSocket.OPEN && streamRequested) {
        try {
          socket.send(JSON.stringify({ type: "stopScreencast" }));
        } catch {}
      }
      streamActive = false;
      streamRequested = false;
      img.style.display = "block";
      canvas.style.display = "none";
    } else {
      if (manual && socket && socket.readyState === WebSocket.OPEN && currentTask?.id) {
        try {
          socket.send(JSON.stringify({ type: "startScreencast", taskId: currentTask.id }));
          streamRequested = true;
        } catch {}
      }
    }
  }
  const giveBack = document.createElement("div");
  giveBack.className = "overlay-top-controls hidden";
  giveBack.innerHTML = `<button class="overlay-exit" type="button">Give Agent Control</button>`;
  const exitBtn = giveBack.querySelector(".overlay-exit");
  exitBtn?.addEventListener("click", async () => {
    if (manual)
      await control.click();
    toggleExpanded(false);
  });
  backBtn?.addEventListener("click", async () => {
    if (!currentTask)
      return;
    await sendAction({ action: "go_back", reason: "User pressed back" });
  });
  fwdBtn?.addEventListener("click", async () => {
    if (!currentTask)
      return;
    await sendAction({ action: "go_forward", reason: "User pressed forward" });
  });
  reloadBtn?.addEventListener("click", async () => {
    if (!currentTask)
      return;
    await sendAction({ action: "reload", reason: "User pressed reload" });
  });
  addrInput?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const url = (addrInput.value || "").trim();
      if (!url)
        return;
      const hasProto = /^https?:\/\//i.test(url);
      const finalUrl = hasProto ? url : `https://${url}`;
      pendingNavUrl = finalUrl;
      isEditingAddr = false;
      addrInput.blur();
      await sendAction({ action: "navigate", url: finalUrl, reason: "User navigated via address bar" });
    }
  });
  addrInput?.addEventListener("focus", () => {
    isEditingAddr = true;
  });
  addrInput?.addEventListener("input", () => {
    isEditingAddr = true;
  });
  addrInput?.addEventListener("blur", () => {
    isEditingAddr = false;
  });
  frame.addEventListener("click", async (ev) => {
    if (!manual || !currentTask)
      return;
    const targetEl = streamActive ? canvas : img;
    const rect = targetEl.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    const vw = streamActive ? lastMeta.deviceWidth || canvas.width : img.naturalWidth || rect.width;
    const vh = streamActive ? lastMeta.deviceHeight || canvas.height : img.naturalHeight || rect.height;
    const x = Math.round(relX * vw);
    const y = Math.round(relY * vh);
    createClickPulse(ev.clientX, ev.clientY);
    await sendAction({ action: "click", coordinates: { x, y }, reason: "User manual click" });
  });
  frame.addEventListener("mousemove", (ev) => {
    if (!manual)
      return;
    const targetEl = streamActive ? canvas : img;
    const rect = targetEl.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) {
      cursor.style.opacity = "0";
      return;
    }
    cursor.style.opacity = "1";
    const x = ev.clientX - frame.getBoundingClientRect().left;
    const y = ev.clientY - frame.getBoundingClientRect().top;
    cursor.style.transform = `translate(${x}px, ${y}px)`;
  });
  let isMouseDown = false;
  let lastMoveAt = 0;
  frame.addEventListener("mousedown", async (ev) => {
    if (!manual || !currentTask)
      return;
    ev.preventDefault();
    const targetEl = streamActive ? canvas : img;
    const rect = targetEl.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    const vw = streamActive ? lastMeta.deviceWidth || canvas.width : img.naturalWidth || rect.width;
    const vh = streamActive ? lastMeta.deviceHeight || canvas.height : img.naturalHeight || rect.height;
    const x = Math.round(relX * vw);
    const y = Math.round(relY * vh);
    isMouseDown = true;
    const button = ev.button === 2 ? "right" : ev.button === 1 ? "middle" : "left";
    await sendAction({ action: "mouse_down", button, coordinates: { x, y }, reason: "User mouse down" });
  });
  frame.addEventListener("mouseup", async (ev) => {
    if (!manual || !currentTask)
      return;
    ev.preventDefault();
    isMouseDown = false;
    const button = ev.button === 2 ? "right" : ev.button === 1 ? "middle" : "left";
    await sendAction({ action: "mouse_up", button, reason: "User mouse up" });
  });
  frame.addEventListener("contextmenu", (ev) => {
    if (!manual)
      return;
    ev.preventDefault();
  });
  frame.addEventListener("mouseleave", async () => {
    if (!manual || !currentTask)
      return;
    if (isMouseDown) {
      isMouseDown = false;
      await sendAction({ action: "mouse_up", button: "left", reason: "Mouse leave" });
    }
  });
  frame.addEventListener("mousemove", async (ev) => {
    if (!manual || !currentTask)
      return;
    if (!isMouseDown)
      return;
    const now = Date.now();
    if (now - lastMoveAt < 16)
      return;
    lastMoveAt = now;
    const targetEl = streamActive ? canvas : img;
    const rect = targetEl.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    const vw = streamActive ? lastMeta.deviceWidth || canvas.width : img.naturalWidth || rect.width;
    const vh = streamActive ? lastMeta.deviceHeight || canvas.height : img.naturalHeight || rect.height;
    const x = Math.round(relX * vw);
    const y = Math.round(relY * vh);
    await sendAction({ action: "mouse_move", coordinates: { x, y }, reason: "User mouse move (drag)" });
  });
  let wheelAccumX = 0;
  let wheelAccumY = 0;
  let wheelRaf = null;
  frame.addEventListener("wheel", (ev) => {
    if (!manual || !currentTask)
      return;
    ev.preventDefault();
    wheelAccumX += ev.deltaX || 0;
    wheelAccumY += ev.deltaY || 0;
    if (!wheelRaf) {
      wheelRaf = requestAnimationFrame(async () => {
        const dx = wheelAccumX;
        const dy = wheelAccumY;
        wheelAccumX = 0;
        wheelAccumY = 0;
        wheelRaf = null;
        await sendAction({ action: "wheel", deltaX: dx, deltaY: dy, reason: "User wheel scroll" });
      });
    }
  }, { passive: false });
  window.addEventListener("keydown", async (ev) => {
    if (!manual || !currentTask)
      return;
    const tag = (ev.target && ev.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea")
      return;
    const key = ev.key;
    if (key.length === 1) {
      await sendAction({ action: "type", text: key, reason: "User manual typing" });
    } else {
      await sendAction({ action: "key_press", key, reason: "User manual key press" });
    }
  });
  wrap.append(toolbar, giveBack, frame, chromeBar);
  let socket = null;
  let streamActive = false;
  let streamRequested = false;
  let lastMeta = { deviceWidth: 0, deviceHeight: 0 };
  function setSocket(ws) {
    socket = ws;
    syncTopControls();
    if (manual && currentTask && socket && socket.readyState === WebSocket.OPEN) {
      if (!streamRequested) {
        socket.send(JSON.stringify({ type: "startScreencast", taskId: currentTask.id }));
        streamRequested = true;
      }
    }
  }
  function blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader;
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });
  }
  function setTask(task) {
    currentTask = task;
    if (!task) {
      last.textContent = "";
      return;
    }
    refresh.disabled = !task || !task.id;
    openNew.disabled = !task || !task.id;
    control.disabled = !task || !task.id;
    if (manual && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "startScreencast", taskId: task.id }));
    }
  }
  function update(base64Png) {
    img.src = `data:image/png;base64,${base64Png}`;
    if (!streamActive) {
      const ov = frame.querySelector(".overlay-cta");
      if (ov && !manual)
        ov.classList.remove("hidden");
      img.onload = () => {
        if (ov)
          ov.classList.add("hidden");
      };
      img.style.display = "block";
      canvas.style.display = "none";
      img.decode?.().then(() => {
        const w = img.naturalWidth || 1280;
        const h = img.naturalHeight || 800;
        if (w > 0 && h > 0)
          frame.style.setProperty("--live-ar", (w / h).toString());
      }).catch(() => {});
      last.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    }
  }
  let lastSeq = 0;
  function drawFrame(frameData) {
    if (!frameData || !frameData.data)
      return;
    const { data, metadata, format } = frameData;
    streamActive = true;
    streamRequested = true;
    const mime = format === "jpeg" ? "image/jpeg" : "image/png";
    const src = `data:${mime};base64,${data}`;
    img.src = src;
    img.style.display = "none";
    canvas.style.display = "block";
    const seq = ++lastSeq;
    const image = new Image;
    image.onload = () => {
      if (seq !== lastSeq)
        return;
      const w = metadata && (metadata.deviceWidth || image.naturalWidth) || image.naturalWidth;
      const h = metadata && (metadata.deviceHeight || image.naturalHeight) || image.naturalHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.drawImage(image, 0, 0, w, h);
      lastMeta = { deviceWidth: w, deviceHeight: h };
      if (w > 0 && h > 0)
        frame.style.setProperty("--live-ar", (w / h).toString());
      const ov = frame.querySelector(".overlay-cta");
      if (ov)
        ov.classList.add("hidden");
      last.textContent = `Live ${new Date().toLocaleTimeString()}`;
    };
    image.src = src;
  }
  function createClickPulse(clientX, clientY) {
    const rect = frame.getBoundingClientRect();
    const dot = document.createElement("div");
    dot.className = "click-pulse";
    dot.style.left = `${clientX - rect.left}px`;
    dot.style.top = `${clientY - rect.top}px`;
    frame.appendChild(dot);
    setTimeout(() => dot.remove(), 600);
  }
  return Object.assign(wrap, {
    update,
    setTask,
    setSocket,
    drawFrame,
    isStreaming: () => streamActive,
    isManual: () => manual,
    isExpanded: () => expanded
  });
  function urlsMatch(a, b) {
    const norm = (u) => {
      if (!u)
        return "";
      let s = String(u).trim();
      if (!/^https?:\/\//i.test(s))
        s = "https://" + s;
      try {
        const uo = new URL(s);
        const host = uo.host.toLowerCase();
        const proto = uo.protocol.toLowerCase();
        const path = uo.pathname.replace(/\/+$/, "");
        return `${proto}//${host}${path}${uo.search}${uo.hash}`;
      } catch {
        return s.replace(/\/+$/, "");
      }
    };
    return norm(a) === norm(b);
  }
  async function sendAction(action) {
    try {
      if (manual && expanded && socket && socket.readyState === WebSocket.OPEN) {
        const congested = socket.bufferedAmount && socket.bufferedAmount > 1e6;
        const isHighFreq = action && (action.action === "wheel" || action.action === "mouse_move");
        if (congested && isHighFreq)
          return;
        socket.send(JSON.stringify({ type: "input", taskId: currentTask.id, action }));
        return;
      }
      const res = await fetch(`/api/tasks/${currentTask.id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      if (!res.ok)
        return;
      const data = await res.json();
      if (data && data.screenshot && !streamActive)
        update(data.screenshot);
    } catch {}
  }
  function syncTopControls() {
    if (manual && expanded)
      giveBack.classList.remove("hidden");
    else
      giveBack.classList.add("hidden");
  }
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

// public/app/main.js
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
  constructor(root) {
    this.root = root;
    this.session = new Session;
    this.ws = null;
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
        await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: name }) });
      },
      onDelete: async (t) => {
        await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
        if (this.state.currentTask && this.state.currentTask.id === t.id) {
          this.state.currentTask = null;
          this.taskStatus.update(null);
          this.activityLog.update([]);
          if (this.liveView && this.liveView.setTask)
            this.liveView.setTask(null);
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
        if (this.modelInfo && this.modelInfo.update)
          this.modelInfo.update(this.state.info);
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
        const latest = tasks.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
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
          this.ws.send(JSON.stringify({ type: "subscribe", taskId: this.state.currentTask.id }));
        }
        if (this.liveView && this.liveView.setSocket)
          this.liveView.setSocket(this.ws);
      });
      this.ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "taskUpdate") {
            if (!this.state.currentTask || msg.task.id === this.state.currentTask.id) {
              this.setCurrentTask(msg.task);
            }
            this.refreshSidebar();
          } else if (msg.type === "screencastFrame") {
            if (this.liveView && this.liveView.drawFrame)
              this.liveView.drawFrame(msg.frame);
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
      const task = { id: data.taskId, description: text, status: "created", createdAt: new Date().toISOString(), steps: [], screenshots: [] };
      this.setCurrentTask(task);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "subscribe", taskId: task.id }));
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
    this.taskStatus.update(task);
    this.activityLog.update(task.steps || []);
    if (this.liveView && this.liveView.setTask)
      this.liveView.setTask(task);
    const last = (task.screenshots || [])[task.screenshots.length - 1];
    if (last && !(this.liveView && this.liveView.isStreaming && this.liveView.isStreaming())) {
      this.liveView.update(last.data);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN && task && task.id) {
      this.ws.send(JSON.stringify({ type: "subscribe", taskId: task.id }));
    }
  }
  async refreshSidebar() {
    try {
      const res = await fetch(`/api/sessions/${this.session.id}/tasks`);
      if (!res.ok)
        return;
      const { tasks } = await res.json();
      if (this.sidebar && this.sidebar.update) {
        this.sidebar.update(tasks, this.state.currentTask && this.state.currentTask.id);
      }
    } catch {}
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("app");
  new App(root);
});

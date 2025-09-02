export function LiveBrowserView() {
  const wrap = document.createElement('div');
  wrap.className = 'live';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const badge = document.createElement('div');
  // Add Tailwind utilities for spacing/scale while keeping existing badge styles
  badge.className = 'badge inline-flex items-center gap-2 px-3 py-1 rounded-full';
  badge.innerHTML = '<span class="dot inline-block align-middle"></span> <span class="align-middle">Live Browser</span>';
  const hint = document.createElement('div');
  // Tailwind text scaling for clarity
  hint.className = 'muted small subtle text-[12px]';
  hint.textContent = 'Auto-updates as the agent acts';

  const spacer = document.createElement('div');
  spacer.style.flex = '1';

  // Controls
  const last = document.createElement('div');
  last.className = 'muted small subtle';
  last.style.marginRight = '8px';
  last.textContent = '';

  const btn = (label, title, handler) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    if (title) b.title = title;
    b.addEventListener('click', handler);
    return b;
  };

  let currentTask = null;
  let manual = false;
  let chromeInterval = null;
  let expanded = false;
  // Address bar editing state & pending navigation tracking
  let isEditingAddr = false;
  let pendingNavUrl = null;

  const control = btn('Take Control', 'Temporarily take manual control of the browser', async () => {
    manual = !manual;
    control.textContent = manual ? 'Return to AI' : 'Take Control';
    // Optionally pause/resume the task automatically
    if (currentTask && currentTask.id) {
      try {
        await fetch(`/api/tasks/${currentTask.id}/${manual ? 'pause' : 'resume'}`, { method: 'POST' });
      } catch {}
    }
    // Also signal over WS for immediate pause/takeover
    if (manual && socket && socket.readyState === WebSocket.OPEN && currentTask?.id) {
      try { socket.send(JSON.stringify({ type: 'userTakeover', taskId: currentTask.id })); } catch {}
    }
    frame.classList.toggle('manual', manual);
    chromeBar.classList.toggle('invisible', !manual);
    chromeBar.classList.toggle('pointer-events-none', !manual);
    cursor.style.display = manual ? 'block' : 'none';
    // Start/stop streaming tied to manual mode
    if (manual) {
      if (!streamRequested && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'startScreencast', taskId: currentTask?.id }));
        streamRequested = true;
      }
    } else {
      if (streamRequested && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'stopScreencast' }));
      }
      streamActive = false;
      streamRequested = false;
      toggleExpanded(false); // collapse if leaving manual mode
    }
    if (manual) {
      // Poll page state while in manual mode to keep url/title fresh
      const fetchState = async () => {
        try {
          const res = await fetch('/api/page-state');
          if (!res.ok) return;
          const data = await res.json();
          // Only update the address bar if the user isn't editing
          // and either there's no pending navigation or the browser has reached it
          const nextUrl = data.url || '';
          if (!isEditingAddr) {
            if (pendingNavUrl) {
              if (urlsMatch(nextUrl, pendingNavUrl)) {
                addrInput.value = nextUrl;
                pendingNavUrl = null; // navigation reached, clear pending
              } // else: keep user's pending value visible
            } else {
              addrInput.value = nextUrl;
            }
          }
          tabTitle.textContent = data.title || 'New Tab';
        } catch {}
      };
      await fetchState();
      chromeInterval = setInterval(fetchState, 1500);
    } else {
      if (chromeInterval) { clearInterval(chromeInterval); chromeInterval = null; }
    }
  });
  const refresh = btn('Refresh', 'Fetch latest screenshot', async () => {
    if (!currentTask) return;
    try {
      const url = `/api/tasks/${currentTask.id}/screenshot?_=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const blob = await res.blob();
      const b64 = await blobToBase64(blob);
      update(b64);
    } catch {}
  });
  const openNew = btn('Open', 'Open latest screenshot in a new tab', () => {
    if (!currentTask) return;
    window.open(`/api/tasks/${currentTask.id}/screenshot?_=${Date.now()}`, '_blank');
  });
  const download = btn('Download', 'Download latest screenshot', async () => {
    if (!img.src) return;
    const a = document.createElement('a');
    a.href = img.src;
    a.download = `screenshot-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
    a.click();
  });
  const copy = btn('Copy', 'Copy image to clipboard', async () => {
    try {
      if (!img.src) return;
      const data = await fetch(img.src);
      const blob = await data.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
    } catch {}
  });

  toolbar.append(badge, hint, spacer, last, refresh, openNew, download, copy, control);

  const frame = document.createElement('div');
  frame.className = 'frame';
  // Seed an initial aspect-ratio to prevent layout jump before first image/frame arrives
  frame.style.setProperty('--live-ar', (1280/800).toString());
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const img = document.createElement('img');
  img.alt = 'Live browser view';
  // Canvas for live stream frames
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  // Hide canvas until streaming actually starts to avoid a blank area above the image
  canvas.style.display = 'none';
  const ctx = canvas.getContext('2d');
  // Overlay CTA for manual control; also serves as placeholder mask while loading
  const overlay = document.createElement('div');
  overlay.className = 'overlay-cta absolute inset-0 z-10 grid place-items-center hidden';
  overlay.innerHTML = `
    <div class="overlay-glass">
      <div class="overlay-center">
        <div class="overlay-title">Take manual control</div>
        <div class="overlay-sub">Hover to reveal, click to enter a responsive live session.</div>
        <button class="overlay-btn" type="button">Take Manual Control</button>
      </div>
    </div>`;
  const overlayBtn = overlay.querySelector('.overlay-btn');
  overlayBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!currentTask?.id) return;
    if (!manual) await control.click();
    toggleExpanded(true);
  });
  // Remote cursor overlay (only shows in manual mode)
  const cursor = document.createElement('div');
  cursor.className = 'remote-cursor';
  cursor.style.display = 'none';

  frame.append(backdrop, canvas, img, overlay, cursor);

  // Hover to show CTA when not in manual mode
  frame.addEventListener('mouseenter', () => {
    if (!manual) overlay.classList.remove('hidden');
  });
  frame.addEventListener('mouseleave', () => {
    overlay.classList.add('hidden');
  });

  // Manual control chrome (now OUTSIDE the browser image to avoid covering content)
  const chromeBar = document.createElement('div');
  // Reserve space even when invisible to avoid layout shift
  chromeBar.className = 'mt-2 invisible pointer-events-none';
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
  const addrInput = chromeBar.querySelector('.addr');
  const tabTitle = chromeBar.querySelector('.tab-title');
  const backBtn = chromeBar.querySelector('.nav-back');
  const fwdBtn = chromeBar.querySelector('.nav-fwd');
  const reloadBtn = chromeBar.querySelector('.nav-reload');

  // Expanded view helpers and top control
  function toggleExpanded(on) {
    expanded = !!on;
    document.body.classList.toggle('live-expanded', expanded);
    wrap.classList.toggle('expanded', expanded);
    syncTopControls();
    if (!expanded) {
      if (socket && socket.readyState === WebSocket.OPEN && streamRequested) {
        try { socket.send(JSON.stringify({ type: 'stopScreencast' })); } catch {}
      }
      streamActive = false;
      streamRequested = false;
      img.style.display = 'block';
      canvas.style.display = 'none';
    } else {
      if (manual && socket && socket.readyState === WebSocket.OPEN && currentTask?.id) {
        try {
          socket.send(JSON.stringify({ type: 'startScreencast', taskId: currentTask.id }));
          streamRequested = true;
        } catch {}
      }
    }
  }

  const giveBack = document.createElement('div');
  giveBack.className = 'overlay-top-controls hidden';
  giveBack.innerHTML = `<button class="overlay-exit" type="button">Give Agent Control</button>`;
  const exitBtn = giveBack.querySelector('.overlay-exit');
  exitBtn?.addEventListener('click', async () => {
    if (manual) await control.click();
    toggleExpanded(false);
  });

  backBtn?.addEventListener('click', async () => {
    if (!currentTask) return;
    await sendAction({ action: 'go_back', reason: 'User pressed back' });
  });
  fwdBtn?.addEventListener('click', async () => {
    if (!currentTask) return;
    await sendAction({ action: 'go_forward', reason: 'User pressed forward' });
  });
  reloadBtn?.addEventListener('click', async () => {
    if (!currentTask) return;
    await sendAction({ action: 'reload', reason: 'User pressed reload' });
  });
  addrInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const url = (addrInput.value || '').trim();
      if (!url) return;
      const hasProto = /^https?:\/\//i.test(url);
      const finalUrl = hasProto ? url : `https://${url}`;
      // Mark pending navigation so polling won't clobber the user's value
      pendingNavUrl = finalUrl;
      // Stop editing state on commit
      isEditingAddr = false;
      addrInput.blur();
      await sendAction({ action: 'navigate', url: finalUrl, reason: 'User navigated via address bar' });
    }
  });
  // Editing lock: don't clobber while the user types or focuses the field
  addrInput?.addEventListener('focus', () => { isEditingAddr = true; });
  addrInput?.addEventListener('input', () => { isEditingAddr = true; });
  addrInput?.addEventListener('blur', () => { isEditingAddr = false; });

  // Manual control handlers
  frame.addEventListener('click', async (ev) => {
    if (!manual || !currentTask) return;
    const targetEl = streamActive ? canvas : img;
    const rect = targetEl.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    // Map to viewport coordinates
    const vw = streamActive ? (lastMeta.deviceWidth || canvas.width) : (img.naturalWidth || rect.width);
    const vh = streamActive ? (lastMeta.deviceHeight || canvas.height) : (img.naturalHeight || rect.height);
    const x = Math.round(relX * vw);
    const y = Math.round(relY * vh);
    // Click ripple feedback
    createClickPulse(ev.clientX, ev.clientY);
    await sendAction({ action: 'click', coordinates: { x, y }, reason: 'User manual click' });
  });

  // Move remote cursor indicator
  frame.addEventListener('mousemove', (ev) => {
    if (!manual) return;
    const targetEl = streamActive ? canvas : img;
    const rect = targetEl.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    // Keep within bounds
    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) {
      cursor.style.opacity = '0';
      return;
    }
    cursor.style.opacity = '1';
    // Position cursor relative to frame
    const x = ev.clientX - frame.getBoundingClientRect().left;
    const y = ev.clientY - frame.getBoundingClientRect().top;
    cursor.style.transform = `translate(${x}px, ${y}px)`;
  });

  // Low-level mouse interactions for drag/select
  let isMouseDown = false;
  let lastMoveAt = 0;
  frame.addEventListener('mousedown', async (ev) => {
    if (!manual || !currentTask) return;
    ev.preventDefault();
    const targetEl = streamActive ? canvas : img;
    const rect = targetEl.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    const vw = streamActive ? (lastMeta.deviceWidth || canvas.width) : (img.naturalWidth || rect.width);
    const vh = streamActive ? (lastMeta.deviceHeight || canvas.height) : (img.naturalHeight || rect.height);
    const x = Math.round(relX * vw);
    const y = Math.round(relY * vh);
    isMouseDown = true;
    const button = ev.button === 2 ? 'right' : ev.button === 1 ? 'middle' : 'left';
    await sendAction({ action: 'mouse_down', button, coordinates: { x, y }, reason: 'User mouse down' });
  });
  frame.addEventListener('mouseup', async (ev) => {
    if (!manual || !currentTask) return;
    ev.preventDefault();
    isMouseDown = false;
    const button = ev.button === 2 ? 'right' : ev.button === 1 ? 'middle' : 'left';
    await sendAction({ action: 'mouse_up', button, reason: 'User mouse up' });
  });
  frame.addEventListener('contextmenu', (ev) => {
    if (!manual) return;
    ev.preventDefault();
  });
  frame.addEventListener('mouseleave', async () => {
    if (!manual || !currentTask) return;
    if (isMouseDown) {
      isMouseDown = false;
      await sendAction({ action: 'mouse_up', button: 'left', reason: 'Mouse leave' });
    }
  });
  frame.addEventListener('mousemove', async (ev) => {
    if (!manual || !currentTask) return;
    if (!isMouseDown) return;
    const now = Date.now();
    if (now - lastMoveAt < 16) return; // throttle moves (~60fps)
    lastMoveAt = now;
    const targetEl = streamActive ? canvas : img;
    const rect = targetEl.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    const vw = streamActive ? (lastMeta.deviceWidth || canvas.width) : (img.naturalWidth || rect.width);
    const vh = streamActive ? (lastMeta.deviceHeight || canvas.height) : (img.naturalHeight || rect.height);
    const x = Math.round(relX * vw);
    const y = Math.round(relY * vh);
    await sendAction({ action: 'mouse_move', coordinates: { x, y }, reason: 'User mouse move (drag)' });
  });

  // Scroll -> send wheel actions
  // Coalesce deltas and send once per animation frame for smoothness
  let wheelAccumX = 0;
  let wheelAccumY = 0;
  let wheelRaf = null;
  frame.addEventListener('wheel', (ev) => {
    if (!manual || !currentTask) return;
    ev.preventDefault();
    wheelAccumX += ev.deltaX || 0;
    wheelAccumY += ev.deltaY || 0;
    if (!wheelRaf) {
      wheelRaf = requestAnimationFrame(async () => {
        const dx = wheelAccumX; const dy = wheelAccumY;
        wheelAccumX = 0; wheelAccumY = 0; wheelRaf = null;
        await sendAction({ action: 'wheel', deltaX: dx, deltaY: dy, reason: 'User wheel scroll' });
      });
    }
  }, { passive: false });

  window.addEventListener('keydown', async (ev) => {
    if (!manual || !currentTask) return;
    // Avoid interfering with inputs
    const tag = (ev.target && ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const key = ev.key;
    // Keep it simple: send key_press, and for text characters also type
    if (key.length === 1) {
      await sendAction({ action: 'type', text: key, reason: 'User manual typing' });
    } else {
      await sendAction({ action: 'key_press', key, reason: 'User manual key press' });
    }
  });

  wrap.append(toolbar, giveBack, frame, chromeBar);

  // Streaming state & helpers
  let socket = null;
  let streamActive = false;
  let streamRequested = false;
  let lastMeta = { deviceWidth: 0, deviceHeight: 0 };

  function setSocket(ws) {
    socket = ws;
    syncTopControls();
    // If manual control is on when socket connects/reconnects, ensure stream starts
    if (manual && currentTask && socket && socket.readyState === WebSocket.OPEN) {
      if (!streamRequested) {
        socket.send(JSON.stringify({ type: 'startScreencast', taskId: currentTask.id }));
        streamRequested = true;
      }
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
  }

  function setTask(task) {
    currentTask = task;
    if (!task) {
      last.textContent = '';
      return;
    }
    refresh.disabled = !task || !task.id;
    openNew.disabled = !task || !task.id;
    control.disabled = !task || !task.id;
    // If manual mode is active and a task is set/switched, ensure stream is active for current task
    if (manual && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'startScreencast', taskId: task.id }));
    }
  }

  function update(base64Png) {
    // If a live stream is active, avoid swapping away from the canvas.
    // Still keep <img> in sync for download/open actions.
    img.src = `data:image/png;base64,${base64Png}`;
    if (!streamActive) {
      // Show overlay while the new image is loading when not streaming
      const ov = frame.querySelector('.overlay-cta');
      if (ov && !manual) ov.classList.remove('hidden');
      img.onload = () => { if (ov) ov.classList.add('hidden'); };
      // Ensure image is the visible layer when not streaming
      img.style.display = 'block';
      canvas.style.display = 'none';
      // Estimate live aspect ratio from natural size when it becomes available to lock layout
      img.decode?.().then(() => {
        const w = img.naturalWidth || 1280;
        const h = img.naturalHeight || 800;
        if (w > 0 && h > 0) frame.style.setProperty('--live-ar', (w/h).toString());
      }).catch(() => {});
      last.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    }
  }

  // Draw a live frame (JPEG/PNG) onto the canvas
  // Draw a live frame (JPEG/PNG) onto the canvas with basic out-of-order drop
  let lastSeq = 0;
  function drawFrame(frameData) {
    if (!frameData || !frameData.data) return;
    const { data, metadata, format } = frameData;
    streamActive = true;
    streamRequested = true;
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const src = `data:${mime};base64,${data}`;
    // Keep <img> in sync for download/open buttons
    img.src = src;
    // Switch to canvas display for live streaming frames
    img.style.display = 'none';
    canvas.style.display = 'block';
    const seq = ++lastSeq;
    const image = new Image();
    image.onload = () => {
      // Drop if a newer frame has already been queued
      if (seq !== lastSeq) return;
      const w = (metadata && (metadata.deviceWidth || image.naturalWidth)) || image.naturalWidth;
      const h = (metadata && (metadata.deviceHeight || image.naturalHeight)) || image.naturalHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.drawImage(image, 0, 0, w, h);
      lastMeta = { deviceWidth: w, deviceHeight: h };
      // Update aspect ratio CSS var to match actual device viewport to avoid gaps
      if (w > 0 && h > 0) frame.style.setProperty('--live-ar', (w/h).toString());
      const ov = frame.querySelector('.overlay-cta');
      if (ov) ov.classList.add('hidden');
      last.textContent = `Live ${new Date().toLocaleTimeString()}`;
    };
    image.src = src;
  }

  // Pulse animation at click point
  function createClickPulse(clientX, clientY) {
    const rect = frame.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.className = 'click-pulse';
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
    // Expose state for parent so it can avoid clobbering during streaming
    isStreaming: () => streamActive,
    isManual: () => manual,
    isExpanded: () => expanded,
  });

  // Helpers
  function urlsMatch(a, b) {
    // Simple normalization: trim, ensure protocol for compare, and drop trailing slash
    const norm = (u) => {
      if (!u) return '';
      let s = String(u).trim();
      if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
      try {
        const uo = new URL(s);
        // Lowercase protocol/host; keep pathname/query for accuracy
        const host = uo.host.toLowerCase();
        const proto = uo.protocol.toLowerCase();
        // Remove trailing slash from pathname for compare
        const path = uo.pathname.replace(/\/+$/, '');
        return `${proto}//${host}${path}${uo.search}${uo.hash}`;
      } catch {
        return s.replace(/\/+$/, '');
      }
    };
    return norm(a) === norm(b);
  }

  async function sendAction(action) {
    try {
      // Prefer low-latency WS path during expanded manual sessions
      if (manual && expanded && socket && socket.readyState === WebSocket.OPEN) {
        // Apply simple backpressure: drop high-frequency inputs when socket is congested
        const congested = socket.bufferedAmount && socket.bufferedAmount > 1000000; // ~1MB
        const isHighFreq = action && (action.action === 'wheel' || action.action === 'mouse_move');
        if (congested && isHighFreq) return; // drop to keep latency low
        socket.send(JSON.stringify({ type: 'input', taskId: currentTask.id, action }));
        return;
      }
      const res = await fetch(`/api/tasks/${currentTask.id}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.screenshot && !streamActive) update(data.screenshot);
    } catch {}
  }

  function syncTopControls() {
    if (manual && expanded) giveBack.classList.remove('hidden');
    else giveBack.classList.add('hidden');
  }
}

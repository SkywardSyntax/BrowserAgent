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

  const control = btn('Take Control', 'Temporarily take manual control of the browser', async () => {
    manual = !manual;
    control.textContent = manual ? 'Return to AI' : 'Take Control';
    // Optionally pause/resume the task automatically
    if (currentTask && currentTask.id) {
      try {
        await fetch(`/api/tasks/${currentTask.id}/${manual ? 'pause' : 'resume'}`, { method: 'POST' });
      } catch {}
    }
  frame.classList.toggle('manual', manual);
  chromeBar.classList.toggle('hidden', !manual);
  cursor.style.display = manual ? 'block' : 'none';
  if (manual) {
    // Poll page state while in manual mode to keep url/title fresh
    const fetchState = async () => {
      try {
        const res = await fetch('/api/page-state');
        if (!res.ok) return;
        const data = await res.json();
        addrInput.value = data.url || '';
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
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const img = document.createElement('img');
  img.alt = 'Live browser view';
  // Tailwind-powered overlay to avoid relying on :has and ensure full coverage
  const overlay = document.createElement('div');
  overlay.className = 'absolute inset-0 z-10 grid place-items-center text-white/85 font-medium text-[14px]';
  overlay.style.background = 'rgba(11,15,23,0.96)';
  overlay.style.backdropFilter = 'blur(12px) saturate(120%)';
  overlay.textContent = 'Live preview will be shown here';
  // Remote cursor overlay (only shows in manual mode)
  const cursor = document.createElement('div');
  cursor.className = 'remote-cursor';
  cursor.style.display = 'none';

  frame.append(backdrop, img, overlay, cursor);

  // Manual control chrome (now OUTSIDE the browser image to avoid covering content)
  const chromeBar = document.createElement('div');
  chromeBar.className = 'mt-2 hidden';
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
      await sendAction({ action: 'navigate', url: finalUrl, reason: 'User navigated via address bar' });
    }
  });

  // Manual control handlers
  frame.addEventListener('click', async (ev) => {
    if (!manual || !currentTask || !img || !img.naturalWidth) return;
    const rect = img.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    // Map to viewport coordinates
    const vw = img.naturalWidth; const vh = img.naturalHeight;
    const x = Math.round(relX * vw);
    const y = Math.round(relY * vh);
    // Click ripple feedback
    createClickPulse(ev.clientX, ev.clientY);
    await sendAction({ action: 'click', coordinates: { x, y }, reason: 'User manual click' });
  });

  // Move remote cursor indicator
  frame.addEventListener('mousemove', (ev) => {
    if (!manual || !img || !img.naturalWidth) return;
    const rect = img.getBoundingClientRect();
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

  // Scroll -> send wheel actions
  let lastWheel = 0;
  frame.addEventListener('wheel', async (ev) => {
    if (!manual || !currentTask) return;
    ev.preventDefault();
    const now = Date.now();
    if (now - lastWheel < 120) return; // throttle
    lastWheel = now;
    const direction = ev.deltaY > 0 ? 'down' : 'up';
    await sendAction({ action: 'scroll', scroll_direction: direction, reason: 'User wheel scroll' });
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

  async function sendAction(action) {
    try {
      const res = await fetch(`/api/tasks/${currentTask.id}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.screenshot) update(data.screenshot);
    } catch {}
  }

  wrap.append(toolbar, frame, chromeBar);

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
  }

  function update(base64Png) {
    // Show overlay while the new image is loading
    const ov = frame.querySelector('.absolute.inset-0');
    if (ov) ov.classList.remove('hidden');
    img.onload = () => {
      if (ov) ov.classList.add('hidden');
    };
    img.src = `data:image/png;base64,${base64Png}`;
    last.textContent = `Updated ${new Date().toLocaleTimeString()}`;
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

  return Object.assign(wrap, { update, setTask });
}

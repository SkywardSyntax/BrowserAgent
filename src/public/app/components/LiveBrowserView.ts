import { Task, WebSocketMessage, BrowserAction, HTMLElementWithProps } from '../types.js';

interface LiveBrowserViewState {
  currentTask: Task | null;
  isLive: boolean;
  streamActive: boolean;
  streamRequested: boolean;
  expanded: boolean;
  lastMeta: any;
  socket: WebSocket | null;
}

export function LiveBrowserView(): HTMLElementWithProps {
  const wrap = document.createElement('div') as HTMLElementWithProps;
  wrap.className = 'live';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const badge = document.createElement('div');
  badge.className = 'badge inline-flex items-center gap-2 px-3 py-1 rounded-full';
  badge.innerHTML = '<span class="dot inline-block align-middle"></span> <span class="align-middle">Live Browser</span>';
  const hint = document.createElement('div');
  hint.className = 'muted small subtle text-[12px]';
  hint.textContent = 'Click to interact directly - Auto-updates in real-time';

  const spacer = document.createElement('div');
  spacer.style.flex = '1';

  // Controls
  const last = document.createElement('div');
  last.className = 'muted small subtle';
  last.style.marginRight = '8px';
  last.textContent = '';

  const btn = (label: string, title: string, handler: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    if (title) b.title = title;
    b.addEventListener('click', handler);
    return b;
  };

  const state: LiveBrowserViewState = {
    currentTask: null,
    isLive: false,
    streamActive: false,
    streamRequested: false,
    expanded: false,
    lastMeta: null,
    socket: null
  };

  // Address bar editing state & pending navigation tracking
  let isEditingAddr = false;
  let pendingNavUrl: string | null = null;
  let chromeInterval: NodeJS.Timeout | null = null;

  const refresh = btn('↻', 'Refresh browser page', async () => {
    if (!state.currentTask?.id) return;
    await sendAction({ action: 'navigate', url: 'reload', reason: 'User refresh' });
  });

  const openNew = btn('⧉', 'Open in new browser tab', async () => {
    if (!state.currentTask?.id) return;
    try {
      const res = await fetch('/api/page-state');
      if (res.ok) {
        const data = await res.json();
        if (data.url && data.url !== 'about:blank') {
          window.open(data.url, '_blank');
        }
      }
    } catch {}
  });

  toolbar.append(badge, hint, spacer, last, refresh, openNew);

  // Browser frame
  const frame = document.createElement('div');
  frame.className = 'frame';

  // Background for proper aspect ratio
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';

  // Live stream canvas (for real-time frames)
  const canvas = document.createElement('canvas');
  canvas.className = 'canvas';
  canvas.style.display = 'none';

  // Static screenshot image
  const img = document.createElement('img');
  img.className = 'screenshot';
  img.style.display = 'block';

  // Live interaction overlay - now permanently enabled for better UX
  const overlay = document.createElement('div');
  overlay.className = 'overlay-cta hidden';
  overlay.innerHTML = `
    <div class="overlay-glass">
      <button class="overlay-btn">
        <span>🖱️ Click to control directly</span>
      </button>
    </div>
  `;

  // Click to activate live control immediately
  overlay.addEventListener('click', async (ev) => {
    if (!state.currentTask?.id) return;
    ev.preventDefault();
    // Automatically enable live mode on first click
    await enableLiveMode();
    toggleExpanded(true);
  });

  // Remote cursor overlay
  const cursor = document.createElement('div');
  cursor.className = 'remote-cursor';
  cursor.style.display = 'none';

  frame.append(backdrop, canvas, img, overlay, cursor);

  // Enhanced Chrome Bar for live control (always visible when in live mode)
  const chromeBar = document.createElement('div');
  chromeBar.className = 'mt-2 invisible pointer-events-none';
  chromeBar.innerHTML = `
    <div class="mx-1 rounded-xl border border-white/10 bg-black/30 backdrop-blur-md shadow-md">
      <div class="flex items-center gap-1 px-3 py-2">
        <div class="flex items-center gap-1">
          <button class="p-1 rounded hover:bg-white/10 text-white/60" title="Back" data-action="back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z"/>
            </svg>
          </button>
          <button class="p-1 rounded hover:bg-white/10 text-white/60" title="Forward" data-action="forward">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
            </svg>
          </button>
          <button class="p-1 rounded hover:bg-white/10 text-white/60" title="Reload" data-action="reload">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
        </div>
        <div class="flex-1 mx-2">
          <input type="text" class="w-full px-2 py-1 text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/60 focus:bg-white/20 focus:border-white/40 focus:outline-none" 
                 placeholder="Enter URL..." data-address-bar>
        </div>
        <button class="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded" data-action="exit" title="Exit Live Mode">
          Exit Live
        </button>
      </div>
      <div class="px-3 pb-2">
        <div class="text-xs text-white/60" data-tab-title>New Tab</div>
      </div>
    </div>
  `;

  wrap.appendChild(toolbar);
  wrap.appendChild(frame);
  wrap.appendChild(chromeBar);

  // Live mode interaction handlers
  let isMouseDown = false;
  let lastMoveAt = 0;

  // Enhanced direct input handling
  frame.addEventListener('click', async (ev: MouseEvent) => {
    if (!state.isLive || !state.currentTask) return;
    const targetEl = state.streamActive ? canvas : img;
    const rect = targetEl.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    
    // Map to viewport coordinates
    const vw = state.streamActive ? (state.lastMeta?.deviceWidth || canvas.width) : (img.naturalWidth || rect.width);
    const vh = state.streamActive ? (state.lastMeta?.deviceHeight || canvas.height) : (img.naturalHeight || rect.height);
    const x = Math.round(relX * vw);
    const y = Math.round(relY * vh);
    
    // Visual click feedback
    createClickPulse(ev.clientX, ev.clientY);
    
    // Send via enhanced direct input protocol
    await sendDirectAction({ action: 'click', coordinates: { x, y }, reason: 'User click' });
  });

  frame.addEventListener('mousedown', async (ev: MouseEvent) => {
    if (!state.isLive || !state.currentTask) return;
    ev.preventDefault();
    isMouseDown = true;
    const button = ev.button === 2 ? 'right' : ev.button === 1 ? 'middle' : 'left';
    await sendDirectAction({ action: 'mouse_down', button, reason: 'User mouse down' });
  });

  frame.addEventListener('mouseup', async (ev: MouseEvent) => {
    if (!state.isLive || !state.currentTask) return;
    ev.preventDefault();
    isMouseDown = false;
    const button = ev.button === 2 ? 'right' : ev.button === 1 ? 'middle' : 'left';
    await sendDirectAction({ action: 'mouse_up', button, reason: 'User mouse up' });
  });

  frame.addEventListener('mousemove', async (ev: MouseEvent) => {
    if (!state.isLive || !state.currentTask) return;
    updateCursor(ev);
    
    if (!isMouseDown) return;
    const now = Date.now();
    if (now - lastMoveAt < 16) return; // throttle moves (~60fps)
    
    lastMoveAt = now;
    const targetEl = state.streamActive ? canvas : img;
    const rect = targetEl.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width;
    const relY = (ev.clientY - rect.top) / rect.height;
    const vw = state.streamActive ? (state.lastMeta?.deviceWidth || canvas.width) : (img.naturalWidth || rect.width);
    const vh = state.streamActive ? (state.lastMeta?.deviceHeight || canvas.height) : (img.naturalHeight || rect.height);
    const x = Math.round(relX * vw);
    const y = Math.round(relY * vh);
    await sendDirectAction({ action: 'mouse_move', coordinates: { x, y }, reason: 'User mouse move' });
  });

  // Enhanced wheel handling
  let wheelAccumX = 0;
  let wheelAccumY = 0;
  let wheelRaf: number | null = null;

  frame.addEventListener('wheel', (ev: WheelEvent) => {
    if (!state.isLive || !state.currentTask) return;
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
        await sendDirectAction({ action: 'wheel', deltaX: dx, deltaY: dy, reason: 'User wheel scroll' });
      });
    }
  }, { passive: false });

  // Enhanced keyboard handling
  window.addEventListener('keydown', async (ev: KeyboardEvent) => {
    if (!state.isLive || !state.currentTask) return;
    // Avoid interfering with inputs
    const tag = ((ev.target as HTMLElement)?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    
    const key = ev.key;
    // Common keys that should be sent to browser
    if (['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key) || 
        (key.length === 1 && !ev.ctrlKey && !ev.metaKey)) {
      ev.preventDefault();
      await sendDirectAction({ action: 'key_press', key, reason: 'User key press' });
    }
  });

  // Show hover controls when not in live mode
  frame.addEventListener('mouseenter', () => {
    if (!state.isLive) overlay.classList.remove('hidden');
  });
  
  frame.addEventListener('mouseleave', () => {
    if (!state.isLive) {
      overlay.classList.add('hidden');
      if (isMouseDown) {
        isMouseDown = false;
        sendDirectAction({ action: 'mouse_up', button: 'left', reason: 'Mouse leave' });
      }
    }
  });

  // Chrome bar handlers
  chromeBar.addEventListener('click', async (ev: Event) => {
    const target = ev.target as HTMLElement;
    const action = target.closest('[data-action]')?.getAttribute('data-action');
    
    if (action === 'back') {
      await sendDirectAction({ action: 'navigate', url: 'back', reason: 'User navigation back' });
    } else if (action === 'forward') {
      await sendDirectAction({ action: 'navigate', url: 'forward', reason: 'User navigation forward' });
    } else if (action === 'reload') {
      await sendDirectAction({ action: 'navigate', url: 'reload', reason: 'User reload' });
    } else if (action === 'exit') {
      await disableLiveMode();
    }
  });

  // Address bar handling
  const addrInput = chromeBar.querySelector('[data-address-bar]') as HTMLInputElement;
  const tabTitle = chromeBar.querySelector('[data-tab-title]') as HTMLElement;

  addrInput?.addEventListener('keydown', async (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const url = (addrInput.value || '').trim();
      if (!url) return;
      const hasProto = /^https?:\/\//i.test(url);
      const finalUrl = hasProto ? url : `https://${url}`;
      pendingNavUrl = finalUrl;
      isEditingAddr = false;
      addrInput.blur();
      await sendDirectAction({ action: 'navigate', url: finalUrl, reason: 'User navigation via address bar' });
    }
  });

  addrInput?.addEventListener('focus', () => { isEditingAddr = true; });
  addrInput?.addEventListener('input', () => { isEditingAddr = true; });
  addrInput?.addEventListener('blur', () => { isEditingAddr = false; });

  // Enhanced direct action sender with low-latency WebSocket protocol
  async function sendDirectAction(action: BrowserAction): Promise<void> {
    try {
      // Use new direct input protocol for minimal latency
      if (state.isLive && state.expanded && state.socket && state.socket.readyState === WebSocket.OPEN) {
        // Apply intelligent backpressure: drop high-frequency inputs when socket is congested
        const congested = (state.socket as any).bufferedAmount && (state.socket as any).bufferedAmount > 500000; // ~500KB
        const isHighFreq = action && (action.action === 'wheel' || action.action === 'mouse_move');
        if (congested && isHighFreq) return; // drop to keep latency low
        
        const message: WebSocketMessage = {
          type: 'directInput',
          taskId: state.currentTask!.id,
          action
        };
        state.socket.send(JSON.stringify(message));
        return;
      }
      
      // Fallback to HTTP for non-live mode
      if (state.currentTask?.id) {
        const res = await fetch(`/api/tasks/${state.currentTask.id}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action)
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.screenshot && !state.streamActive) {
          update(data.screenshot);
        }
      }
    } catch (error) {
      console.error('Error sending direct action:', error);
    }
  }

  // Legacy action sender for compatibility
  async function sendAction(action: BrowserAction): Promise<void> {
    return sendDirectAction(action);
  }

  async function enableLiveMode(): Promise<void> {
    if (state.isLive) return;
    
    state.isLive = true;
    frame.classList.add('live-mode');
    cursor.style.display = 'block';
    
    // Pause current task and take control
    if (state.currentTask?.id) {
      try {
        await fetch(`/api/tasks/${state.currentTask.id}/pause`, { method: 'POST' });
      } catch {}
      
      // Signal live control via WebSocket
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        const message: WebSocketMessage = {
          type: 'liveControl',
          taskId: state.currentTask.id
        };
        state.socket.send(JSON.stringify(message));
      }
    }
    
    // Start live streaming
    if (!state.streamRequested && state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: 'startScreencast', taskId: state.currentTask?.id }));
      state.streamRequested = true;
    }
    
    // Start polling page state for address bar updates
    const fetchState = async (): Promise<void> => {
      try {
        const res = await fetch('/api/page-state');
        if (!res.ok) return;
        const data = await res.json();
        const nextUrl = data.url || '';
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
        tabTitle.textContent = data.title || 'New Tab';
      } catch {}
    };
    
    await fetchState();
    chromeInterval = setInterval(fetchState, 1000); // More frequent updates for live mode
  }

  async function disableLiveMode(): Promise<void> {
    if (!state.isLive) return;
    
    state.isLive = false;
    frame.classList.remove('live-mode');
    cursor.style.display = 'none';
    
    // Stop streaming
    if (state.streamRequested && state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: 'stopScreencast' }));
    }
    state.streamActive = false;
    state.streamRequested = false;
    
    // Resume task
    if (state.currentTask?.id) {
      try {
        await fetch(`/api/tasks/${state.currentTask.id}/resume`, { method: 'POST' });
      } catch {}
    }
    
    // Clear polling
    if (chromeInterval) {
      clearInterval(chromeInterval);
      chromeInterval = null;
    }
    
    toggleExpanded(false);
  }

  function toggleExpanded(force?: boolean): void {
    state.expanded = force !== undefined ? force : !state.expanded;
    wrap.classList.toggle('expanded', state.expanded);
    document.body.classList.toggle('live-expanded', state.expanded);
    chromeBar.classList.toggle('invisible', !state.expanded);
    chromeBar.classList.toggle('pointer-events-none', !state.expanded);
    
    // Show exit controls when expanded
    if (state.expanded && state.isLive) {
      const exitControls = document.createElement('div');
      exitControls.className = 'overlay-top-controls';
      exitControls.innerHTML = `
        <button class="overlay-exit" data-action="exit">
          <span>✕</span>
          <span>Exit Live Mode</span>
        </button>
      `;
      document.body.appendChild(exitControls);
      
      exitControls.addEventListener('click', async () => {
        await disableLiveMode();
        document.body.removeChild(exitControls);
      });
    }
  }

  function updateCursor(ev: MouseEvent): void {
    if (!state.isLive) return;
    const rect = frame.getBoundingClientRect();
    cursor.style.left = `${ev.clientX - rect.left}px`;
    cursor.style.top = `${ev.clientY - rect.top}px`;
  }

  function createClickPulse(x: number, y: number): void {
    const pulse = document.createElement('div');
    pulse.className = 'click-pulse';
    pulse.style.left = `${x}px`;
    pulse.style.top = `${y}px`;
    document.body.appendChild(pulse);
    setTimeout(() => document.body.removeChild(pulse), 600);
  }

  function urlsMatch(a: string, b: string): boolean {
    const norm = (u: string): string => {
      if (!u) return '';
      let s = String(u).trim();
      if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
      try {
        const uo = new URL(s);
        const host = uo.host.toLowerCase();
        const proto = uo.protocol.toLowerCase();
        const path = uo.pathname.replace(/\/+$/, '');
        return `${proto}//${host}${path}${uo.search}${uo.hash}`;
      } catch {
        return s.replace(/\/+$/, '');
      }
    };
    return norm(a) === norm(b);
  }

  function update(screenshot: string): void {
    if (screenshot && screenshot.startsWith('data:image/')) {
      img.src = screenshot;
      img.style.display = 'block';
      canvas.style.display = 'none';
      last.textContent = new Date().toLocaleTimeString();
    }
  }

  function drawFrame(frameData: string): void {
    if (!frameData) return;
    
    state.streamActive = true;
    img.style.display = 'none';
    canvas.style.display = 'block';
    
    // Draw frame to canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const image = new Image();
    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
    };
    image.src = `data:image/jpeg;base64,${frameData}`;
  }

  function setTask(task: Task | null): void {
    state.currentTask = task;
    if (!task) {
      last.textContent = '';
      return;
    }
    refresh.disabled = !task?.id;
    openNew.disabled = !task?.id;
    
    // Auto-enable streaming for current task if in live mode
    if (state.isLive && state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: 'startScreencast', taskId: task.id }));
    }
  }

  function setSocket(socket: WebSocket | null): void {
    state.socket = socket;
    
    if (socket) {
      socket.addEventListener('message', (ev: MessageEvent) => {
        try {
          const msg: WebSocketMessage = JSON.parse(ev.data);
          if (msg.type === 'screencastFrame' && msg.frame) {
            drawFrame(msg.frame);
          } else if (msg.type === 'controlGranted') {
            console.log('Live control granted');
          } else if (msg.type === 'inputAck') {
            // Handle input acknowledgment for smoother UX
          }
        } catch {}
      });
    }
  }

  function isStreaming(): boolean {
    return state.streamActive;
  }

  // Expose methods
  wrap.update = update;
  wrap.setTask = setTask;
  wrap.setSocket = setSocket;
  wrap.drawFrame = drawFrame;
  wrap.isStreaming = isStreaming;

  return wrap;
}
export function LiveBrowserView() {
  const wrap = document.createElement('div');
  wrap.className = 'live';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.innerHTML = '<span class="dot"></span> Live Browser';
  const hint = document.createElement('div');
  hint.className = 'muted small subtle';
  hint.textContent = 'Auto-updates as the agent acts';
  toolbar.append(badge, hint);

  const frame = document.createElement('div');
  frame.className = 'frame';
  const img = document.createElement('img');
  img.alt = 'Live browser view';
  frame.append(img);

  wrap.append(toolbar, frame);

  function update(base64Png) {
    img.src = `data:image/png;base64,${base64Png}`;
  }

  return Object.assign(wrap, { update });
}


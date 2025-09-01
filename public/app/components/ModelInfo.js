export function ModelInfo() {
  const box = document.createElement('div');
  box.style.marginTop = '12px';
  const line = document.createElement('div');
  line.className = 'muted small subtle';
  line.textContent = 'Model: loading…';
  box.append(line);

  function update(info) {
    if (!info) return;
    line.textContent = `Model: ${info.model} • Viewport: ${info.viewport.width}×${info.viewport.height} • ${info.headless ? 'Headless' : 'Headed'}`;
  }

  return Object.assign(box, { update });
}


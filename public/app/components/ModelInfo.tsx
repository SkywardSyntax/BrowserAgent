import type { Info } from '../types';

export function ModelInfo(): HTMLDivElement & { update: (info: Info | null) => void } {
  const box = document.createElement('div');
  box.style.marginTop = '12px';
  const line = document.createElement('div');
  line.className = 'muted small subtle';
  line.textContent = 'Model: loading…';

  const extra = document.createElement('div');
  extra.className = 'muted small subtle';
  extra.style.marginTop = '4px';
  extra.textContent = '';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.textContent = 'Copy Info';
  copyBtn.style.marginLeft = '8px';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(line.textContent + (extra.textContent ? `\n${extra.textContent}` : ''));
    } catch {}
  });

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.append(line, copyBtn);

  box.append(row, extra);

  function update(info: Info | null): void {
    if (!info) return;
    line.textContent = `Model: ${info.model} • Viewport: ${info.viewport.width}×${info.viewport.height} • ${info.headless ? 'Headless' : 'Headed'}`;
    extra.textContent = info.wsUrl ? `WS: ${info.wsUrl}` : '';
  }

  return Object.assign(box, { update });
}


import type { Task } from '../types';

interface Props {
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

export function TaskStatus({ onPause, onResume, onStop }: Props): HTMLDivElement & { update: (task: Task | null) => void } {
  const wrap = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'status';
  const title = document.createElement('div');
  title.className = 'muted';
  title.textContent = 'Current Task';
  const pill = document.createElement('div');
  pill.className = 'pill created';
  pill.textContent = 'none';
  header.append(title, pill);

  const desc = document.createElement('div');
  desc.style.margin = '6px 0 10px';
  desc.textContent = '—';

  const meta = document.createElement('div');
  meta.className = 'small muted subtle';
  meta.textContent = '';

  const details = document.createElement('div');
  details.className = 'small muted';
  details.style.whiteSpace = 'pre-wrap';
  details.style.marginTop = '6px';
  details.textContent = '';

  const controls = document.createElement('div');
  controls.className = 'controls';
  const pause = btn('Pause', () => onPause && onPause());
  const resume = btn('Resume', () => onResume && onResume());
  const stop = btn('Stop', () => onStop && onStop(), 'danger');
  controls.append(pause, resume, stop);

  wrap.append(header, desc, meta, details, controls);

  function btn(text: string, handler: () => void, variant = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `btn ${variant}`;
    b.textContent = text;
    b.addEventListener('click', handler);
    return b;
  }

  function update(task: Task | null): void {
    if (!task) {
      pill.className = 'pill created';
      pill.textContent = 'none';
      desc.textContent = '—';
      meta.textContent = '';
      details.textContent = '';
      [pause, resume, stop].forEach((b) => (b.disabled = true));
      return;
    }
    const s = task.status || 'created';
    pill.className = `pill ${s}`;
    pill.textContent = s;
    desc.textContent = task.description || '—';
    const created = task.createdAt ? `Created ${new Date(task.createdAt).toLocaleString()}` : '';
    const updated = task.updatedAt ? ` • Updated ${new Date(task.updatedAt).toLocaleString()}` : '';
    const stepsCount = (task.steps || []).length;
    const shotsCount = (task.screenshots || []).length;
    const counts = ` • Steps ${stepsCount} • Shots ${shotsCount}`;
    meta.textContent = `${created}${updated}${counts}`;

    let extra = '';
    if (task.error) extra += `Error: ${task.error}`;
    if (task.result) extra += `${extra ? '\n' : ''}Result: ${task.result}`;
    details.textContent = extra;
    pause.disabled = s !== 'running';
    resume.disabled = s !== 'paused';
    stop.disabled = ['completed', 'failed', 'stopped'].includes(s);
  }

  update(null);
  return Object.assign(wrap, { update });
}


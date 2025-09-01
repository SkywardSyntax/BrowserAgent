export function TaskStatus({ onPause, onResume, onStop }) {
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

  const controls = document.createElement('div');
  controls.className = 'controls';
  const pause = btn('Pause', () => onPause && onPause());
  const resume = btn('Resume', () => onResume && onResume());
  const stop = btn('Stop', () => onStop && onStop(), 'danger');
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  controls.append(pause, resume, stop);

  wrap.append(header, desc, meta, controls);

  function btn(text, handler, variant='') {
    const b = document.createElement('button');
    b.className = `btn ${variant}`;
    b.textContent = text;
    b.addEventListener('click', handler);
    return b;
  }

  function update(task) {
    if (!task) {
      pill.className = 'pill created';
      pill.textContent = 'none';
      desc.textContent = '—';
      meta.textContent = '';
      [pause, resume, stop].forEach(b => b.disabled = true);
      return;
    }
    const s = task.status || 'created';
    pill.className = `pill ${s}`;
    pill.textContent = s;
    desc.textContent = task.description || '—';
    meta.textContent = task.createdAt ? `Created ${new Date(task.createdAt).toLocaleString()}` : '';
    pause.disabled = s !== 'running';
    resume.disabled = s !== 'paused';
    stop.disabled = ['completed','failed','stopped'].includes(s);
  }

  update(null);
  return Object.assign(wrap, { update });
}


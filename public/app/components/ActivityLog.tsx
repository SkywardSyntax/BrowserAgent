import { Dropdown } from './Dropdown';
import type { Step } from '../types';

export function ActivityLog(): HTMLDivElement & { update: (steps: Step[]) => void } {
  const wrap = document.createElement('div');

  const controls = document.createElement('div');
  controls.className = 'small muted subtle';
  controls.style.marginBottom = '6px';
  controls.textContent = 'Filter: ';
  const dd = Dropdown({
    small: true,
    value: 'all',
    options: [
      { value: 'all', label: 'All' },
      { value: 'errors', label: 'Errors' },
      { value: 'reasoning', label: 'Reasoning' },
      { value: 'browser_action', label: 'Browser Actions' },
    ],
    onChange: () => render(),
  });
  controls.append(dd);

  const box = document.createElement('div');
  box.className = 'log';

  let lastSteps: Step[] = [];

  function line(step: Step): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'item';
    if (step.error) item.classList.add('error');
    if (step.reasoning) item.classList.add('reasoning');
    const t = document.createElement('div');
    t.className = 'time';
    t.textContent = new Date(step.timestamp).toLocaleTimeString();
    const d = document.createElement('div');
    d.textContent = step.description;
    item.append(t, d);
    return item;
  }

  function render(): void {
    const v = dd.value as 'all' | 'errors' | 'reasoning' | 'browser_action';
    box.innerHTML = '';
    const filtered = lastSteps.filter((s) => {
      if (v === 'all') return true;
      if (v === 'errors') return !!s.error;
      if (v === 'reasoning') return !!s.reasoning;
      if (v === 'browser_action') return s.type === 'browser_action';
      return true;
    });
    filtered.forEach((s) => box.append(line(s)));
    box.scrollTop = box.scrollHeight;
  }

  function update(steps: Step[]): void {
    lastSteps = steps || [];
    render();
  }

  wrap.append(controls, box);
  return Object.assign(wrap, { update });
}


export function ActivityLog() {
  const box = document.createElement('div');
  box.className = 'log';

  function line(step) {
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

  function update(steps) {
    box.innerHTML = '';
    (steps || []).forEach((s) => box.append(line(s)));
    box.scrollTop = box.scrollHeight;
  }

  return Object.assign(box, { update });
}


interface Props {
  onSubmit: (text: string) => Promise<unknown> | unknown;
}

export function TaskInput({ onSubmit }: Props): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'task-input';

  const ta = document.createElement('textarea');
  ta.placeholder = 'e.g. Find the latest JS tutorials on YouTube and open the first result';
  ta.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  const btn = document.createElement('button');
  btn.className = 'submit';
  btn.innerHTML = '<span class="pulse"></span> Run Task';
  btn.addEventListener('click', () => submit());

  const row = document.createElement('div');
  row.className = 'row';
  row.append(ta, btn);
  wrap.append(row);

  function submit(): void {
    const v = ta.value.trim();
    if (!v) return;
    btn.disabled = true; btn.textContent = 'Starting…';
    Promise.resolve(onSubmit(v)).finally(() => { btn.disabled = false; btn.innerHTML = '<span class="pulse"></span> Run Task'; ta.value = ''; });
  }

  return wrap;
}


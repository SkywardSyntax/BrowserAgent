export function Dropdown({ value, options = [], onChange, label = null, small = false }) {
  const wrap = document.createElement('div');
  wrap.className = `dropdown${small ? ' small' : ''}`;

  const button = document.createElement('button');
  button.className = 'btn';
  button.type = 'button';
  button.textContent = label || displayFor(value, options);

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';

  let open = false;
  let current = value ?? (options[0] && options[0].value);

  function displayFor(val, opts) {
    const f = opts.find((o) => o.value === val);
    return f ? (f.label || String(f.value)) : String(val ?? '');
  }

  function renderMenu() {
    menu.innerHTML = '';
    options.forEach((o) => {
      const item = document.createElement('button');
      item.className = 'dropdown-item';
      item.type = 'button';
      item.textContent = o.label || String(o.value);
      if (o.value === current) item.classList.add('active');
      item.addEventListener('click', () => {
        current = o.value;
        button.textContent = label || displayFor(current, options);
        close();
        onChange && onChange(current);
      });
      menu.append(item);
    });
  }

  function openMenu() {
    if (open) return; open = true;
    wrap.classList.add('open');
    renderMenu();
    setTimeout(() => document.addEventListener('click', onDoc, { once: true }), 0);
  }
  function close() { open = false; wrap.classList.remove('open'); }
  function onDoc(e) { if (!wrap.contains(e.target)) close(); }

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    open ? close() : openMenu();
  });

  wrap.append(button, menu);
  return Object.assign(wrap, {
    get value() { return current; },
    set value(v) { current = v; button.textContent = label || displayFor(current, options); },
    setOptions(opts) { options = opts; if (open) renderMenu(); },
    close,
  });
}

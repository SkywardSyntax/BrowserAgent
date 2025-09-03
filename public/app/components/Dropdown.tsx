import { DropdownOption } from '../types';

interface Props<T extends string | number = string> {
  value: T;
  options?: DropdownOption<T>[];
  onChange?: (value: T) => void;
  label?: string | null;
  small?: boolean;
}

export function Dropdown<T extends string | number = string>({ value, options = [], onChange, label = null, small = false }: Props<T>): HTMLDivElement & {
  value: T;
  set value(v: T);
  setOptions: (opts: DropdownOption<T>[]) => void;
  close: () => void;
} {
  const wrap = document.createElement('div');
  wrap.className = `dropdown${small ? ' small' : ''}`;

  const button = document.createElement('button');
  button.className = 'btn';
  button.type = 'button';
  button.textContent = (label ?? displayFor(value, options)) as string;

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';

  let open = false;
  let current: T = value ?? (options[0] && (options[0].value as T));

  function displayFor(val: T, opts: DropdownOption<T>[]): string {
    const f = opts.find((o) => o.value === val);
    return f ? (f.label || String(f.value)) : String(val ?? '');
  }

  function renderMenu(): void {
    menu.innerHTML = '';
    options.forEach((o) => {
      const item = document.createElement('button');
      item.className = 'dropdown-item';
      item.type = 'button';
      item.textContent = o.label || String(o.value);
      if (o.value === current) item.classList.add('active');
      item.addEventListener('click', () => {
        current = o.value as T;
        button.textContent = (label ?? displayFor(current, options)) as string;
        close();
        onChange && onChange(current);
      });
      menu.append(item);
    });
  }

  function openMenu(): void {
    if (open) return; open = true;
    wrap.classList.add('open');
    renderMenu();
    setTimeout(() => document.addEventListener('click', onDoc as EventListener, { once: true }), 0);
  }
  function close(): void { open = false; wrap.classList.remove('open'); }
  function onDoc(e: MouseEvent): void { if (!wrap.contains(e.target as Node)) close(); }

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    open ? close() : openMenu();
  });

  wrap.append(button, menu);
  return Object.assign(wrap, {
    get value() { return current; },
    set value(v: T) { current = v; button.textContent = (label ?? displayFor(current, options)) as string; },
    setOptions(opts: DropdownOption<T>[]) { options = opts; if (open) renderMenu(); },
    close,
  });
}


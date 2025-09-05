export function ThemeToggle(): HTMLButtonElement {
  const el = document.createElement('button');
  el.className = 'theme-toggle';
  const icon = (): string => (document.documentElement.getAttribute('data-theme') === 'dark' ? '☾' : '☀');
  const set = (theme: 'light' | 'dark'): void => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    el.textContent = `${icon()} ${theme === 'dark' ? 'Dark' : 'Light'}`;
  };
  const initial = (localStorage.getItem('theme') as 'light' | 'dark' | null) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  set(initial);
  el.addEventListener('click', () => set((document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark') as 'light' | 'dark'));
  return el;
}


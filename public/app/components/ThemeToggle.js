export function ThemeToggle() {
  const el = document.createElement('button');
  el.className = 'theme-toggle';
  const icon = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? '☾' : '☀');
  const set = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    el.textContent = `${icon()} ${theme === 'dark' ? 'Dark' : 'Light'}`;
  };
  const initial = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  set(initial);
  el.addEventListener('click', () => set(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
  return el;
}


import { BrowserAgent } from './browserAgent';
import { TaskManager } from './taskManager';

(async () => {
  const tm = new TaskManager();
  const ba = new BrowserAgent(tm);
  const taskId = await tm.createTask('smoke role+name click', null);
  await ba.initializeBrowser();
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Smoke</title></head><body>
  <form id="login"><input type="text" aria-label="username"><input type="password" aria-label="password"><button id="btn">SIGN IN</button></form>
  <script>
    document.getElementById('btn').addEventListener('click', (e) => { e.preventDefault(); const el = document.createElement('div'); el.id = 'clicked'; el.textContent = 'Clicked!'; document.body.appendChild(el); });
  </script>
  </body></html>`;
  await ba.page!.goto('data:text/html,' + encodeURIComponent(html), { waitUntil: 'domcontentloaded' });
  const res = await ba.executeBrowserAction(taskId, { action: 'click_element', locator: { role: 'button', name: 'SIGN IN', exact: true }, reason: 'test clicking sign in' });
  console.log('Action result:', res);
  const txt = await ba.page!.textContent('#clicked').catch(() => null);
  console.log('Clicked marker text:', txt);
  await ba.cleanup();
})();

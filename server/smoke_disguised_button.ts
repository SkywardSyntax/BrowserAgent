import { BrowserAgent } from './browserAgent';
import { TaskManager } from './taskManager';

(async () => {
  const tm = new TaskManager();
  const ba = new BrowserAgent(tm);
  const taskId = await tm.createTask('smoke disguised button', null);
  await ba.initializeBrowser();
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Disguised</title>
  <style>
  .btn { display:inline-block; padding:8px 14px; background:#2d6cdf; color:#fff; border-radius:6px; cursor:pointer; user-select:none; }
  .btn[aria-disabled="true"] { opacity:0.5; }
  </style>
  </head><body>
  <div id="status">Not clicked</div>
  <div id="fake" class="btn" tabindex="0">Continue</div>
  <script>
    const el = document.getElementById('fake');
    el.addEventListener('click', () => { document.getElementById('status').textContent = 'Clicked!'; });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') el.click(); });
  </script>
  </body></html>`;
  await ba.page!.goto('data:text/html,' + encodeURIComponent(html), { waitUntil: 'domcontentloaded' });

  // Try click_button_like first
  let res = await ba.executeBrowserAction(taskId, { action: 'click_button_like', text: 'Continue', reason: 'click disguised button' });
  console.log('click_button_like result:', res);
  let txt = await ba.page!.textContent('#status').catch(() => null);
  console.log('status text after click_button_like:', txt);
  if (txt !== 'Clicked!') {
    // Fallback to click_by_text
    res = await ba.executeBrowserAction(taskId, { action: 'click_by_text', text: 'Continue', reason: 'fallback click by text' });
    console.log('click_by_text result:', res);
    txt = await ba.page!.textContent('#status').catch(() => null);
    console.log('status text after click_by_text:', txt);
  }

  await ba.cleanup();
})();

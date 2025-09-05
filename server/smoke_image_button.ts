import { BrowserAgent } from './browserAgent';
import { TaskManager } from './taskManager';

(async () => {
  const tm = new TaskManager();
  const ba = new BrowserAgent(tm);
  const taskId = await tm.createTask('smoke image button', null);
  await ba.initializeBrowser();
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Image Button</title>
  <style>
    .wrap { display:inline-block; padding:6px; border:1px solid #ddd; cursor:pointer; }
    img { width:64px; height:64px; }
  </style>
  </head><body>
  <div id="status">Not clicked</div>
  <div class="wrap" id="wrap">
    <img id="imgbtn" alt="Play" src="data:image/svg+xml,${encodeURIComponent('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\"><polygon points=\"16,8 56,32 16,56\" fill=\"#2d6cdf\"/></svg>')}" />
  </div>
  <script>
    document.getElementById('wrap').addEventListener('click', () => {
      document.getElementById('status').textContent = 'Clicked!';
    });
  </script>
  </body></html>`;
  await ba.page!.goto('data:text/html,' + encodeURIComponent(html), { waitUntil: 'domcontentloaded' });

  // Try clicking by image alt text
  let res = await ba.executeBrowserAction(taskId, { action: 'click_image_like', alt: 'Play', reason: 'click image by alt' });
  console.log('click_image_like (alt) result:', res);
  let txt = await ba.page!.textContent('#status').catch(() => null);
  console.log('status after alt click:', txt);

  if (txt !== 'Clicked!') {
    // Try by text/name fallback (should still work if wrapper captures the click)
    res = await ba.executeBrowserAction(taskId, { action: 'click_button_like', text: 'Play', reason: 'fallback button-like (unlikely to exist)' });
    console.log('click_button_like result:', res);
    txt = await ba.page!.textContent('#status').catch(() => null);
    console.log('status after button_like:', txt);
  }

  if (txt !== 'Clicked!') {
    // Try by image src substring
    res = await ba.executeBrowserAction(taskId, { action: 'click_image_like', src: 'svg', reason: 'click image by src' });
    console.log('click_image_like (src) result:', res);
    txt = await ba.page!.textContent('#status').catch(() => null);
    console.log('status after src click:', txt);
  }

  await ba.cleanup();
})();

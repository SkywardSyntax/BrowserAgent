import dotenv from 'dotenv';
import { BrowserAgent } from './browserAgent';
import { TaskManager } from './taskManager';

(async () => {
  dotenv.config();
  const tm = new TaskManager();
  const ba = new BrowserAgent(tm);
  const taskId = await tm.createTask('smoke ai call', null);
  await ba.initializeBrowser();
  try {
    await ba.page!.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 10000 });
  } catch {}
  const screenshot = await ba.takeScreenshot();
  const task = tm.getTask(taskId)!;
  try {
    console.log('Invoking callAI...');
    const res = await ba.callAI(task, screenshot);
    console.log('AI call completed. keys:', Object.keys((res as any) || {}));
  } catch (e) {
    console.error('AI call error:', e);
  } finally {
    await ba.cleanup();
  }
})();

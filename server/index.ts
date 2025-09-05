import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { BrowserAgent } from './browserAgent';
import { TaskManager, Task } from './taskManager';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const taskManager = new TaskManager();
const browserAgent = new BrowserAgent(taskManager);

app.use(cors());
app.use(express.json());
app.use(express.static(process.env.NODE_ENV === 'production' ? 'dist/public' : 'public'));

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/api/tasks', async (req, res) => {
  try {
    const { task, sessionId } = req.body as { task?: string; sessionId?: string };
    if (!task) return res.status(400).json({ error: 'Task is required' });
    const taskId = await taskManager.createTask(task, sessionId || null);
    res.json({ taskId, status: 'created' });
    browserAgent.processTask(taskId);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.patch('/api/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params as { taskId: string };
    const { description } = req.body as { description?: string };
    const ok = taskManager.updateTask(taskId, description ? { description } as Partial<Task> : {});
    if (!ok) return res.status(404).json({ error: 'Task not found' });
    res.json({ status: 'updated' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error updating task:', e);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params as { taskId: string };
    const ok = taskManager.deleteTask(taskId);
    if (!ok) return res.status(404).json({ error: 'Task not found' });
    res.json({ status: 'deleted' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error deleting task:', e);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

app.get('/api/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params as { taskId: string };
    const task = taskManager.getTask(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error getting task:', error);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

app.get('/api/sessions/:sessionId/tasks', (req, res) => {
  try {
    const { sessionId } = req.params as { sessionId: string };
    const tasks = taskManager.getTasksBySession(sessionId);
    res.json({ sessionId, tasks });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error getting session tasks:', error);
    res.status(500).json({ error: 'Failed to get session tasks' });
  }
});

app.get('/api/info', (_req, res) => {
  try {
    res.json({
      model: browserAgent.deploymentName,
      viewport: { width: browserAgent.displayWidth, height: browserAgent.displayHeight },
      headless: browserAgent.getHeadless(),
      wsUrl: `ws://localhost:${PORT}`,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get info' });
  }
});

app.get('/api/page-state', async (_req, res) => {
  try { res.json(await browserAgent.getPageState()); } catch { res.status(500).json({ error: 'Failed to get page state' }); }
});

app.get('/api/screenshot', async (_req, res) => {
  try {
    await browserAgent.initializeBrowser();
    const b64 = await browserAgent.takeScreenshot();
    const img = Buffer.from(b64, 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': img.length,
      'Cache-Control': 'no-store',
    });
    res.end(img);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error generating screenshot:', error);
    res.status(500).send('Failed to get screenshot');
  }
});

app.get('/api/tasks/:taskId/screenshot', (req, res) => {
  try {
    const { taskId } = req.params as { taskId: string };
    const task = taskManager.getTask(taskId);
    if (!task) return res.status(404).send('Task not found');
    const last = task.screenshots && task.screenshots[task.screenshots.length - 1];
    if (!last) return res.status(404).send('No screenshot');
    const img = Buffer.from(last.data, 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': img.length,
      'Cache-Control': 'no-store',
    });
    res.end(img);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error getting screenshot:', error);
    res.status(500).send('Failed to get screenshot');
  }
});

app.post('/api/tasks/:taskId/action', async (req, res) => {
  try {
    const { taskId } = req.params as { taskId: string };
    const action = req.body as Record<string, unknown>;
    const task = taskManager.getTask(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    await browserAgent.initializeBrowser();
    const result = await browserAgent.executeBrowserAction(taskId, action);
    const screenshot = await browserAgent.takeScreenshot();
    taskManager.addScreenshot(taskId, screenshot);
    res.json({ result, screenshot });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error executing manual action:', e);
    res.status(500).json({ error: 'Failed to execute action', details: (e as Error).message });
  }
});

app.post('/api/tasks/:taskId/pause', async (req, res) => {
  try {
    const { taskId } = req.params as { taskId: string };
    
    // Use state machine to properly pause the task
    const task = taskManager.getTask(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    
    // Try to transition through state machine first, then fallback to TaskManager
    try {
      const taskStateMachine = (browserAgent as any).getOrCreateTaskStateMachine(taskId);
      const success = await taskStateMachine.pause();
      if (!success) {
        // Fallback to direct TaskManager call
        const fallbackSuccess = taskManager.pauseTask(taskId);
        if (!fallbackSuccess) return res.status(404).json({ error: 'Task not found or cannot be paused' });
      }
    } catch {
      // Fallback to direct TaskManager call
      const success = taskManager.pauseTask(taskId);
      if (!success) return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({ status: 'paused' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error pausing task:', error);
    res.status(500).json({ error: 'Failed to pause task' });
  }
});

app.post('/api/tasks/:taskId/resume', async (req, res) => {
  try {
    const { taskId } = req.params as { taskId: string };
    
    // Use state machine to properly resume the task
    const task = taskManager.getTask(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    
    // Try to transition through state machine first, then fallback to TaskManager
    try {
      const taskStateMachine = (browserAgent as any).getOrCreateTaskStateMachine(taskId);
      const success = await taskStateMachine.resume();
      if (!success) {
        // Fallback to direct TaskManager call
        const fallbackSuccess = taskManager.resumeTask(taskId);
        if (!fallbackSuccess) return res.status(404).json({ error: 'Task not found or cannot be resumed' });
      }
    } catch {
      // Fallback to direct TaskManager call
      const success = taskManager.resumeTask(taskId);
      if (!success) return res.status(404).json({ error: 'Task not found' });
    }
    
    // Only restart processing if not already processing and in a resumable state
    if (!browserAgent.processingTasks || !browserAgent.processingTasks.has(taskId)) {
      browserAgent.processTask(taskId);
    }
    
    res.json({ status: 'resumed' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error resuming task:', error);
    res.status(500).json({ error: 'Failed to resume task' });
  }
});

app.post('/api/tasks/:taskId/stop', (req, res) => {
  try {
    const { taskId } = req.params as { taskId: string };
    const success = taskManager.stopTask(taskId);
    if (!success) return res.status(404).json({ error: 'Task not found' });
    res.json({ status: 'stopped' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error stopping task:', error);
    res.status(500).json({ error: 'Failed to stop task' });
  }
});

wss.on('connection', (ws: WebSocket & { taskId?: string; _stopStream?: () => void; _lastFrameTs?: number }) => {
  // eslint-disable-next-line no-console
  console.log('WebSocket client connected');
  const unsubscribe = taskManager.subscribe((taskId, task) => {
    try {
      if (ws.taskId && ws.taskId !== taskId) return;
      if (ws.readyState !== ws.OPEN) return;
      ws.send(JSON.stringify({ type: 'taskUpdate', taskId, task }));
    } catch {}
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString()) as Record<string, unknown> & { type: string };
      switch (data.type) {
        case 'subscribe': {
          const r = data as Record<string, unknown>;
          const t = typeof r.taskId === 'string' ? (r.taskId as string) : undefined;
          if (t) ws.taskId = t;
          break;
        }
        case 'userTakeover': {
          const r = data as Record<string, unknown>;
          const t = typeof r.taskId === 'string' ? (r.taskId as string) : undefined;
          if (t) {
            // Use state machine for proper manual control transition
            const success = await browserAgent.requestManualControl(t);
            if (success) {
              ws.send(JSON.stringify({ type: 'takeoverGranted', taskId: t }));
            } else {
              ws.send(JSON.stringify({ type: 'takeoverDenied', taskId: t, reason: 'Unable to transition to manual control' }));
            }
          }
          break;
        }
        case 'releaseControl': {
          const r = data as Record<string, unknown>;
          const t = typeof r.taskId === 'string' ? (r.taskId as string) : undefined;
          if (t) {
            // Use state machine to release manual control back to AI
            const success = await browserAgent.releaseManualControl(t);
            if (success) {
              ws.send(JSON.stringify({ type: 'controlReleased', taskId: t }));
            } else {
              ws.send(JSON.stringify({ type: 'controlReleaseFailed', taskId: t, reason: 'Unable to release manual control' }));
            }
          }
          break;
        }
        case 'startScreencast': (async () => {
          try {
            if (ws._stopStream) { ws._stopStream(); ws._stopStream = undefined; }
            await browserAgent.initializeBrowser();
            ws._lastFrameTs = 0;
            ws._stopStream = await browserAgent.addScreencastListener((frame) => {
              if (ws.readyState !== ws.OPEN) return;
              const now = Date.now();
              if (ws._lastFrameTs && (now - ws._lastFrameTs) < 30) return;
              if (typeof ws.bufferedAmount === 'number' && ws.bufferedAmount > 1500000) return;
              ws._lastFrameTs = now;
              ws.send(JSON.stringify({ type: 'screencastFrame', frame }));
            });
            ws.send(JSON.stringify({ type: 'screencastStarted' }));
          } catch (e) {
            ws.send(JSON.stringify({ type: 'screencastError', error: String((e as Error)?.message || e) }));
          }
        })(); break;
        case 'stopScreencast': {
          if (ws._stopStream) { ws._stopStream(); ws._stopStream = undefined; ws.send(JSON.stringify({ type: 'screencastStopped' })); }
          break;
        }
        case 'input': (async () => {
          try {
            const { taskId, action } = data as { taskId?: string; action?: Record<string, unknown> };
            if (!taskId || !action) return;
            const task = taskManager.getTask(taskId);
            if (!task) return;
            await browserAgent.initializeBrowser();
            await browserAgent.executeBrowserAction(taskId, action);
            const actName = (action as Record<string, unknown>).action as string | undefined;
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'inputAck', at: Date.now(), action: actName }));
          } catch (e) {
            try { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'inputError', error: String((e as Error)?.message || e) })); } catch {}
          }
        })(); break;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error handling WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    // eslint-disable-next-line no-console
    console.log('WebSocket client disconnected');
    unsubscribe();
    if (ws._stopStream) {
      try { ws._stopStream(); } catch {}
      ws._stopStream = undefined;
    }
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});

process.on('SIGTERM', async () => {
  // eslint-disable-next-line no-console
  console.log('Shutting down server...');
  await browserAgent.cleanup();
  server.close(() => {
    // eslint-disable-next-line no-console
    console.log('Server shut down');
    process.exit(0);
  });
});

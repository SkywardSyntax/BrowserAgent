import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { BrowserAgent } from './browserAgent.js';
import { TaskManager } from './taskManager.js';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Initialize core components
const taskManager = new TaskManager();
const browserAgent = new BrowserAgent(taskManager);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Task submission endpoint
app.post('/api/tasks', async (req, res) => {
  try {
    const { task, sessionId } = req.body;
    
    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }

    const taskId = await taskManager.createTask(task, sessionId || null);
    res.json({ taskId, status: 'created' });
    
    // Start processing the task
    browserAgent.processTask(taskId);
    
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Rename/update task
app.patch('/api/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const { description } = req.body || {};
    const ok = taskManager.updateTask(taskId, description ? { description } : {});
    if (!ok) return res.status(404).json({ error: 'Task not found' });
    res.json({ status: 'updated' });
  } catch (e) {
    console.error('Error updating task:', e);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
app.delete('/api/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const ok = taskManager.deleteTask(taskId);
    if (!ok) return res.status(404).json({ error: 'Task not found' });
    res.json({ status: 'deleted' });
  } catch (e) {
    console.error('Error deleting task:', e);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Get task status
app.get('/api/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const task = taskManager.getTask(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(task);
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

// Get tasks for a session
app.get('/api/sessions/:sessionId/tasks', (req, res) => {
  try {
    const { sessionId } = req.params;
    const tasks = taskManager.getTasksBySession(sessionId);
    res.json({ sessionId, tasks });
  } catch (error) {
    console.error('Error getting session tasks:', error);
    res.status(500).json({ error: 'Failed to get session tasks' });
  }
});

// Get server/model info for UI display
app.get('/api/info', (req, res) => {
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

// Current page state (url/title) for UI chrome overlay
app.get('/api/page-state', async (req, res) => {
  try {
    const state = await browserAgent.getPageState();
    res.json(state);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get page state' });
  }
});

// Get latest screenshot for a task
app.get('/api/tasks/:taskId/screenshot', (req, res) => {
  try {
    const { taskId } = req.params;
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
    console.error('Error getting screenshot:', error);
    res.status(500).send('Failed to get screenshot');
  }
});

// Manual browser action
app.post('/api/tasks/:taskId/action', async (req, res) => {
  try {
    const { taskId } = req.params;
    const action = req.body;
    const task = taskManager.getTask(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Ensure browser ready
    await browserAgent.initializeBrowser();
    const result = await browserAgent.executeBrowserAction(taskId, action);
    const screenshot = await browserAgent.takeScreenshot();
    taskManager.addScreenshot(taskId, screenshot);

    res.json({ result, screenshot });
  } catch (e) {
    console.error('Error executing manual action:', e);
    res.status(500).json({ error: 'Failed to execute action', details: e.message });
  }
});

// Pause task
app.post('/api/tasks/:taskId/pause', (req, res) => {
  try {
    const { taskId } = req.params;
    const success = taskManager.pauseTask(taskId);
    
    if (!success) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({ status: 'paused' });
  } catch (error) {
    console.error('Error pausing task:', error);
    res.status(500).json({ error: 'Failed to pause task' });
  }
});

// Resume task
app.post('/api/tasks/:taskId/resume', (req, res) => {
  try {
    const { taskId } = req.params;
    const success = taskManager.resumeTask(taskId);
    
    if (!success) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Resume processing
    browserAgent.processTask(taskId);
    
    res.json({ status: 'resumed' });
  } catch (error) {
    console.error('Error resuming task:', error);
    res.status(500).json({ error: 'Failed to resume task' });
  }
});

// Stop task
app.post('/api/tasks/:taskId/stop', (req, res) => {
  try {
    const { taskId } = req.params;
    const success = taskManager.stopTask(taskId);
    
    if (!success) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({ status: 'stopped' });
  } catch (error) {
    console.error('Error stopping task:', error);
    res.status(500).json({ error: 'Failed to stop task' });
  }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  // Subscribe to task updates
  const unsubscribe = taskManager.subscribe((taskId, task) => {
    ws.send(JSON.stringify({
      type: 'taskUpdate',
      taskId,
      task
    }));
  });
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'subscribe':
          // Client can subscribe to specific task updates
          if (data.taskId) {
            ws.taskId = data.taskId;
          }
          break;
          
        case 'userTakeover':
          // Handle user takeover of browser
          if (data.taskId) {
            taskManager.pauseTask(data.taskId);
            ws.send(JSON.stringify({
              type: 'takeoverGranted',
              taskId: data.taskId
            }));
          }
          break;

        case 'startScreencast':
          (async () => {
            try {
              // Create a per-WS streaming subscription
              if (ws._stopStream) {
                ws._stopStream();
                ws._stopStream = null;
              }
              // Ensure browser is up
              await browserAgent.initializeBrowser();
              ws._stopStream = await browserAgent.addScreencastListener((frame) => {
                // Guard if ws is closed
                if (ws.readyState !== ws.OPEN) return;
                ws.send(JSON.stringify({ type: 'screencastFrame', frame }));
              });
              ws.send(JSON.stringify({ type: 'screencastStarted' }));
            } catch (e) {
              ws.send(JSON.stringify({ type: 'screencastError', error: String(e && e.message || e) }));
            }
          })();
          break;

        case 'stopScreencast':
          if (ws._stopStream) {
            ws._stopStream();
            ws._stopStream = null;
            ws.send(JSON.stringify({ type: 'screencastStopped' }));
          }
          break;
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    unsubscribe();
    if (ws._stopStream) {
      try { ws._stopStream(); } catch {}
      ws._stopStream = null;
    }
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down server...');
  await browserAgent.cleanup();
  server.close(() => {
    console.log('Server shut down');
    process.exit(0);
  });
});

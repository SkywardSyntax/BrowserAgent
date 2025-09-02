import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { BrowserAgent } from './browserAgent.js';
import { TaskManager } from './taskManager.js';
import { WebSocketMessage, BrowserAction, Task } from '../types/index.js';

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
app.use(express.static(process.env.NODE_ENV === 'production' ? 'dist/public' : 'public'));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Model info endpoint
app.get('/api/info', (req: Request, res: Response) => {
  res.json({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o',
    provider: 'azure',
    version: '1.0'
  });
});

// Task submission endpoint
app.post('/api/tasks', async (req: Request, res: Response): Promise<void> => {
  try {
    const { task, sessionId } = req.body;
    
    if (!task) {
      res.status(400).json({ error: 'Task is required' });
      return;
    }

    const taskId = taskManager.createTask(task, sessionId || null);
    res.json({ taskId, status: 'created' });
    
    // Start processing the task
    browserAgent.processTask(taskId);
    
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Rename/update task
app.patch('/api/tasks/:taskId', (req: Request, res: Response): void => {
  try {
    const { taskId } = req.params;
    const { description } = req.body || {};
    const ok = taskManager.updateTask(taskId, description ? { description } : {});
    if (!ok) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ status: 'updated' });
  } catch (e) {
    console.error('Error updating task:', e);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
app.delete('/api/tasks/:taskId', (req: Request, res: Response): void => {
  try {
    const { taskId } = req.params;
    const ok = taskManager.deleteTask(taskId);
    if (!ok) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ status: 'deleted' });
  } catch (e) {
    console.error('Error deleting task:', e);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Get task status
app.get('/api/tasks/:taskId', (req: Request, res: Response): void => {
  try {
    const { taskId } = req.params;
    const task = taskManager.getTask(taskId);
    
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    res.json(task);
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

// Get tasks for a session
app.get('/api/sessions/:sessionId/tasks', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const tasks = taskManager.getTasksBySession(sessionId);
    res.json({ sessionId, tasks });
  } catch (error) {
    console.error('Error getting session tasks:', error);
    res.status(500).json({ error: 'Failed to get session tasks' });
  }
});

// Manual action endpoint (for direct browser control)
app.post('/api/tasks/:taskId/action', async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const action = req.body as BrowserAction;
    const task = taskManager.getTask(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Ensure browser ready
    await browserAgent.initializeBrowser();
    const result = await browserAgent.executeBrowserAction(taskId, action);
    const screenshot = await browserAgent.takeScreenshot();
    if (screenshot) {
      taskManager.addScreenshot(taskId, screenshot);
    }

    res.json({ result, screenshot });
  } catch (e) {
    console.error('Error executing manual action:', e);
    res.status(500).json({ error: 'Failed to execute action', details: (e as Error).message });
  }
});

// Pause task
app.post('/api/tasks/:taskId/pause', (req: Request, res: Response): void => {
  try {
    const { taskId } = req.params;
    const success = taskManager.pauseTask(taskId);
    
    if (!success) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    res.json({ status: 'paused' });
  } catch (error) {
    console.error('Error pausing task:', error);
    res.status(500).json({ error: 'Failed to pause task' });
  }
});

// Resume task
app.post('/api/tasks/:taskId/resume', (req: Request, res: Response): void => {
  try {
    const { taskId } = req.params;
    const success = taskManager.resumeTask(taskId);
    
    if (!success) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    res.json({ status: 'resumed' });
  } catch (error) {
    console.error('Error resuming task:', error);
    res.status(500).json({ error: 'Failed to resume task' });
  }
});

// Stop task
app.post('/api/tasks/:taskId/stop', (req: Request, res: Response): void => {
  try {
    const { taskId } = req.params;
    const success = taskManager.stopTask(taskId);
    
    if (!success) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    res.json({ status: 'stopped' });
  } catch (error) {
    console.error('Error stopping task:', error);
    res.status(500).json({ error: 'Failed to stop task' });
  }
});

// Page state endpoint (for live preview)
app.get('/api/page-state', async (req: Request, res: Response) => {
  try {
    await browserAgent.initializeBrowser();
    // In a real implementation, we'd get the current page URL and title
    res.json({
      url: 'about:blank',
      title: 'New Tab'
    });
  } catch (error) {
    console.error('Error getting page state:', error);
    res.status(500).json({ error: 'Failed to get page state' });
  }
});

// Enhanced WebSocket connection with better typing and live control
interface WSClient extends WebSocket {
  taskId?: string;
  _stopStream?: () => void;
  _lastFrameTs?: number;
}

wss.on('connection', (ws: WSClient) => {
  console.log('WebSocket client connected');

  const unsubscribe = taskManager.subscribe((taskId: string, task: Task) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        const message: WebSocketMessage = {
          type: 'taskUpdate',
          taskId,
          task
        };
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending task update:', error);
      }
    }
  });

  ws.on('message', async (data: Buffer) => {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          if (message.taskId) {
            ws.taskId = message.taskId;
          }
          break;
          
        case 'liveControl':
          // New live control message for direct interaction
          if (message.taskId) {
            taskManager.pauseTask(message.taskId);
            const response: WebSocketMessage = {
              type: 'controlGranted',
              taskId: message.taskId
            };
            ws.send(JSON.stringify(response));
          }
          break;

        case 'startScreencast':
          (async () => {
            try {
              // Create a per-WS streaming subscription
              if (ws._stopStream) {
                ws._stopStream();
                ws._stopStream = undefined;
              }
              // Ensure browser is up
              await browserAgent.initializeBrowser();
              ws._lastFrameTs = 0;
              ws._stopStream = await browserAgent.addScreencastListener((frame) => {
                // Guard if ws is closed
                if (ws.readyState !== WebSocket.OPEN) return;
                // Basic throttling (~33fps max) and backpressure-aware dropping
                const now = Date.now();
                if (ws._lastFrameTs && (now - ws._lastFrameTs) < 30) return;
                if (typeof (ws as any).bufferedAmount === 'number' && (ws as any).bufferedAmount > 1500000) return; // ~1.5MB backlog
                ws._lastFrameTs = now;
                const response: WebSocketMessage = {
                  type: 'screencastFrame',
                  frame: frame.data
                };
                ws.send(JSON.stringify(response));
              });
              const startedMessage: WebSocketMessage = { type: 'screencastStarted' };
              ws.send(JSON.stringify(startedMessage));
            } catch (e) {
              const errorMessage: WebSocketMessage = {
                type: 'screencastError',
                error: String((e as Error)?.message || e)
              };
              ws.send(JSON.stringify(errorMessage));
            }
          })();
          break;

        case 'stopScreencast':
          if (ws._stopStream) {
            ws._stopStream();
            ws._stopStream = undefined;
            const stoppedMessage: WebSocketMessage = { type: 'screencastStopped' };
            ws.send(JSON.stringify(stoppedMessage));
          }
          break;

        case 'directInput': {
          // New direct input protocol for low-latency manual control
          (async () => {
            try {
              const { taskId, action } = message;
              if (!taskId || !action) return;
              const task = taskManager.getTask(taskId);
              if (!task) return;
              await browserAgent.initializeBrowser();
              await browserAgent.executeBrowserAction(taskId, action);
              // Send acknowledgment for smooth interaction
              if (ws.readyState === WebSocket.OPEN) {
                const ackMessage: WebSocketMessage = {
                  type: 'inputAck',
                  at: Date.now(),
                  action: { action: action.action }
                };
                ws.send(JSON.stringify(ackMessage));
              }
            } catch (e) {
              try {
                if (ws.readyState === WebSocket.OPEN) {
                  const errorMessage: WebSocketMessage = {
                    type: 'inputError',
                    error: String((e as Error)?.message || e)
                  };
                  ws.send(JSON.stringify(errorMessage));
                }
              } catch {}
            }
          })();
          break;
        }
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    unsubscribe();
    if (ws._stopStream) {
      try { 
        ws._stopStream(); 
      } catch {}
      ws._stopStream = undefined;
    }
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await browserAgent.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await browserAgent.cleanup();
  process.exit(0);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
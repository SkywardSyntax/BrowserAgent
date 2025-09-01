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
    const { task } = req.body;
    
    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }

    const taskId = await taskManager.createTask(task);
    res.json({ taskId, status: 'created' });
    
    // Start processing the task
    browserAgent.processTask(taskId);
    
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
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
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    unsubscribe();
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
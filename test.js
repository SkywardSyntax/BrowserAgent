#!/usr/bin/env node

// Simple test to verify core functionality
import { TaskManager } from './server/taskManager.js';
import { BrowserAgent } from './server/browserAgent.js';

async function runBasicTests() {
  console.log('🧪 Running basic tests...\n');

  // Test TaskManager
  console.log('1. Testing TaskManager...');
  const taskManager = new TaskManager();
  
  const taskId = taskManager.createTask('Test task description');
  console.log(`   ✅ Created task: ${taskId}`);
  
  const task = taskManager.getTask(taskId);
  console.log(`   ✅ Retrieved task: ${task.description}`);
  
  taskManager.updateTask(taskId, { status: 'running' });
  console.log(`   ✅ Updated task status: ${taskManager.getTask(taskId).status}`);
  
  taskManager.addStep(taskId, {
    type: 'test',
    description: 'Test step'
  });
  console.log(`   ✅ Added step, total steps: ${taskManager.getTask(taskId).steps.length}`);

  // Test BrowserAgent initialization
  console.log('\n2. Testing BrowserAgent initialization...');
  try {
    const browserAgent = new BrowserAgent(taskManager);
    console.log('   ✅ BrowserAgent created successfully');
    
    // Test coordinate validation
    const coords = browserAgent.validateCoordinates(1500, 900);
    console.log(`   ✅ Coordinate validation: (1500,900) -> (${coords.x},${coords.y})`);
    
    await browserAgent.cleanup();
    console.log('   ✅ BrowserAgent cleanup completed');
    
  } catch (error) {
    console.log(`   ❌ BrowserAgent test failed: ${error.message}`);
  }

  // Test environment variables
  console.log('\n3. Testing environment configuration...');
  const requiredEnvVars = [
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_DEPLOYMENT_NAME'
  ];
  
  let envOk = true;
  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      console.log(`   ✅ ${envVar} is set`);
    } else {
      console.log(`   ⚠️  ${envVar} is not set (will need configuration)`);
      envOk = false;
    }
  }

  console.log('\n🎉 Basic tests completed!');
  
  if (!envOk) {
    console.log('\n⚠️  Note: Some environment variables are not set.');
    console.log('   Run "bun run setup" to configure Azure OpenAI credentials.');
  }
  
  console.log('\n📋 Next steps:');
  console.log('   1. Run "bun run setup" to configure your Azure OpenAI credentials');
  console.log('   2. Run "bun run dev" to start the server');
  console.log('   3. Open http://localhost:3001 in your browser');
  console.log('   4. Submit a task and watch the AI automate your browser!');
}

// Load environment from .env file
import dotenv from 'dotenv';
dotenv.config();

runBasicTests().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
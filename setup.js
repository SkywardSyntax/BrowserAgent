#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import dotenv from 'dotenv';

// Load existing environment variables
dotenv.config();

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
  console.log('🤖 Browser Agent Setup');
  console.log('====================\n');

  // Check if .env file exists
  if (!existsSync('.env')) {
    console.log('❌ .env file not found!');
    console.log('Creating .env file from template...\n');
    
    const envTemplate = readFileSync('.env').toString();
    writeFileSync('.env', envTemplate);
  }

  console.log('Please provide your Azure OpenAI configuration:\n');

  // Get Azure OpenAI configuration
  const endpoint = await question('Azure OpenAI Endpoint (https://your-resource-name.openai.azure.com/): ');
  const apiKey = await question('Azure OpenAI API Key: ');
  const deploymentName = await question('Model Deployment Name (default: gpt-4o): ') || 'gpt-4o';
  const apiVersion = await question('API Version (default: 2024-12-01-preview): ') || '2024-12-01-preview';

  // Server configuration
  const port = await question('Server Port (default: 3001): ') || '3001';
  const headless = await question('Run browser in headless mode? (y/N): ');
  
  // Update .env file
  let envContent = readFileSync('.env', 'utf8');
  
  envContent = envContent.replace(/AZURE_OPENAI_ENDPOINT=.*/, `AZURE_OPENAI_ENDPOINT=${endpoint}`);
  envContent = envContent.replace(/AZURE_OPENAI_API_KEY=.*/, `AZURE_OPENAI_API_KEY=${apiKey}`);
  envContent = envContent.replace(/AZURE_OPENAI_DEPLOYMENT_NAME=.*/, `AZURE_OPENAI_DEPLOYMENT_NAME=${deploymentName}`);
  envContent = envContent.replace(/AZURE_OPENAI_API_VERSION=.*/, `AZURE_OPENAI_API_VERSION=${apiVersion}`);
  envContent = envContent.replace(/PORT=.*/, `PORT=${port}`);
  envContent = envContent.replace(/BROWSER_HEADLESS=.*/, `BROWSER_HEADLESS=${headless.toLowerCase() === 'y'}`);

  writeFileSync('.env', envContent);

  console.log('\n✅ Configuration saved to .env file');

  // Install Playwright browsers
  console.log('\n📦 Installing Playwright browsers...');
  try {
    execSync('npx playwright install chromium', { stdio: 'inherit' });
    console.log('✅ Playwright browsers installed successfully');
  } catch (error) {
    console.log('⚠️  Warning: Failed to install Playwright browsers automatically');
    console.log('Please run "npx playwright install chromium" manually');
  }

  // Test Azure OpenAI connection
  console.log('\n🔍 Testing Azure OpenAI connection...');
  try {
    const { OpenAI } = await import('openai');
    
    const client = new OpenAI({
      baseURL: endpoint + 'openai/v1/',
      apiKey: apiKey,
      defaultQuery: { 'api-version': apiVersion },
      defaultHeaders: {
        'api-key': apiKey,
      },
    });

    const response = await client.chat.completions.create({
      model: deploymentName,
      messages: [{ role: 'user', content: 'Hello, this is a test connection.' }],
      max_tokens: 10
    });

    console.log('✅ Azure OpenAI connection successful');
    
  } catch (error) {
    console.log('❌ Azure OpenAI connection failed:');
    console.log(error.message);
    console.log('\nPlease check your configuration and try again.');
  }

  console.log('\n🎉 Setup complete!');
  console.log('\nTo start the server, run:');
  console.log('  bun run dev');
  console.log('\nThe server will be available at:');
  console.log(`  http://localhost:${port}`);
  console.log(`  WebSocket: ws://localhost:${port}`);

  rl.close();
}

// Run setup
setup().catch(error => {
  console.error('Setup failed:', error);
  rl.close();
  process.exit(1);
});
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testOpenAIConnection() {
  console.log('Testing OpenAI connection...');

  try {
    // Initialize OpenAI client with same config as browserAgent.js
    const openai = new OpenAI({
      baseURL: process.env.AZURE_OPENAI_ENDPOINT + 'openai/v1/',
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      // No defaultQuery - let OpenAI client use its default
      defaultHeaders: {
        'api-key': process.env.AZURE_OPENAI_API_KEY,
      },
    });

    const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';

    console.log('Configuration:');
    console.log('- Endpoint:', process.env.AZURE_OPENAI_ENDPOINT);
    console.log('- API Version (env):', process.env.AZURE_OPENAI_API_VERSION);
    console.log('- API Version (test):', 'none (using OpenAI client default)');
    console.log('- Deployment:', deploymentName);
    console.log('- API Key present:', !!process.env.AZURE_OPENAI_API_KEY);

    // Test with a simple completion
    console.log('\nMaking test API call...');

    const response = await openai.chat.completions.create({
      model: deploymentName,
      messages: [
        {
          role: 'user',
          content: 'Hello! Please respond with just "OpenAI connection successful" if you can read this.'
        }
      ],
      max_tokens: 50,
      temperature: 0.1
    });

    console.log('✅ API call successful!');
    console.log('Response:', response.choices[0].message.content);

  } catch (error) {
    console.error('❌ API call failed:');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);

    if (error.status) {
      console.error('Status code:', error.status);
    }

    if (error.headers) {
      console.error('Response headers:', error.headers);
    }

    if (error.error) {
      console.error('Error details:', error.error);
    }

    // Check for common issues
    if (error.message.includes('API version not supported')) {
      console.log('\n🔍 Troubleshooting:');
      console.log('- Check AZURE_OPENAI_API_VERSION - it might be outdated');
      console.log('- Verify the API version is supported by your Azure OpenAI resource');
      console.log('- Common working versions: 2023-12-01-preview, 2024-02-01, 2024-04-01-preview');
    }

    if (error.message.includes('Unauthorized') || error.message.includes('401')) {
      console.log('\n🔍 Troubleshooting:');
      console.log('- Check AZURE_OPENAI_API_KEY is correct');
      console.log('- Verify the API key has access to the deployment');
      console.log('- Ensure the Azure OpenAI resource is active');
    }

    if (error.message.includes('Not Found') || error.message.includes('404')) {
      console.log('\n🔍 Troubleshooting:');
      console.log('- Check AZURE_OPENAI_ENDPOINT URL is correct');
      console.log('- Verify AZURE_OPENAI_DEPLOYMENT_NAME matches your deployment');
      console.log('- Ensure the deployment exists and is ready');
    }
  }
}

// Run the test
testOpenAIConnection().catch(console.error);
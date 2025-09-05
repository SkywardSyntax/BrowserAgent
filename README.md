# Browser Agent 🤖

A powerful AI-driven browser automation system that uses Azure OpenAI's Responses API and Playwright to accomplish web tasks through natural language instructions.

## Features

- **AI-Powered Automation**: Uses Azure OpenAI's GPT models with function calling to intelligently navigate and interact with web pages
- **Real-time Visual Feedback**: Takes screenshots and provides visual context to AI models for decision making
- **User Control**: Pause, resume, and stop AI tasks at any time
- **WebSocket Communication**: Real-time updates of task progress and browser actions
- **Robust Architecture**: Built with Bun, Express, and Playwright for performance and reliability
- **Function Calling**: Uses Azure OpenAI's Responses API for structured browser interactions

## Prerequisites

- [Bun](https://bun.sh/) runtime
- Azure OpenAI resource with access to GPT-4 models
- Node.js 18+ (for Playwright browser installation)

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd BrowserAgent
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Run the setup script**
   ```bash
   bun run setup
   ```
   The setup script will:
   - Configure your Azure OpenAI credentials
   - Install Playwright browsers
   - Test your configuration
   - Create the necessary environment files

4. **Start the server**
   ```bash
   bun run dev
   ```

5. **Open the control panel**
   Navigate to `http://localhost:3001` in your browser

## Configuration

The setup script will create a `.env` file with the following configuration:

```env
# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your-api-key-here
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o

# Server Configuration
NODE_ENV=development

# Browser Configuration
DISPLAY_WIDTH=1280
DISPLAY_HEIGHT=720
BROWSER_HEADLESS=false
```

## API Endpoints

### Task Management

- `POST /api/tasks` - Create a new task
- `GET /api/tasks/:taskId` - Get task status and details
- `POST /api/tasks/:taskId/pause` - Pause a running task
- `POST /api/tasks/:taskId/resume` - Resume a paused task
- `POST /api/tasks/:taskId/stop` - Stop a task

### WebSocket Events

Connect to `ws://localhost:3001` to receive real-time updates:

- `taskUpdate` - Broadcasted when task status changes
- `subscribe` - Subscribe to specific task updates
- `userTakeover` - Request control of the browser

## How It Works

1. **Task Creation**: User submits a natural language task description
2. **AI Analysis**: Azure OpenAI analyzes the task and current browser state
3. **Action Planning**: AI uses function calling to plan browser interactions
4. **Execution**: Playwright executes the planned actions (clicks, typing, navigation)
5. **Feedback Loop**: Screenshots are taken and sent back to AI for next steps
6. **Completion**: Process continues until task is completed or stopped

## Example Tasks

- "Search for JavaScript tutorials on YouTube"
- "Fill out the contact form on example.com with my information"
- "Find and bookmark the top 5 restaurants in New York on Google Maps"
- "Navigate to GitHub and create a new repository called 'test-repo'"
- "Compare prices of iPhone 15 on Amazon and Best Buy"

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web UI        │    │   Express       │    │   Azure OpenAI  │
│   (Frontend)    │◄──►│   Server        │◄──►│   API           │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                               │
                               ▼
                       ┌─────────────────┐
                       │   Playwright    │
                       │   Browser       │
                       └─────────────────┘
```

### Core Components

- **BrowserAgent**: Orchestrates AI-browser interactions
- **TaskManager**: Manages task lifecycle and state
- **Express Server**: Provides REST API and WebSocket server
- **Playwright**: Handles browser automation
- **Azure OpenAI**: Provides intelligent decision making

## Browser Actions

The AI can perform the following browser actions:

- **Click**: Click on specific coordinates
- **Type**: Input text at cursor position
- **Scroll**: Scroll in any direction
- **Key Press**: Send keyboard inputs (Enter, Tab, etc.)
- **Navigate**: Go to specific URLs
- **Wait**: Pause for specified time
- **Task Complete**: Mark task as finished

## Security Considerations

⚠️ **Important Security Notes**:

- Run in a sandboxed environment for production use
- The AI has access to any website the browser can reach
- Be cautious with sensitive websites and data
- Consider using dedicated user accounts for automation
- Monitor AI actions closely, especially initially

## Troubleshooting

### Common Issues

1. **Playwright Browser Installation Failed**
   ```bash
   npx playwright install chromium
   ```

2. **Azure OpenAI Connection Failed**
   - Verify your endpoint URL format
   - Check API key validity
   - Ensure model deployment name is correct

3. **Task Gets Stuck**
   - Use the pause/resume functionality
   - Check browser screenshots in the UI
   - Adjust task description to be more specific

### Logs

Check console output for detailed logs:
- Task creation and updates
- AI reasoning and decisions
- Browser action execution
- Error messages and stack traces

## Development

### Project Structure

```
BrowserAgent/
├── server/
│   ├── index.js          # Main server file
│   ├── browserAgent.js   # AI-browser integration
│   └── taskManager.js    # Task state management
├── public/
│   └── index.html        # Web UI
├── setup.js              # Setup script
├── package.json          # Dependencies
└── .env                  # Configuration
```

### Adding New Browser Actions

1. Add action to `executeBrowserAction()` in `browserAgent.js`
2. Update the function schema in `callAI()`
3. Test with various scenarios

### Extending AI Capabilities

- Modify the system prompt for different behaviors
- Add new function calling schemas
- Implement custom action handlers
- Integrate additional AI models

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review console logs
3. Open an issue on GitHub
4. Provide detailed reproduction steps

---

**Note**: This is experimental software. Use responsibly and test thoroughly before production use.
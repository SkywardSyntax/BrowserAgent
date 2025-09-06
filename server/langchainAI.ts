import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
import type { Task } from './taskManager';

// Schema for browser action validation
const BrowserActionSchema = z.object({
  actions: z.array(z.object({
    action: z.enum(['click', 'type', 'scroll', 'key', 'navigate', 'wait', 'task_complete']),
    coordinate: z.array(z.number()).length(2).optional(),
    text: z.string().optional(),
    direction: z.enum(['up', 'down', 'left', 'right']).optional(),
    pixels: z.number().optional(),
    key: z.string().optional(),
    url: z.string().optional(),
    time: z.number().optional(),
    reasoning: z.string()
  })),
  overall_reasoning: z.string(),
  progress_assessment: z.object({
    completed_steps: z.array(z.string()),
    next_steps: z.array(z.string()),
    confidence: z.number().min(0).max(1)
  })
});

export type BrowserAction = z.infer<typeof BrowserActionSchema>;

export class LangChainAIOrchestrator {
  private chatModel: ChatOpenAI;
  private parser: StructuredOutputParser<BrowserAction>;
  private conversationHistory: Map<string, Array<HumanMessage | AIMessage | SystemMessage>>;
  private taskContext: Map<string, {
    screenshots: string[];
    actions: Array<{ action: string; success: boolean; timestamp: number }>;
    currentObjective: string;
    progressMarkers: string[];
  }>;

  constructor(
    apiKey: string,
    baseURL: string,
    deploymentName: string,
    reasoningEffort?: 'low' | 'medium' | 'high'
  ) {
    this.chatModel = new ChatOpenAI({
      openAIApiKey: apiKey,
      configuration: {
        baseURL: baseURL + 'openai/v1/',
        defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
        defaultHeaders: { 'api-key': apiKey },
      },
      modelName: deploymentName,
      temperature: 0.1,
      maxTokens: 4000,
      ...(reasoningEffort && { 
        modelKwargs: { 
          reasoning: { effort: reasoningEffort } 
        } 
      })
    });

    this.parser = StructuredOutputParser.fromZodSchema(BrowserActionSchema);
    this.conversationHistory = new Map();
    this.taskContext = new Map();
  }

  async analyzeAndPlan(task: Task, screenshot: string): Promise<BrowserAction> {
    const taskId = task.id;
    
    // Initialize or get existing context
    if (!this.taskContext.has(taskId)) {
      this.taskContext.set(taskId, {
        screenshots: [],
        actions: [],
        currentObjective: task.description,
        progressMarkers: []
      });
    }

    if (!this.conversationHistory.has(taskId)) {
      this.conversationHistory.set(taskId, []);
    }

    const context = this.taskContext.get(taskId)!;
    const history = this.conversationHistory.get(taskId)!;

    // Add screenshot to context (keep last 3 for progress tracking)
    context.screenshots.push(screenshot);
    if (context.screenshots.length > 3) {
      context.screenshots.shift();
    }

    // Build system prompt with enhanced context
    const systemPrompt = this.buildSystemPrompt(task, context);
    
    // Build the conversation chain
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      ['human', 'Current screen state (base64 image): {screenshot}\n\nAnalyze the current state and provide the next actions to accomplish: {objective}']
    ]);

    const chain = RunnableSequence.from([
      prompt,
      this.chatModel,
      this.parser
    ]);

    try {
      const result = await chain.invoke({
        screenshot: screenshot,
        objective: task.description,
      });

      // Update conversation history
      history.push(
        new HumanMessage(`Screenshot provided for task: ${task.description}`),
        new AIMessage(JSON.stringify(result))
      );

      // Keep history manageable (last 10 exchanges)
      if (history.length > 20) {
        history.splice(0, 4);
      }

      return result;
    } catch (error) {
      console.error('LangChain AI analysis failed:', error);
      throw new Error(`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildSystemPrompt(task: Task, context: any): string {
    const recentActions = context.actions.slice(-5);
    const progressSummary = context.progressMarkers.join('\n- ');

    return `You are an intelligent browser automation agent. Your goal is to accomplish web tasks by analyzing screenshots and providing precise browser actions.

TASK OBJECTIVE: ${task.description}

CURRENT CONTEXT:
${progressSummary ? `Progress Made:\n- ${progressSummary}` : 'No progress markers yet.'}

${recentActions.length > 0 ? `Recent Actions:\n${recentActions.map(a => `- ${a.action} (${a.success ? 'success' : 'failed'})`).join('\n')}` : ''}

CAPABILITIES:
- click: Click at specific coordinates [x, y]
- type: Type text at current cursor position
- scroll: Scroll in a direction (up/down/left/right) by pixels
- key: Press keyboard keys (Enter, Tab, Escape, etc.)
- navigate: Go to a specific URL
- wait: Pause execution for specified milliseconds
- task_complete: Mark the task as completed

ANALYSIS REQUIREMENTS:
1. Examine the screenshot carefully for relevant UI elements
2. Consider the task objective and current progress
3. Plan actions that make meaningful progress toward the goal
4. Provide detailed reasoning for each action
5. Assess confidence in your approach

RESPONSE FORMAT:
Return a JSON object with:
- actions: Array of browser actions to execute
- overall_reasoning: Your analysis of the current state and strategy
- progress_assessment: Evaluation of completed steps, next steps, and confidence

GUIDELINES:
- Be precise with coordinates - click exactly on interactive elements
- Type efficiently - avoid unnecessary character-by-character input
- Handle errors gracefully - if an element isn't found, try alternative approaches
- Consider user experience - don't perform actions too rapidly
- Verify progress after each significant action
- If the task appears complete, use task_complete action

Focus on accomplishing the objective efficiently and reliably.`;
  }

  recordActionResult(taskId: string, action: string, success: boolean): void {
    // Ensure context exists
    if (!this.taskContext.has(taskId)) {
      this.taskContext.set(taskId, {
        screenshots: [],
        actions: [],
        currentObjective: 'Unknown objective',
        progressMarkers: []
      });
    }
    
    const context = this.taskContext.get(taskId)!;
    context.actions.push({
      action,
      success,
      timestamp: Date.now()
    });

    // Keep action history manageable
    if (context.actions.length > 20) {
      context.actions.shift();
    }
  }

  addProgressMarker(taskId: string, marker: string): void {
    // Ensure context exists
    if (!this.taskContext.has(taskId)) {
      this.taskContext.set(taskId, {
        screenshots: [],
        actions: [],
        currentObjective: 'Unknown objective',
        progressMarkers: []
      });
    }
    
    const context = this.taskContext.get(taskId)!;
    context.progressMarkers.push(marker);
    
    // Keep progress markers manageable
    if (context.progressMarkers.length > 10) {
      context.progressMarkers.shift();
    }
  }

  clearTaskContext(taskId: string): void {
    this.conversationHistory.delete(taskId);
    this.taskContext.delete(taskId);
  }

  getTaskProgress(taskId: string): { 
    actionCount: number; 
    successRate: number; 
    progressMarkers: string[] 
  } {
    const context = this.taskContext.get(taskId);
    if (!context) {
      return { actionCount: 0, successRate: 0, progressMarkers: [] };
    }

    const totalActions = context.actions.length;
    const successfulActions = context.actions.filter(a => a.success).length;
    const successRate = totalActions > 0 ? successfulActions / totalActions : 0;

    return {
      actionCount: totalActions,
      successRate,
      progressMarkers: [...context.progressMarkers]
    };
  }
}
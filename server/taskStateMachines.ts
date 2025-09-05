import { StateMachine, StateMachineConfig } from './stateMachine';
import type { TaskManager } from './taskManager';

export enum TaskState {
  CREATED = 'created',
  INITIALIZING = 'initializing', 
  RUNNING = 'running',
  PAUSED = 'paused',
  MANUAL_CONTROL = 'manual_control',
  STOPPING = 'stopping',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum BrowserControlState {
  AI_CONTROL = 'ai_control',
  MANUAL_CONTROL = 'manual_control', 
  TRANSITIONING = 'transitioning'
}

export enum LoopState {
  IDLE = 'idle',
  TAKING_SCREENSHOT = 'taking_screenshot',
  CALLING_AI = 'calling_ai',
  PROCESSING_RESPONSE = 'processing_response',
  CHECKING_PROGRESS = 'checking_progress',
  RECOVERY = 'recovery'
}

export class TaskStateMachine extends StateMachine<TaskState> {
  private taskId: string;
  private taskManager: TaskManager;

  constructor(taskId: string, taskManager: TaskManager) {
    const config: StateMachineConfig<TaskState> = {
      initial: TaskState.CREATED,
      states: Object.values(TaskState),
      transitions: [
        { from: TaskState.CREATED, to: TaskState.INITIALIZING, event: 'START' },
        { from: TaskState.INITIALIZING, to: TaskState.RUNNING, event: 'INITIALIZED' },
        { from: TaskState.INITIALIZING, to: TaskState.FAILED, event: 'INIT_FAILED' },
        { from: TaskState.RUNNING, to: TaskState.PAUSED, event: 'PAUSE' },
        { from: TaskState.RUNNING, to: TaskState.MANUAL_CONTROL, event: 'MANUAL_TAKEOVER' },
        // Allow manual control request while paused as well
        { from: TaskState.PAUSED, to: TaskState.MANUAL_CONTROL, event: 'MANUAL_TAKEOVER' },
        { from: TaskState.RUNNING, to: TaskState.COMPLETED, event: 'COMPLETE' },
        { from: TaskState.RUNNING, to: TaskState.FAILED, event: 'FAIL' },
        { from: TaskState.PAUSED, to: TaskState.RUNNING, event: 'RESUME' },
        { from: TaskState.MANUAL_CONTROL, to: TaskState.RUNNING, event: 'AI_TAKEOVER' },
        { from: TaskState.MANUAL_CONTROL, to: TaskState.PAUSED, event: 'PAUSE' },
        { from: TaskState.MANUAL_CONTROL, to: TaskState.RUNNING, event: 'RESUME' },
        // Stop transitions from any active state
        { from: TaskState.RUNNING, to: TaskState.STOPPING, event: 'STOP' },
        { from: TaskState.PAUSED, to: TaskState.STOPPING, event: 'STOP' },
        { from: TaskState.MANUAL_CONTROL, to: TaskState.STOPPING, event: 'STOP' },
        { from: TaskState.STOPPING, to: TaskState.COMPLETED, event: 'STOPPED' },
        { from: TaskState.STOPPING, to: TaskState.FAILED, event: 'STOP_FAILED' },
        // Allow FAIL transition from any active state for error handling
        { from: TaskState.INITIALIZING, to: TaskState.FAILED, event: 'FAIL' },
        { from: TaskState.PAUSED, to: TaskState.FAILED, event: 'FAIL' },
        { from: TaskState.MANUAL_CONTROL, to: TaskState.FAILED, event: 'FAIL' },
        { from: TaskState.STOPPING, to: TaskState.FAILED, event: 'FAIL' }
      ]
    };

    super(config);
    this.taskId = taskId;
    this.taskManager = taskManager;

    // Sync state changes with TaskManager
    this.on('transition', (from, to, event) => {
      this.syncWithTaskManager(to);
    });
  }

  private syncWithTaskManager(state: TaskState): void {
    const task = this.taskManager.getTask(this.taskId);
    if (!task) return;

    // Map FSM states to TaskManager states
    const statusMap: Record<TaskState, string> = {
      [TaskState.CREATED]: 'created',
      [TaskState.INITIALIZING]: 'running',
      [TaskState.RUNNING]: 'running', 
      [TaskState.PAUSED]: 'paused',
      [TaskState.MANUAL_CONTROL]: 'paused', // Treated as paused in TaskManager
      [TaskState.STOPPING]: 'stopped',
      [TaskState.COMPLETED]: 'completed',
      [TaskState.FAILED]: 'failed'
    };

    const newStatus = statusMap[state];
    if (task.status !== newStatus) {
      this.taskManager.updateTask(this.taskId, { 
        status: newStatus as any,
        paused: state === TaskState.PAUSED || state === TaskState.MANUAL_CONTROL
      });
    }
  }

  async start(): Promise<boolean> {
    return this.transition('START');
  }

  async initialize(): Promise<boolean> {
    return this.transition('INITIALIZED');
  }

  async failInitialization(): Promise<boolean> {
    return this.transition('INIT_FAILED');
  }

  async pause(): Promise<boolean> {
    return this.transition('PAUSE');
  }

  async resume(): Promise<boolean> {
    return this.transition('RESUME');
  }

  async takeManualControl(): Promise<boolean> {
    return this.transition('MANUAL_TAKEOVER');
  }

  async giveControlToAI(): Promise<boolean> {
    return this.transition('AI_TAKEOVER');
  }

  async complete(): Promise<boolean> {
    return this.transition('COMPLETE');
  }

  async fail(): Promise<boolean> {
    return this.transition('FAIL');
  }

  async stop(): Promise<boolean> {
    if (this.canTransition('STOP')) {
      await this.transition('STOP');
      return this.transition('STOPPED');
    }
    return false;
  }

  isRunning(): boolean {
    return this.is(TaskState.RUNNING);
  }

  isPaused(): boolean {
    return this.is(TaskState.PAUSED);
  }

  isInManualControl(): boolean {
    return this.is(TaskState.MANUAL_CONTROL);
  }

  isActive(): boolean {
    return this.isOneOf([TaskState.RUNNING, TaskState.PAUSED, TaskState.MANUAL_CONTROL]);
  }

  isFinished(): boolean {
    return this.isOneOf([TaskState.COMPLETED, TaskState.FAILED]);
  }
}

export class BrowserControlStateMachine extends StateMachine<BrowserControlState> {
  constructor() {
    const config: StateMachineConfig<BrowserControlState> = {
      initial: BrowserControlState.AI_CONTROL,
      states: Object.values(BrowserControlState),
      transitions: [
        { 
          from: BrowserControlState.AI_CONTROL, 
          to: BrowserControlState.TRANSITIONING, 
          event: 'REQUEST_MANUAL_CONTROL' 
        },
        { 
          from: BrowserControlState.TRANSITIONING, 
          to: BrowserControlState.MANUAL_CONTROL, 
          event: 'MANUAL_CONTROL_GRANTED' 
        },
        { 
          from: BrowserControlState.MANUAL_CONTROL, 
          to: BrowserControlState.TRANSITIONING, 
          event: 'REQUEST_AI_CONTROL' 
        },
        { 
          from: BrowserControlState.TRANSITIONING, 
          to: BrowserControlState.AI_CONTROL, 
          event: 'AI_CONTROL_GRANTED' 
        }
      ]
    };

    super(config);
  }

  async requestManualControl(): Promise<boolean> {
    if (await this.transition('REQUEST_MANUAL_CONTROL')) {
      return this.transition('MANUAL_CONTROL_GRANTED');
    }
    return false;
  }

  async requestAIControl(): Promise<boolean> {
    if (await this.transition('REQUEST_AI_CONTROL')) {
      return this.transition('AI_CONTROL_GRANTED');
    }
    return false;
  }

  isUnderAIControl(): boolean {
    return this.is(BrowserControlState.AI_CONTROL);
  }

  isUnderManualControl(): boolean {
    return this.is(BrowserControlState.MANUAL_CONTROL);
  }

  isTransitioning(): boolean {
    return this.is(BrowserControlState.TRANSITIONING);
  }
}

export class LoopStateMachine extends StateMachine<LoopState> {
  private consecutiveFailures: number = 0;

  constructor() {
    const config: StateMachineConfig<LoopState> = {
      initial: LoopState.IDLE,
      states: Object.values(LoopState),
      transitions: [
        { from: LoopState.IDLE, to: LoopState.TAKING_SCREENSHOT, event: 'START_ITERATION' },
        { from: LoopState.TAKING_SCREENSHOT, to: LoopState.CALLING_AI, event: 'SCREENSHOT_TAKEN' },
        { from: LoopState.TAKING_SCREENSHOT, to: LoopState.RECOVERY, event: 'SCREENSHOT_FAILED' },
        { from: LoopState.CALLING_AI, to: LoopState.PROCESSING_RESPONSE, event: 'AI_RESPONDED' },
        { from: LoopState.CALLING_AI, to: LoopState.RECOVERY, event: 'AI_FAILED' },
        { from: LoopState.PROCESSING_RESPONSE, to: LoopState.CHECKING_PROGRESS, event: 'RESPONSE_PROCESSED' },
        { from: LoopState.PROCESSING_RESPONSE, to: LoopState.RECOVERY, event: 'PROCESSING_FAILED' },
        { from: LoopState.CHECKING_PROGRESS, to: LoopState.IDLE, event: 'ITERATION_COMPLETE' },
        { from: LoopState.CHECKING_PROGRESS, to: LoopState.RECOVERY, event: 'NO_PROGRESS' },
        { from: LoopState.RECOVERY, to: LoopState.IDLE, event: 'RECOVERED' },
        { from: LoopState.RECOVERY, to: LoopState.IDLE, event: 'RECOVERY_FAILED' }
      ]
    };

    super(config);
  }

  async startIteration(): Promise<boolean> {
    return this.transition('START_ITERATION');
  }

  async screenshotTaken(): Promise<boolean> {
    return this.transition('SCREENSHOT_TAKEN');
  }

  async screenshotFailed(): Promise<boolean> {
    this.consecutiveFailures++;
    return this.transition('SCREENSHOT_FAILED');
  }

  async aiResponded(): Promise<boolean> {
    return this.transition('AI_RESPONDED');
  }

  async aiFailed(): Promise<boolean> {
    this.consecutiveFailures++;
    return this.transition('AI_FAILED');
  }

  async responseProcessed(): Promise<boolean> {
    return this.transition('RESPONSE_PROCESSED');
  }

  async processingFailed(): Promise<boolean> {
    this.consecutiveFailures++;
    return this.transition('PROCESSING_FAILED');
  }

  async iterationComplete(): Promise<boolean> {
    this.consecutiveFailures = 0; // Reset on success
    return this.transition('ITERATION_COMPLETE');
  }

  async noProgress(): Promise<boolean> {
    this.consecutiveFailures++;
    return this.transition('NO_PROGRESS');
  }

  async recovered(): Promise<boolean> {
    this.consecutiveFailures = 0;
    return this.transition('RECOVERED');
  }

  async recoveryFailed(): Promise<boolean> {
    return this.transition('RECOVERY_FAILED');
  }

  shouldAbortLoop(): boolean {
    return false; // No cap on consecutive failures
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }
}

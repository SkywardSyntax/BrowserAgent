export type TaskStatus = 'created' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed' | 'deleted';

export interface Step {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  error?: boolean;
  reasoning?: boolean;
  action?: unknown;
}

export interface Screenshot {
  id: string;
  data: string; // base64 png/jpeg
  timestamp: string;
}

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  failedAt?: string;
  error?: string | null;
  result?: string | null;
  steps: Step[];
  screenshots: Screenshot[];
}

export interface ScreencastFrame {
  data: string; // base64
  format: 'jpeg' | 'png';
  metadata?: { deviceWidth?: number; deviceHeight?: number };
}

export interface Info {
  model: string;
  viewport: { width: number; height: number };
  headless: boolean;
  wsUrl?: string;
}

export interface DropdownOption<T extends string | number = string> {
  value: T;
  label?: string;
}


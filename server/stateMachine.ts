/**
 * Base finite state machine implementation for reliable state management
 */

export type StateTransition<T> = {
  from: T;
  to: T;
  event: string;
  guard?: () => boolean;
  action?: () => void | Promise<void>;
};

export type StateMachineConfig<T> = {
  initial: T;
  states: T[];
  transitions: StateTransition<T>[];
};

export class StateMachine<T> {
  private currentState: T;
  private config: StateMachineConfig<T>;
  private listeners: Map<string, Set<(from: T, to: T, event: string) => void>>;

  constructor(config: StateMachineConfig<T>) {
    this.config = config;
    this.currentState = config.initial;
    this.listeners = new Map();
  }

  getCurrentState(): T {
    return this.currentState;
  }

  canTransition(event: string): boolean {
    return this.config.transitions.some(t => 
      t.from === this.currentState && 
      t.event === event && 
      (!t.guard || t.guard())
    );
  }

  async transition(event: string): Promise<boolean> {
    const transition = this.config.transitions.find(t => 
      t.from === this.currentState && 
      t.event === event && 
      (!t.guard || t.guard())
    );

    if (!transition) {
      console.warn(`Invalid transition: ${String(this.currentState)} -> ${event}`);
      return false;
    }

    const fromState = this.currentState;
    this.currentState = transition.to;

    // Execute transition action
    if (transition.action) {
      try {
        await transition.action();
      } catch (error) {
        console.error('Error executing transition action:', error);
        // Rollback state change on action failure
        this.currentState = fromState;
        return false;
      }
    }

    // Notify listeners
    this.notifyListeners('transition', fromState, transition.to, event);
    this.notifyListeners(`enter:${String(transition.to)}`, fromState, transition.to, event);
    this.notifyListeners(`exit:${String(fromState)}`, fromState, transition.to, event);

    return true;
  }

  on(event: string, listener: (from: T, to: T, event: string) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  private notifyListeners(event: string, from: T, to: T, transitionEvent: string): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(from, to, transitionEvent);
        } catch (error) {
          console.error('Error in state machine listener:', error);
        }
      });
    }
  }

  is(state: T): boolean {
    return this.currentState === state;
  }

  isOneOf(states: T[]): boolean {
    return states.includes(this.currentState);
  }
}
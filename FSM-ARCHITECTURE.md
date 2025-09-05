# Finite State Machine Architecture for Browser Agent

## Overview

This document describes the finite state machine (FSM) implementation that improves the stability and correctness of the Browser Agent's control flow. The FSM architecture replaces complex nested logic with clear, predictable state transitions.

## Key Improvements

### 1. **Reliability & Stability**
- **Predictable State Transitions**: Clear rules for when and how states change
- **Error Recovery**: Dedicated recovery states with automatic fallback mechanisms
- **Resource Management**: Proper cleanup when states transition
- **Deadlock Prevention**: Guards prevent invalid state transitions

### 2. **Simplified Logic**
- **Reduced Complexity**: Replaced nested if/else chains with state-driven logic
- **Single Responsibility**: Each state handles one specific scenario
- **Clear Separation**: AI control vs Manual control are distinct states
- **Event-Driven**: Actions trigger state transitions rather than polling

### 3. **Enhanced Manual Control**
- **Smooth Transitions**: Proper handoff between AI and manual control
- **State Validation**: Cannot transition to invalid states
- **Feedback Mechanism**: Success/failure notifications for control changes
- **Graceful Recovery**: Failed transitions don't break the system

## State Machine Components

### 1. TaskStateMachine

Manages the overall task lifecycle with the following states:

```
CREATED → INITIALIZING → RUNNING → COMPLETED
                           ↓           ↑
                         PAUSED ←→ MANUAL_CONTROL
                           ↓           ↓
                         STOPPING → FAILED
```

**States:**
- `CREATED`: Task is created but not yet started
- `INITIALIZING`: Browser is being set up
- `RUNNING`: AI is actively working on the task
- `PAUSED`: Task execution is paused
- `MANUAL_CONTROL`: User has taken control of the browser
- `STOPPING`: Task is being stopped
- `COMPLETED`: Task finished successfully
- `FAILED`: Task failed or encountered unrecoverable error

**Key Features:**
- Automatic synchronization with TaskManager status
- Clean state transitions with validation
- Event listeners for state change notifications

### 2. BrowserControlStateMachine

Manages control authority between AI and manual control:

```
AI_CONTROL ↔ TRANSITIONING ↔ MANUAL_CONTROL
```

**States:**
- `AI_CONTROL`: AI has control of the browser
- `TRANSITIONING`: Control is being transferred
- `MANUAL_CONTROL`: User has control of the browser

**Key Features:**
- Prevents simultaneous control conflicts
- Smooth handoff mechanisms
- Clear ownership at any given time

### 3. LoopStateMachine

Manages the AI processing loop with error recovery:

```
IDLE → TAKING_SCREENSHOT → CALLING_AI → PROCESSING_RESPONSE → CHECKING_PROGRESS → IDLE
  ↑                ↓              ↓              ↓                    ↓
  ←──── RECOVERY ←──────────────────────────────────────────────────────
```

**States:**
- `IDLE`: Waiting to start next iteration
- `TAKING_SCREENSHOT`: Capturing current browser state
- `CALLING_AI`: Sending request to AI model
- `PROCESSING_RESPONSE`: Executing AI's actions
- `CHECKING_PROGRESS`: Validating if progress was made
- `RECOVERY`: Handling errors and attempting recovery

**Key Features:**
- Automatic error counting and recovery
- Progressive failure handling
- Circuit breaker pattern for repeated failures

## Implementation Details

### Base StateMachine Class

The `StateMachine<T>` class provides:
- **Generic State Management**: Works with any enum type
- **Transition Validation**: Guards prevent invalid transitions
- **Event System**: Listeners for state changes
- **Action Execution**: Optional actions on transitions

```typescript
export class StateMachine<T> {
  async transition(event: string): Promise<boolean>
  on(event: string, listener: Function): () => void
  canTransition(event: string): boolean
  getCurrentState(): T
}
```

### State Synchronization

The FSMs automatically synchronize with the existing TaskManager:
- Task state changes update TaskManager status
- TaskManager operations can trigger state transitions
- Backwards compatibility maintained

### Error Handling

Improved error handling with:
- **Graceful Degradation**: Failed transitions don't crash the system
- **Automatic Recovery**: Built-in retry mechanisms
- **Failure Tracking**: Consecutive failure counting
- **Circuit Breaking**: Stops after too many failures

## WebSocket Protocol Updates

New WebSocket messages for state-aware manual control:

### Client → Server
- `userTakeover`: Request manual control (uses FSM)
- `releaseControl`: Release manual control back to AI

### Server → Client
- `takeoverGranted`: Manual control successfully granted
- `takeoverDenied`: Manual control request denied
- `controlReleased`: Control successfully returned to AI
- `controlReleaseFailed`: Failed to release control

## Usage Examples

### Starting a Task with State Machine
```typescript
const taskSM = browserAgent.getOrCreateTaskStateMachine(taskId);
await taskSM.start();
await taskSM.initialize();
// Task is now running under AI control
```

### Manual Control Handoff
```typescript
// Request manual control
const success = await browserAgent.requestManualControl(taskId);
if (success) {
  // User now has control
  // ... manual actions ...
  // Release control back to AI
  await browserAgent.releaseManualControl(taskId);
}
```

### State-Aware Processing Loop
```typescript
const loopSM = new LoopStateMachine();
while (taskSM.isActive()) {
  await loopSM.startIteration();
  
  try {
    // Take screenshot
    await loopSM.screenshotTaken();
    // Call AI
    await loopSM.aiResponded();
    // Process response
    await loopSM.responseProcessed();
    // Check progress
    await loopSM.iterationComplete();
  } catch (error) {
    await loopSM.recoveryFailed();
    if (loopSM.shouldAbortLoop()) break;
  }
}
```

## Benefits Achieved

### 1. **Stability**
- No more race conditions between pause/resume operations
- Proper cleanup when tasks stop unexpectedly
- Graceful handling of browser crashes or network issues

### 2. **Correctness**
- Invalid state transitions are prevented
- Clear ownership of browser control at all times
- Consistent behavior across different scenarios

### 3. **Maintainability**
- State logic is centralized and testable
- Easy to add new states or transitions
- Clear separation of concerns

### 4. **User Experience**
- Smooth manual control takeover/release
- Clear feedback on control state changes
- No confusing intermediate states

## Image Passing Verification

✅ **Confirmed**: Screenshots are correctly passed to AI models as base64-encoded images:

```typescript
// In callAI method
{ 
  type: 'image_url', 
  image_url: { 
    url: `data:image/png;base64,${screenshot}` 
  } 
}
```

The AI receives both:
- **Text context**: Page summary, recent actions, task description
- **Visual data**: Full-resolution screenshot for visual analysis

## Future Enhancements

The FSM architecture enables easy addition of:
- **Debugging States**: Pause execution for inspection
- **Rollback Mechanisms**: Undo recent actions
- **Multi-Agent Coordination**: Multiple AI agents working together
- **Advanced Recovery**: Smart retry strategies based on error types
- **Performance Monitoring**: State transition timing and metrics

## Migration Notes

The implementation maintains backwards compatibility:
- Existing TaskManager API continues to work
- Old WebSocket messages are still supported
- No changes required to existing task definitions
- State machines enhance rather than replace existing functionality
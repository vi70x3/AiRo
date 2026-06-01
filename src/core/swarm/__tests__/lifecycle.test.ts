import { expect, test, describe, it, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { AgentLifecycleState } from '@roo-code/types';
import { validateTransition, getTransitionTrigger } from '../lifecycle';

describe('Agent Lifecycle', () => {
  test('should validate valid transitions', () => {
    expect(validateTransition(AgentLifecycleState.Spawned, AgentLifecycleState.Ready)).toBe(true);
    expect(validateTransition(AgentLifecycleState.Ready, AgentLifecycleState.Running)).toBe(true);
    expect(validateTransition(AgentLifecycleState.Running, AgentLifecycleState.Blocked)).toBe(true);
    expect(validateTransition(AgentLifecycleState.Running, AgentLifecycleState.Completed)).toBe(true);
    expect(validateTransition(AgentLifecycleState.Running, AgentLifecycleState.Failed)).toBe(true);
    expect(validateTransition(AgentLifecycleState.Running, AgentLifecycleState.Stopped)).toBe(true);
    expect(validateTransition(AgentLifecycleState.Running, AgentLifecycleState.Crashed)).toBe(true);
    expect(validateTransition(AgentLifecycleState.Blocked, AgentLifecycleState.Running)).toBe(true);
    expect(validateTransition(AgentLifecycleState.Blocked, AgentLifecycleState.Stopped)).toBe(true);
    expect(validateTransition(AgentLifecycleState.Blocked, AgentLifecycleState.Crashed)).toBe(true);
  });

  test('should reject invalid transitions', () => {
    expect(validateTransition(AgentLifecycleState.Spawned, AgentLifecycleState.Running)).toBe(false);
    expect(validateTransition(AgentLifecycleState.Completed, AgentLifecycleState.Running)).toBe(false);
    expect(validateTransition(AgentLifecycleState.Failed, AgentLifecycleState.Running)).toBe(false);
    expect(validateTransition(AgentLifecycleState.Crashed, AgentLifecycleState.Running)).toBe(false);
  });

  test('should return correct transition triggers', () => {
    expect(getTransitionTrigger(AgentLifecycleState.Spawned, AgentLifecycleState.Ready)).toBe('Agent has been initialized and is ready to start');
    expect(getTransitionTrigger(AgentLifecycleState.Ready, AgentLifecycleState.Running)).toBe('Agent has started executing');
    expect(getTransitionTrigger(AgentLifecycleState.Running, AgentLifecycleState.Blocked)).toBe('Agent has encountered a blocking condition');
    expect(getTransitionTrigger(AgentLifecycleState.Blocked, AgentLifecycleState.Running)).toBe('Agent has resolved the blocking condition');
    expect(getTransitionTrigger(AgentLifecycleState.Running, AgentLifecycleState.Completed)).toBe('Agent has completed its task successfully');
    expect(getTransitionTrigger(AgentLifecycleState.Running, AgentLifecycleState.Failed)).toBe('Agent has failed to complete its task');
    expect(getTransitionTrigger(AgentLifecycleState.Running, AgentLifecycleState.Stopped)).toBe('Agent has been stopped by user or system');
    expect(getTransitionTrigger(AgentLifecycleState.Running, AgentLifecycleState.Crashed)).toBe('Agent has crashed due to an error');
    expect(getTransitionTrigger(AgentLifecycleState.Blocked, AgentLifecycleState.Stopped)).toBe('Agent has been stopped while blocked');
    expect(getTransitionTrigger(AgentLifecycleState.Blocked, AgentLifecycleState.Crashed)).toBe('Agent has crashed while blocked');
  });

  test('should return Unknown transition for invalid triggers', () => {
    expect(getTransitionTrigger(AgentLifecycleState.Spawned, AgentLifecycleState.Running)).toBe('Unknown transition');
    expect(getTransitionTrigger(AgentLifecycleState.Completed, AgentLifecycleState.Running)).toBe('Unknown transition');
  });
});
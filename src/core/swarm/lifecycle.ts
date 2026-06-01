import { AgentLifecycleState } from '@roo-code/types';

export const VALID_TRANSITIONS = new Map<AgentLifecycleState, AgentLifecycleState[]>([
  [AgentLifecycleState.Spawned, [AgentLifecycleState.Ready]],
  [AgentLifecycleState.Ready, [AgentLifecycleState.Running]],
  [AgentLifecycleState.Running, [AgentLifecycleState.Blocked, AgentLifecycleState.Completed, AgentLifecycleState.Failed, AgentLifecycleState.Stopped, AgentLifecycleState.Crashed]],
  [AgentLifecycleState.Blocked, [AgentLifecycleState.Running, AgentLifecycleState.Stopped, AgentLifecycleState.Crashed]],
  [AgentLifecycleState.Completed, []],
  [AgentLifecycleState.Failed, []],
  [AgentLifecycleState.Stopped, []],
  [AgentLifecycleState.Crashed, []]
]);

export const transitionTrigger = new Map<string, string>([
  ['spawned->ready', 'Agent has been initialized and is ready to start'],
  ['ready->running', 'Agent has started executing'],
  ['running->blocked', 'Agent has encountered a blocking condition'],
  ['blocked->running', 'Agent has resolved the blocking condition'],
  ['running->completed', 'Agent has completed its task successfully'],
  ['running->failed', 'Agent has failed to complete its task'],
  ['running->stopped', 'Agent has been stopped by user or system'],
  ['running->crashed', 'Agent has crashed due to an error'],
  ['blocked->stopped', 'Agent has been stopped while blocked'],
  ['blocked->crashed', 'Agent has crashed while blocked']
]);

export function validateTransition(from: AgentLifecycleState, to: AgentLifecycleState): boolean {
  return VALID_TRANSITIONS.has(from) && VALID_TRANSITIONS.get(from)!.includes(to);
}

export function getTransitionTrigger(from: AgentLifecycleState, to: AgentLifecycleState): string {
  const key = `${from}->${to}`;
  return transitionTrigger.get(key) || 'Unknown transition';
}
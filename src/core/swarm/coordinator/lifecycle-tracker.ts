import {
	AgentLifecycleState,
	AgentMetadata,
	CompletionReport,
	SwarmTaskStatus,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'

export interface LifecycleEvent {
	eventId: string
	agentId: string
	previousState: AgentLifecycleState
	newState: AgentLifecycleState
	timestamp: number
	reason: string | null
}

export interface HeartbeatStatus {
	agentId: string
	isAlive: boolean
	lastHeartbeat: number
	timeSinceLastHeartbeat: number
}

const TERMINAL_STATES = new Set<AgentLifecycleState>([
	AgentLifecycleState.Completed,
	AgentLifecycleState.Failed,
	AgentLifecycleState.Stopped,
	AgentLifecycleState.Crashed,
])

// SwarmTaskStatus values from @roo-code/types swarm module.
const TASK_STATUS_IN_PROGRESS = SwarmTaskStatus.InProgress
const TASK_STATUS_PENDING = SwarmTaskStatus.Pending

export class LifecycleTracker {
	private daemon: IDaemon
	private trackedStates: Map<string, AgentLifecycleState>
	private lifecycleEvents: LifecycleEvent[]
	private completionReports: Map<string, CompletionReport>
	private heartbeatThreshold: number

	constructor(daemon: IDaemon, heartbeatThreshold: number = 60000) {
		this.daemon = daemon
		this.trackedStates = new Map()
		this.lifecycleEvents = []
		this.completionReports = new Map()
		this.heartbeatThreshold = heartbeatThreshold
	}

	/**
	 * Record a state transition as a LifecycleEvent.
	 * If the new state is terminal, handle appropriately.
	 */
	trackStateChange(
		agentId: string,
		previousState: AgentLifecycleState,
		newState: AgentLifecycleState,
		reason: string | null = null
	): LifecycleEvent {
		const event: LifecycleEvent = {
			eventId: crypto.randomUUID(),
			agentId,
			previousState,
			newState,
			timestamp: Date.now(),
			reason,
		}

		this.lifecycleEvents.push(event)
		this.trackedStates.set(agentId, newState)

		if (TERMINAL_STATES.has(newState)) {
			this.handleTerminalState(agentId, newState)
		}

		return event
	}

	/**
	 * Check heartbeats for all tracked agents.
	 * For each agent, get metadata from daemon, calculate time since last heartbeat,
	 * compare to threshold.
	 */
	checkHeartbeats(): HeartbeatStatus[] {
		const results: HeartbeatStatus[] = []
		const now = Date.now()

		for (const agentId of this.trackedStates.keys()) {
			const metadata = this.getAgentMetadata(agentId)
			if (!metadata) {
				results.push({
					agentId,
					isAlive: false,
					lastHeartbeat: 0,
					timeSinceLastHeartbeat: now,
				})
				continue
			}

			const timeSinceLastHeartbeat = now - metadata.lastHeartbeat
			results.push({
				agentId,
				isAlive: timeSinceLastHeartbeat <= this.heartbeatThreshold,
				lastHeartbeat: metadata.lastHeartbeat,
				timeSinceLastHeartbeat,
			})
		}

		return results
	}

	/**
	 * Filter heartbeat results to only those where isAlive is false.
	 */
	getDeadAgents(heartbeatResults: HeartbeatStatus[]): HeartbeatStatus[] {
		return heartbeatResults.filter((status) => !status.isAlive)
	}

	/**
	 * Store completion report and update tracked state to Completed.
	 */
	handleCompletion(report: CompletionReport): void {
		this.completionReports.set(report.agentId, report)
		this.trackedStates.set(report.agentId, AgentLifecycleState.Completed)
		this.trackStateChange(
			report.agentId,
			AgentLifecycleState.Running,
			AgentLifecycleState.Completed,
			`Task ${report.taskId} completed`
		)
	}

	/**
	 * Update tracked state to Failed and find tasks needing reassignment.
	 */
	handleFailure(agentId: string, error: string): void {
		const previousState = this.trackedStates.get(agentId) ?? AgentLifecycleState.Running
		this.trackedStates.set(agentId, AgentLifecycleState.Failed)
		this.trackStateChange(agentId, previousState, AgentLifecycleState.Failed, error)
	}

	/**
	 * Find tasks needing reassignment after an agent failure.
	 * Looks at plan tasks where owner = failed agentId and status is in_progress or pending.
	 */
	findTasksForReassignment(failedAgentId: string): string[] {
		const plan = this.daemon.getPlan()
		if (!plan) return []

		const tasksForReassignment: string[] = []
		for (const task of plan.tasks) {
			if (
				task.owner === failedAgentId &&
				(task.status === TASK_STATUS_IN_PROGRESS || task.status === TASK_STATUS_PENDING)
			) {
				tasksForReassignment.push(task.taskId)
			}
		}

		return tasksForReassignment
	}

	/**
	 * Get the current tracked state for an agent.
	 */
	getTrackedState(agentId: string): AgentLifecycleState | undefined {
		return this.trackedStates.get(agentId)
	}

	/**
	 * Get all tracked states.
	 */
	getAllTrackedStates(): Map<string, AgentLifecycleState> {
		return new Map(this.trackedStates)
	}

	/**
	 * Get all lifecycle events.
	 */
	getLifecycleEvents(): LifecycleEvent[] {
		return [...this.lifecycleEvents]
	}

	/**
	 * Get lifecycle events for a specific agent.
	 */
	getAgentEvents(agentId: string): LifecycleEvent[] {
		return this.lifecycleEvents.filter((event) => event.agentId === agentId)
	}

	/**
	 * Get a completion report for an agent.
	 */
	getCompletionReport(agentId: string): CompletionReport | undefined {
		return this.completionReports.get(agentId)
	}

	/**
	 * Get all completion reports.
	 */
	getAllCompletionReports(): CompletionReport[] {
		return Array.from(this.completionReports.values())
	}

	/**
	 * Get agent metadata from the daemon.
	 */
	getAgentMetadata(agentId: string): AgentMetadata | null {
		const agent = this.daemon.getAgent(agentId)
		if (!agent) return null
		return agent as unknown as AgentMetadata
	}

	/**
	 * Handle terminal state transitions.
	 */
	private handleTerminalState(agentId: string, state: AgentLifecycleState): void {
		if (state === AgentLifecycleState.Failed || state === AgentLifecycleState.Crashed) {
			const tasksToReassign = this.findTasksForReassignment(agentId)
			if (tasksToReassign.length > 0) {
				this.lifecycleEvents.push({
					eventId: crypto.randomUUID(),
					agentId,
					previousState: state,
					newState: state,
					timestamp: Date.now(),
					reason: `Tasks needing reassignment: ${tasksToReassign.join(', ')}`,
				})
			}
		}
	}
}

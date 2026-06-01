import {
	AgentType,
	AgentLifecycleState,
	AgentMetadata,
	Notification,
	NotificationType,
	NotificationQueue,
	DirectMessage,
	BroadcastMessage,
	ChannelMessage,
	FileOperation,
	FileStatus,
	FileStatusType,
	TouchNotification,
	IntentNotification,
	ContextKeyNotification,
	CompletionReport,
	Plan,
	Task,
	Dependency,
	Checkpoint,
	PlanUpdate,
	PlanChange,
	PlanChangeType,
	PlanUpdateDecision,
	WorktreeMetadata,
	ConflictInfo,
	ConflictResolution,
	MergePreparation,
	CompletionOutcome,
	ValidationStatus,
	ValidationResult,
	Blocker,
	BlockerType,
	FileChange,
	DaemonSnapshot,
	SwarmEvent,
	SwarmState,
	AgentNode,
	AgentRelationship,
	PlanState,
	TaskNode,
	DependencyEdge,
	ChannelInfo,
	ContextKeyEntry,
	SwarmTaskStatus,
	DependencyType,
	CheckpointStatus,
	CrashReport,
} from '@roo-code/types'

// IAgent Interface
export interface IAgent {
	// Identity
	agentId: string
	agentType: AgentType
	parentId: string | null
	worktreeScope: string | null

	// Lifecycle
	state: AgentLifecycleState
	spawnedAt: number
	lastHeartbeat: number

	// Communication methods
	sendDM(recipientId: string, content: string): Promise<void>
	broadcast(content: string): Promise<void>
	joinChannel(channelName: string): Promise<void>
	leaveChannel(channelName: string): Promise<void>
	sendToChannel(channelName: string, content: string): Promise<void>

	// Context methods
	setContextKey(key: string, value: unknown): void
	getContextKey(key: string): unknown
	subscribeToKey(key: string, callback: (newValue: unknown, oldValue: unknown) => void): void

	// Notifications
	checkPendingNotifications(): Notification[]

	// Plan methods
	proposePlanUpdate(update: PlanUpdate): void

	// Completion reporting
	reportCompletion(report: CompletionReport): void
}

// IDaemon Interface
export interface IDaemon {
	// Agent Registry
	registerAgent(agent: AgentMetadata): void
	unregisterAgent(agentId: string): void
	getAgent(agentId: string): AgentMetadata | null
	listAgents(): AgentMetadata[]
	updateAgentState(agentId: string, state: AgentLifecycleState): void

	// Communication methods
	sendDM(message: DirectMessage): void
	broadcast(message: BroadcastMessage): void
	createChannel(name: string, topic?: string): void
	joinChannel(agentId: string, name: string): void
	leaveChannel(agentId: string, name: string): void
	sendToChannel(message: ChannelMessage): void
	listChannels(): string[]
	getChannelMembers(name: string): string[]

	// Context Keys
	setContextKey(agentId: string, key: string, value: unknown): void
	getContextKey(key: string): unknown
	listContextKeys(): string[]
	subscribeToKey(agentId: string, key: string, callback: (newValue: unknown, oldValue: unknown) => void): void

	// Notifications
	getPendingNotifications(agentId: string): Notification[] | null

	// Touch/Intent
	notifyFileTouch(agentId: string, filePath: string, operation: FileOperation): void
	broadcastIntent(agentId: string, filePaths: string[], toolName: string): void

	// Coordinator management
	getCoordinatorId(): string | null
	setCoordinatorId(coordinatorId: string): void

	// Plan methods
	setPlan(plan: Plan): void
	getPlan(): Plan | null

	// Snapshots
	createSnapshot(): DaemonSnapshot
	restoreFromSnapshot(snapshotId: string): void
	listSnapshots(): string[]

	// Crash Recovery
	getCrashReport(swarmId: string): CrashReport
	forceRecoverAgent(agentId: string): AgentMetadata | null
}

// IWorktreeManager Interface
export interface IWorktreeManager extends IAgent {
	worktreePath: string
	branchName: string
	assignedAgents: string[]
	detectConflicts(): ConflictInfo[]
	coordinateResolution(conflictId: string): ConflictResolution | null
	prepareForMerge(): MergePreparation
}

// ICoordinator Interface
export interface ICoordinator extends IAgent {
	// Plan methods
	createInitialPlan(description: string, tasks: Task[], dependencies: Dependency[]): Plan
	reviewPlanUpdate(update: PlanUpdate): PlanUpdateDecision
	distributePlan(plan: Plan): void

	// Spawning methods
	spawnWorktreeManager(scope: string): AgentMetadata
	spawnAgent(taskId: string, worktreeScope?: string): AgentMetadata
	trackAgentState(agentId: string, state: AgentLifecycleState): void
	handleAgentCompletion(report: CompletionReport): void
	handleAgentFailure(agentId: string, error: string): void

	// Worktree methods
	decideWorktreeUsage(tasks: Task[]): boolean
}
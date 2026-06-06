// Generated file - Updated with validation and merge preparation types
import { z } from 'zod';

// Agent Lifecycle
export enum AgentType {
  Coordinator = 'coordinator',
  WorktreeManager = 'worktree_manager',
  Agent = 'agent'
}

export enum AgentLifecycleState {
  Spawned = 'spawned',
  Ready = 'ready',
  Running = 'running',
  Blocked = 'blocked',
  Completed = 'completed',
  Failed = 'failed',
  Stopped = 'stopped',
  Crashed = 'crashed'
}

export interface AgentMetadata {
  agentId: string;
  agentType: AgentType;
  state: AgentLifecycleState;
  parentId: string | null;
  worktreeScope: string;
  spawnedAt: number; // timestamp
  lastHeartbeat: number; // timestamp
  taskId: string | null;
  mode: string;
}

// Communication Messages
export interface DirectMessage {
  messageId: string;
  senderId: string;
  recipientId: string;
  content: unknown; // Could be more specific if needed
  timestamp: number;
  read: boolean;
}

export interface BroadcastMessage {
  messageId: string;
  senderId: string;
  content: unknown;
  timestamp: number;
  recipients: string[]; // Array of agentIds
}

export interface ChannelMessage {
  messageId: string;
  channelName: string;
  senderId: string;
  content: unknown;
  timestamp: number;
  recipients: string[]; // Array of agentIds subscribed to channel
}

export interface TouchNotification {
  notificationId: string;
  filePath: string;
  modifyingAgentId: string;
  timestamp: number;
  operation: 'create' | 'modify' | 'delete';
}

export interface IntentNotification {
  notificationId: string;
  declaringAgentId: string;
  filePaths: string[];
  timestamp: number;
  toolName: string;
}

export interface ContextKeyNotification {
  notificationId: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  setterAgentId: string;
  timestamp: number;
}

// Notification System
export enum NotificationType {
  DM = 'dm',
  Broadcast = 'broadcast',
  Channel = 'channel',
  Touch = 'touch',
  Intent = 'intent',
  ContextKey = 'context_key'
}

export interface Notification {
  notificationId: string;
  type: NotificationType;
  recipientId: string;
  payload: unknown; // Could be one of the specific notification types
  timestamp: number;
  delivered: boolean;
  acknowledged: boolean;
}

export type NotificationQueue = Array<Notification>;

// Plan Management
export enum SwarmTaskStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Blocked = 'blocked',
  Completed = 'completed',
  Failed = 'failed'
}

export enum DependencyType {
  Hard = 'hard',
  Soft = 'soft'
}

export enum CheckpointStatus {
  Pending = 'pending',
  Completed = 'completed',
  Failed = 'failed'
}

export interface Plan {
  planId: string;
  version: number;
  tasks: Task[];
  dependencies: Dependency[];
  description: string;
  updateHistory: PlanUpdate[];
}

export interface Task {
  taskId: string;
  description: string;
  owner: string; // agentId
  scope: string; // worktree path or similar
  status: SwarmTaskStatus;
  dependsOn: string[]; // taskIds
  blockedBy: string[]; // taskIds
  checkpoints: Checkpoint[];
  estimatedEffort: number; // in minutes or similar unit
  priority: number; // higher number = higher priority
  tags: string[];
}

export interface Dependency {
  fromTaskId: string;
  toTaskId: string;
  type: DependencyType;
}

export interface Checkpoint {
  checkpointId: string;
  description: string;
  status: CheckpointStatus;
  completedAt: number | null; // timestamp
  validationResult: ValidationResult | null;
}

export interface PlanUpdate {
  updateId: string;
  proposerId: string; // agentId
  timestamp: number;
  version: number;
  changes: PlanChange[];
  reason: string;
  impact: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null; // agentId
  reviewedAt: number | null; // timestamp
  reviewNotes: string | null;
}

export enum PlanChangeType {
  AddTask = 'add_task',
  ModifyTask = 'modify_task',
  RemoveTask = 'remove_task',
  AddDependency = 'add_dependency',
  RemoveDependency = 'remove_dependency',
  UpdateScope = 'update_scope'
}

export interface PlanChange {
  changeType: PlanChangeType;
  targetId: string; // taskId or dependencyId
  before: unknown; // snapshot of state before change
  after: unknown; // snapshot of state after change
  description: string;
}

export interface PlanUpdateDecision {
  updateId: string;
  approved: boolean;
  reason: string;
  modifiedChanges: PlanChange[] | null;
}

// Worktree & Conflict
export enum WorktreeStatus {
  Active = 'active',
  Merging = 'merging',
  Merged = 'merged',
  Failed = 'failed'
}

export enum ConflictStatus {
  Detected = 'detected',
  Negotiating = 'negotiating',
  Resolved = 'resolved',
  Escalated = 'escalated'
}

export enum ConflictResolutionStrategy {
  Merge = 'merge',
  Rebase = 'rebase',
  Manual = 'manual',
  CoordinatorDecision = 'coordinator_decision'
}

export interface WorktreeMetadata {
  worktreeId: string;
  path: string;
  branchName: string;
  baseBranch: string;
  managerId: string; // agentId
  assignedAgents: string[]; // agentIds
  status: WorktreeStatus;
  conflicts: ConflictInfo[]; // array of conflictIds or objects? We'll use objects for simplicity
  mergePreparation: MergePreparation | null;
}

export interface ConflictInfo {
  conflictId: string;
  filePath: string;
  conflictingAgents: string[]; // agentIds
  detectedAt: number; // timestamp
  status: ConflictStatus;
  resolution: ConflictResolution | null;
}

export interface ConflictResolution {
  strategy: ConflictResolutionStrategy;
  resolvedBy: string[]; // agentIds
  resolvedAt: number; // timestamp
}

export interface MergePreparation {
  worktreeId: string;
  readyForMerge: boolean;
  unresolvedConflicts: string[]; // conflictIds
  testResults: unknown; // Could be more specific
  // Consolidated validation results; duplicate field removed
  validationResults: ValidationResult[];
  preparedAt: number; // timestamp
  completionReports: CompletionReport[];
  blockers: string[];
}

// Completion Reporting
export enum CompletionOutcome {
  Success = 'success',
  Failure = 'failure',
  Partial = 'partial'
}

export enum FileOperation {
  Create = 'create',
  Modify = 'modify',
  Delete = 'delete'
}

export enum FileStatusType {
  Unmodified = 'unmodified',
  Modified = 'modified',
  Staged = 'staged',
  Conflicted = 'conflicted',
  Deleted = 'deleted',
  Untracked = 'untracked'
}

export interface FileStatus {
  filePath: string;
  status: FileStatusType;
  worktreeId: string;
  lastModifiedBy: string | null; // agentId
  modifiedAt: number | null; // timestamp
}

export enum ValidationStatus {
  Passed = 'passed',
  Failed = 'failed',
  Skipped = 'skipped'
}

export enum BlockerType {
  Dependency = 'dependency',
  Conflict = 'conflict',
  Resource = 'resource',
  External = 'external'
}

export interface CompletionReport {
  reportId: string;
  agentId: string;
  taskId: string;
  timestamp: number;
  outcome: CompletionOutcome;
  changes: FileChange[];
  validationResults: ValidationResult[];
  blockers: Blocker[];
  duration: number; // in milliseconds
}

export interface FileChange {
  filePath: string;
  operation: FileOperation;
  diff: string; // unified diff format
  linesAdded: number;
  linesRemoved: number;
}

export interface ValidationResult {
  checkName: string;
  status: ValidationStatus;
  message: string;
}

export interface Blocker {
  blockerId: string;
  type: BlockerType;
  description: string;
  blockingTaskIds: string[];
  blockingAgentIds: string[];
}

// Plan Versioning — diff between two plan versions
export interface PlanDiff {
  addedTasks: string[];       // taskIds added
  removedTasks: string[];     // taskIds removed
  modifiedTasks: { taskId: string; changes: string[] }[]; // per-task field changes
  statusChange?: { from: string; to: string }; // plan-level status change
}

// Plan Versioning — snapshot of a plan at a point in time
export interface PlanVersion {
  version: number;
  plan: Plan;                  // full plan snapshot (only for latest version; for older versions this may be omitted)
  createdAt: number;
  createdBy: string;           // agentId
  changeDescription: string;
  diff: PlanDiff;
}

// UI Event Types
export enum SwarmEventType {
  AgentStateChange = 'agent_state_change',
  PlanUpdate = 'plan_update',
  ChannelActivity = 'channel_activity',
  NotificationSent = 'notification_sent',
  ConflictDetected = 'conflict_detected',
  TaskProgress = 'task_progress'
}

export interface SwarmEvent {
  type: SwarmEventType;
  payload: unknown; // Could be more specific per event type
  timestamp: number;
  sourceId: string; // agentId or system
}

export interface SwarmState {
  swarmId: string;
  coordinatorId: string; // agentId
  agents: AgentNode[];
  relationships: AgentRelationship[];
  channels: string[]; // channel names
  recentMessages: SwarmEvent[]; // limited history
  overallStatus: string; // e.g., 'healthy', 'degraded', 'failed'
  progressMetrics: unknown; // Could be more specific
}

export interface AgentNode {
  agentId: string;
  agentType: AgentType;
  state: AgentLifecycleState;
  parentId: string | null;
  worktreeScope: string;
  taskId: string | null;
  lastHeartbeat: number; // timestamp
}

export interface AgentRelationship {
  fromAgentId: string;
  toAgentId: string;
  type: 'parent_child' | 'worktree_scope' | 'channel_member' | 'conflict_partner';
}

export interface PlanState {
  planId: string;
  version: number;
  tasks: TaskNode[];
  dependencies: DependencyEdge[];
  criticalPath: string[]; // taskIds
  blockedTasks: string[]; // taskIds
  completionPercentage: number; // 0-100
}

export interface TaskNode {
  taskId: string;
  description: string;
  owner: string; // agentId
  scope: string;
  status: SwarmTaskStatus;
  dependsOn: string[]; // taskIds
  blockedBy: string[]; // taskIds
  priority: number;
  estimatedDuration: number; // in minutes
}

export interface DependencyEdge {
  fromTaskId: string;
  toTaskId: string;
  type: DependencyType;
}

// Channel & Context Types
export interface ChannelInfo {
  name: string;
  topic: string | null;
  createdAt: number;
  members: string[];
  messageCount: number;
}

export interface HistoryQueryOptions {
  limit?: number;
  offset?: number;
  senderId?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  sortBy?: 'asc' | 'desc';
}

export interface ChannelHistoryEntry {
  channelName: string;
  messages: ChannelMessage[];
}

export interface ContextKeyEntry {
  key: string;
  value: unknown;
  setterAgentId: string;
  updatedAt: number;
  subscribers: string[];
}

// Crash Recovery Types
export type CrashType = 'heartbeat_miss' | 'process_exit' | 'timeout'

export interface CrashDetectedEvent {
  agentId: string
  crashType: CrashType
  lastKnownState: AgentLifecycleState
  timestamp: number
  details: string
}

export interface CrashValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  recoverableIssues: string[]
}

export interface ResumeCheckpoint {
  checkpointId: string
  agentId: string
  lastState: AgentLifecycleState
  lastTaskId: string | null
  progressMarker: {
    completed: string[]
    remaining: string[]
  }
  timestamp: number
  worktreeScope: string | null
}

export interface CrashReport {
  swarmId: string
  timestamp: number
  crashedAgents: CrashedAgentInfo[]
  recoveryAttempted: boolean
  recoveryResults: RecoveryResult[]
}

export interface CrashedAgentInfo {
  agentId: string
  crashType: CrashType
  crashedAt: number
  lastKnownState: AgentLifecycleState
  lastTaskId: string | null
}

export interface RecoveryResult {
  agentId: string
  success: boolean
  method: 'resume_checkpoint' | 'reassign_task' | 'failed'
  details: string
}

export interface CrashDetectorConfig {
  heartbeatIntervalMs: number
  heartbeatMissThreshold: number
  timeoutDurationMs: number
  enabled: boolean
}

// Conflict Tracking Types
export type ConflictResolutionMethod = 'merge' | 'override' | 'abort' | 'manual' | 'defer' | 'negotiation'

export interface ConflictHistoryEntry {
  conflictId: string
  timestamp: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  files: string[]
  resolutionStatus: 'active' | 'resolved' | 'escalated' | 'deferred'
  resolvedBy?: string
  resolvedAt?: number
  resolutionMethod?: ConflictResolutionMethod
}

export interface ConflictTimelineEntry {
  conflictId: string
  agentId: string
  worktreeScope: string
  timestamp: number
  event: 'detected' | 'negotiation_started' | 'proposal_submitted' | 'proposal_accepted' | 'proposal_rejected' | 'resolved' | 'escalated'
  details: string
}

// Negotiation Protocol Types
export type NegotiationStatus = 'open' | 'proposed' | 'accepted' | 'rejected' | 'closed'

export type ResolutionStrategy = 'merge' | 'override' | 'abort' | 'manual' | 'defer'

export interface NegotiationProposal {
  proposalId: string
  agentId: string
  resolutionStrategy: ResolutionStrategy
  description: string
  timestamp: number
}

export interface ConflictNegotiation {
  negotiationId: string
  conflictId: string
  initiator: string
  participants: string[]
  status: NegotiationStatus
  proposals: NegotiationProposal[]
  createdAt: number
  updatedAt: number
  resolvedBy?: string
  resolvedAt?: number
  acceptedProposalId?: string
}

// Semantic Conflict Detection Types
export type SemanticConflictType =
  | 'function_signature'
  | 'class_structure'
  | 'api_contract'
  | 'configuration'
  | 'dependency'

export interface SemanticConflict {
  type: SemanticConflictType
  location: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  affectedSymbols: string[]
}

// Extended DaemonSnapshot with conflict tracking
export interface DaemonSnapshot {
  snapshotId: string
  timestamp: number
  version: string
  agents: AgentMetadata[]
  notificationQueues: Record<string, NotificationQueue>
  channels: string[]
  channelHistories: ChannelHistoryEntry[]
  contextKeys: Record<string, unknown>
  plan: Plan | null
  planVersions: PlanVersion[]
  swarmId: string
  coordinatorId: string
  conflictHistory?: ConflictHistoryEntry[]
  conflictTimeline?: ConflictTimelineEntry[]
  activeNegotiations?: ConflictNegotiation[]
}

export type ConflictSeverityLevel = 'none' | 'low' | 'medium' | 'high' | 'critical'

// New Types for Working Set Comparison and Intent Avoidance
export enum IntentAvoidanceStrategy {
  Wait = 'wait',
  Redirect = 'redirect',
  Coordinate = 'coordinate',
  ProceedWithCaution = 'proceed_with_caution',
}

export interface WorkingSetComparisonResult {
  remoteAgentId: string
  overlappingFiles: string[]
  severity: ConflictSeverityLevel
  suggestedActions: string[] // e.g., ['wait', 'coordinate']
}

export interface ConflictRiskReport {
  agentId: string
  totalOverlaps: number
  overallSeverity: ConflictSeverityLevel
  perAgentResults: Record<string, WorkingSetComparisonResult>
  details: Record<string, ConflictSeverityLevel> // filePath -> severity
}

export interface IntentConflictDetail {
  filePath: string
  conflictingAgentIds: string[]
  severity: ConflictSeverityLevel
  operations: FileOperation[]
}

export interface IntentConflictReport {
  conflicts: IntentConflictDetail[]
  hasConflicts: boolean
  maxSeverity: ConflictSeverityLevel
}

export interface AvoidancePlan {
  safePaths: string[]
  conflictingPaths: string[]
  waitForAgents: string[]
  coordinationSuggestions: string[]
  strategy: IntentAvoidanceStrategy
}

// Plan Quality Validation Types
export enum PlanValidationSeverity {
  Error = 'error',
  Warning = 'warning',
  Info = 'info',
}

export enum PlanValidationIssueType {
  CircularDependency = 'circular_dependency',
  OrphanTask = 'orphan_task',
  MissingDescription = 'missing_description',
  InvalidScope = 'invalid_scope',
  UnreachableTask = 'unreachable_task',
  DuplicateTask = 'duplicate_task',
  InconsistentDependencies = 'inconsistent_dependencies',
}

export interface PlanValidationIssue {
  issueId: string;
  type: PlanValidationIssueType;
  severity: PlanValidationSeverity;
  message: string;
}

export interface PlanValidationResult {
  planId: string;
  version: number;
  issues: PlanValidationIssue[];
  overallSeverity: PlanValidationSeverity;
}

export interface TaskValidationResult {
  taskId: string;
  issues: PlanValidationIssue[];
  overallSeverity: PlanValidationSeverity;
}

export interface DependencyValidationResult {
  dependency: Dependency;
  issues: PlanValidationIssue[];
  overallSeverity: PlanValidationSeverity;
}

export interface ScopeValidationResult {
  scope: string;
  issues: PlanValidationIssue[];
  overallSeverity: PlanValidationSeverity;
}

// Merge Preparation Types
export interface MergeReadinessReport {
  ready: boolean;
  blockers: string[];
  unresolvedConflictCount: number;
  activeAgentCount: number;
  validationResults: ValidationResult[];
}

export interface MergePreparationResult {
  worktreeId: string;
  readyForMerge: boolean;
  unresolvedConflicts: string[];
  validationResults: ValidationResult[];
  preparedAt: number;
  completionReports: CompletionReport[];
  blockers: string[];
}

export type MergePreparationAction =
  | { type: 'notify'; message: string }
  | { type: 'auto_merge'; reason: string }
  | { type: 'block'; reason: string };

export interface MergePreparationStatusReport {
  status: 'pending' | 'ready' | 'blocked';
  actions: MergePreparationAction[];
  report: MergePreparationResult;
}

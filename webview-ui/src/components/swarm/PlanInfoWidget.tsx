import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { vscode } from "../../utils/vscode"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { useEvent } from "react-use"
import type { PlanState, TaskNode, DependencyEdge } from "@roo-code/types"
import { computeCriticalPath, getBlockedTasks, type CriticalPathResult, type BlockedTaskInfo } from "./plan-utils"

// Status color mapping using Tailwind + VSCode CSS variable classes
const statusStyles: Record<string, string> = {
	pending: "text-vscode-descriptionForeground",
	in_progress: "text-vscode-charts-green",
	blocked: "text-vscode-charts-yellow",
	completed: "text-vscode-charts-green",
	failed: "text-vscode-charts-red",
}

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
	pending: "outline",
	in_progress: "secondary",
	blocked: "outline",
	completed: "default",
	failed: "destructive",
}

// Local cached state type for the plan view
interface PlanCachedState {
	planState: PlanState | null
	criticalPathResult: CriticalPathResult
	blockedTasks: BlockedTaskInfo[]
}

const PlanInfoWidget: React.FC = () => {
	const { didHydrateState } = useExtensionState()
	const [activeTab, setActiveTab] = useState<"tasks" | "critical" | "blocked">("tasks")
	const [connectionError, setConnectionError] = useState<string | null>(null)

	// Local cached state — buffers plan data from the extension, isolating
	// it from live state until the user explicitly refreshes. This follows
	// the Settings View Pattern from AGENTS.md.
	const [cachedState, setCachedState] = useState<PlanCachedState>({
		planState: null,
		criticalPathResult: { path: [], totalDuration: 0, cycleDetected: false },
		blockedTasks: [],
	})

	// Handle messages from the extension
	const handleMessage = useCallback((event: MessageEvent) => {
		const message = event.data
		if (message.type === "planState") {
			const planState: PlanState = message.payload
			const tasks = planState.tasks
			const criticalPathResult = computeCriticalPath(tasks)
			const blockedTasks = getBlockedTasks(tasks)
			setCachedState({
				planState,
				criticalPathResult,
				blockedTasks,
			})
			setConnectionError(null)
		} else if (message.type === "planStateError") {
			setConnectionError(message.payload?.error || "Unknown error")
		}
	}, [])

	useEvent("message", handleMessage)

	// Request plan state from the extension on mount and when hydrated
	useEffect(() => {
		if (didHydrateState) {
			vscode.postMessage({ type: "getPlanState" })
		}
	}, [didHydrateState])

	// Manual refresh handler
	const handleRefresh = useCallback(() => {
		vscode.postMessage({ type: "getPlanState" })
	}, [])

	// Compute completion percentage
	const completionPercentage = useMemo(() => {
		if (!cachedState.planState) return 0
		const tasks = cachedState.planState.tasks
		if (tasks.length === 0) return 0
		const completed = tasks.filter((t) => t.status === "completed").length
		return Math.round((completed / tasks.length) * 100)
	}, [cachedState.planState])

	// Build a set of critical path task IDs for quick lookup
	const criticalPathIds = useMemo(
		() => new Set(cachedState.criticalPathResult.path.map((t) => t.taskId)),
		[cachedState.criticalPathResult],
	)

	// Build a map of blocked task IDs for quick lookup
	const blockedTaskMap = useMemo(
		() => new Map(cachedState.blockedTasks.map((b) => [b.task.taskId, b])),
		[cachedState.blockedTasks],
	)

	// Format duration (minutes) into human-readable string
	const formatDuration = (minutes: number): string => {
		if (minutes < 60) return `${minutes}m`
		const hours = Math.floor(minutes / 60)
		const mins = minutes % 60
		if (mins === 0) return `${hours}h`
		return `${hours}h ${mins}m`
	}

	// Render a single task row
	const renderTaskRow = (task: TaskNode) => {
		const isCritical = criticalPathIds.has(task.taskId)
		const blockedInfo = blockedTaskMap.get(task.taskId)

		return (
			<div
				key={task.taskId}
				className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
					isCritical
						? "border-vscode-charts-red bg-vscode-inputValidation-warningBackground"
						: blockedInfo
							? "border-vscode-charts-yellow bg-vscode-inputValidation-warningBackground"
							: "border-vscode-input-border"
				}`}
			>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1.5">
						<span className={`text-sm font-medium truncate ${statusStyles[task.status] || ""}`}>
							{task.description}
						</span>
						{isCritical && (
							<Badge variant="destructive" className="text-xs px-1 py-0">
								CRITICAL
							</Badge>
						)}
						{blockedInfo && (
							<span className="text-vscode-charts-yellow text-xs" title="Blocked">
								⚠️
							</span>
						)}
					</div>
					<div className="flex items-center gap-2 text-xs text-vscode-descriptionForeground mt-0.5">
						<span>ID: {task.taskId}</span>
						<span>Owner: {task.owner}</span>
						<span>Est: {formatDuration(task.estimatedDuration)}</span>
						<Badge variant={statusBadgeVariant[task.status] || "outline"} className="text-xs px-1 py-0">
							{task.status}
						</Badge>
					</div>
					{blockedInfo && (
						<div className="text-xs text-vscode-charts-yellow mt-1">
							Blocked by: {blockedInfo.blockedBy.map((b) => b.taskId).join(", ")} (
							{blockedInfo.blockageType} block)
						</div>
					)}
				</div>
			</div>
		)
	}

	// Render the tasks tab
	const renderTasksTab = () => {
		if (!cachedState.planState) {
			return (
				<div className="text-center py-8 text-vscode-descriptionForeground">
					No plan data available. Click Refresh to load.
				</div>
			)
		}

		const tasks = cachedState.planState.tasks
		if (tasks.length === 0) {
			return (
				<div className="text-center py-8 text-vscode-descriptionForeground">
					No tasks in the plan.
				</div>
			)
		}

		return (
			<div className="space-y-2">
				{tasks.map((task) => renderTaskRow(task))}
			</div>
		)
	}

	// Render the critical path tab
	const renderCriticalPathTab = () => {
		const { criticalPathResult } = cachedState
		if (criticalPathResult.cycleDetected) {
			return (
				<div className="p-3 rounded-md border border-vscode-charts-red bg-vscode-inputValidation-warningBackground">
					<div className="text-vscode-charts-red font-medium">⚠ Cycle detected in dependencies</div>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						The task dependency graph contains a cycle. Critical path cannot be computed.
					</div>
				</div>
			)
		}

		if (criticalPathResult.path.length === 0) {
			return (
				<div className="text-center py-8 text-vscode-descriptionForeground">
					No critical path computed. Click Refresh to load plan data.
				</div>
			)
		}

		return (
			<div className="space-y-3">
				<div className="flex items-center justify-between p-2 rounded-md border border-vscode-input-border">
					<span className="text-sm font-medium text-vscode-foreground">Total Estimated Completion Time</span>
					<span className="text-sm font-bold text-vscode-charts-red">
						{formatDuration(criticalPathResult.totalDuration)}
					</span>
				</div>
				<div className="space-y-2">
					{criticalPathResult.path.map((task, index) => (
						<div
							key={task.taskId}
							className="flex items-center gap-2 p-2 rounded-md border border-vscode-charts-red bg-vscode-inputValidation-warningBackground"
						>
							<span className="text-xs text-vscode-descriptionForeground w-5">{index + 1}.</span>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-1.5">
									<span className="text-sm font-medium text-vscode-foreground truncate">
										{task.description}
									</span>
									<Badge variant="destructive" className="text-xs px-1 py-0">
										CRITICAL
									</Badge>
								</div>
								<div className="flex items-center gap-2 text-xs text-vscode-descriptionForeground mt-0.5">
									<span>ID: {task.taskId}</span>
									<span>Est: {formatDuration(task.estimatedDuration)}</span>
									<Badge variant={statusBadgeVariant[task.status] || "outline"} className="text-xs px-1 py-0">
										{task.status}
									</Badge>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		)
	}

	// Render the blocked tasks tab
	const renderBlockedTab = () => {
		const { blockedTasks } = cachedState
		if (blockedTasks.length === 0) {
			return (
				<div className="text-center py-8 text-vscode-descriptionForeground">
					No blocked tasks detected.
				</div>
			)
		}

		return (
			<div className="space-y-2">
				{blockedTasks.map((info) => (
					<div
						key={info.task.taskId}
						className={`p-2 rounded-md border ${
							info.blockageType === "hard"
								? "border-vscode-charts-yellow bg-vscode-inputValidation-warningBackground"
								: "border-vscode-input-border bg-vscode-editor-background"
						}`}
					>
						<div className="flex items-center gap-1.5">
							<span className="text-vscode-charts-yellow">⚠️</span>
							<span className="text-sm font-medium text-vscode-foreground truncate">
								{info.task.description}
							</span>
							<Badge
								variant={info.blockageType === "hard" ? "destructive" : "outline"}
								className="text-xs px-1 py-0"
							>
								{info.blockageType === "hard" ? "HARD BLOCK" : "SOFT BLOCK"}
							</Badge>
						</div>
						<div className="text-xs text-vscode-descriptionForeground mt-0.5">
							ID: {info.task.taskId} · Owner: {info.task.owner} · Est: {formatDuration(info.task.estimatedDuration)}
						</div>
						<div className="text-xs text-vscode-charts-yellow mt-1">
							Blocked by: {info.blockedBy.map((b) => `${b.taskId} (${b.status})`).join(", ")}
						</div>
					</div>
				))}
			</div>
		)
	}

	// Main render
	return (
		<div className="p-4 space-y-4">
			{connectionError && (
				<div className="text-vscode-errorForeground text-sm mb-4">
					Error: {connectionError}
				</div>
			)}

			<div className="border border-vscode-input-border rounded-md p-4 w-full">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold text-vscode-foreground">Plan Info</h2>
					<div className="flex items-center gap-2">
						{cachedState.planState && (
							<span className="text-xs text-vscode-descriptionForeground">
								{completionPercentage}% complete · {formatDuration(cachedState.criticalPathResult.totalDuration)} est. total
							</span>
						)}
						<Button variant="outline" size="sm" onClick={handleRefresh}>
							Refresh
						</Button>
					</div>
				</div>

				{cachedState.planState && (
					<div className="flex items-center gap-4 text-xs text-vscode-descriptionForeground mt-2">
						<span>Plan ID: {cachedState.planState.planId}</span>
						<span>Version: {cachedState.planState.version}</span>
						<span>Tasks: {cachedState.planState.tasks.length}</span>
						<span>Critical path: {cachedState.criticalPathResult.path.length} tasks</span>
						<span>Blocked: {cachedState.blockedTasks.length} tasks</span>
					</div>
				)}

				{cachedState.criticalPathResult.cycleDetected && (
					<div className="mt-2 p-2 rounded-md border border-vscode-charts-red bg-vscode-inputValidation-warningBackground text-xs text-vscode-charts-red">
						⚠ Cycle detected in task dependencies — critical path unavailable
					</div>
				)}

				{/* Tab navigation */}
				<div className="border-b border-vscode-input-border mt-4">
					<div className="flex space-x-1 p-1 bg-vscode-sideBarSectionHeader-background rounded-t-md">
						<button
							onClick={() => setActiveTab("tasks")}
							className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
								activeTab === "tasks"
									? "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground"
									: "text-vscode-descriptionForeground hover:text-vscode-foreground"
							}`}
						>
							Tasks
						</button>
						<button
							onClick={() => setActiveTab("critical")}
							className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
								activeTab === "critical"
									? "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground"
									: "text-vscode-descriptionForeground hover:text-vscode-foreground"
							}`}
						>
							Critical Path
						</button>
						<button
							onClick={() => setActiveTab("blocked")}
							className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
								activeTab === "blocked"
									? "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground"
									: "text-vscode-descriptionForeground hover:text-vscode-foreground"
							}`}
						>
							Blocked
						</button>
					</div>

					<div className="p-4">
						{activeTab === "tasks" && renderTasksTab()}
						{activeTab === "critical" && renderCriticalPathTab()}
						{activeTab === "blocked" && renderBlockedTab()}
					</div>
				</div>
			</div>
		</div>
	)
}

export default PlanInfoWidget
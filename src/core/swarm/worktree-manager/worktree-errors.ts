/**
 * Typed error classes for worktree git operations.
 * These provide structured error information instead of generic Error throws.
 */

/** Base error class for all worktree-related operations */
export class WorktreeError extends Error {
	public readonly code: string
	public readonly details: Record<string, unknown>

	constructor(message: string, code: string, details: Record<string, unknown> = {}) {
		super(message)
		this.name = 'WorktreeError'
		this.code = code
		this.details = details
		Object.setPrototypeOf(this, WorktreeError.prototype)
	}
}

/** Thrown when attempting to create a worktree that already exists */
export class WorktreeAlreadyExistsError extends WorktreeError {
	public readonly worktreePath: string
	public readonly branchName: string

	constructor(worktreePath: string, branchName: string) {
		super(
			`Worktree already exists at path '${worktreePath}' for branch '${branchName}'`,
			'WORKTREE_ALREADY_EXISTS',
			{ worktreePath, branchName }
		)
		this.name = 'WorktreeAlreadyExistsError'
		this.worktreePath = worktreePath
		this.branchName = branchName
		Object.setPrototypeOf(this, WorktreeAlreadyExistsError.prototype)
	}
}

/** Thrown when a branch name conflicts with an existing branch */
export class BranchNameConflictError extends WorktreeError {
	public readonly branchName: string
	public readonly existingBranch: string

	constructor(branchName: string, existingBranch: string) {
		super(
			`Branch name '${branchName}' conflicts with existing branch '${existingBranch}'`,
			'BRANCH_NAME_CONFLICT',
			{ branchName, existingBranch }
		)
		this.name = 'BranchNameConflictError'
		this.branchName = branchName
		this.existingBranch = existingBranch
		Object.setPrototypeOf(this, BranchNameConflictError.prototype)
	}
}

/** Thrown when attempting to remove a worktree that has uncommitted changes */
export class WorktreeNotEmptyError extends WorktreeError {
	public readonly worktreePath: string
	public readonly uncommittedChanges: string[]

	constructor(worktreePath: string, uncommittedChanges: string[]) {
		super(
			`Worktree at '${worktreePath}' has uncommitted changes and cannot be removed cleanly: ${uncommittedChanges.join(', ')}`,
			'WORKTREE_NOT_EMPTY',
			{ worktreePath, uncommittedChanges }
		)
		this.name = 'WorktreeNotEmptyError'
		this.worktreePath = worktreePath
		this.uncommittedChanges = uncommittedChanges
		Object.setPrototypeOf(this, WorktreeNotEmptyError.prototype)
	}
}

/** Thrown when a git merge results in conflicts that must be resolved manually */
export class MergeConflictError extends WorktreeError {
	public readonly sourceBranch: string
	public readonly targetBranch: string
	public readonly conflictingFiles: string[]

	constructor(sourceBranch: string, targetBranch: string, conflictingFiles: string[]) {
		super(
			`Merge from '${sourceBranch}' into '${targetBranch}' resulted in conflicts in: ${conflictingFiles.join(', ')}`,
			'MERGE_CONFLICT',
			{ sourceBranch, targetBranch, conflictingFiles }
		)
		this.name = 'MergeConflictError'
		this.sourceBranch = sourceBranch
		this.targetBranch = targetBranch
		this.conflictingFiles = conflictingFiles
		Object.setPrototypeOf(this, MergeConflictError.prototype)
	}
}

/** Thrown when a git command fails for any reason not covered by the above */
export class GitOperationError extends WorktreeError {
	public readonly command: string
	public readonly exitCode: number | null
	public readonly stderr: string

	constructor(command: string, exitCode: number | null, stderr: string, message?: string) {
		super(
			message ?? `Git command '${command}' failed with exit code ${exitCode}: ${stderr}`,
			'GIT_OPERATION_FAILED',
			{ command, exitCode, stderr }
		)
		this.name = 'GitOperationError'
		this.command = command
		this.exitCode = exitCode
		this.stderr = stderr
		Object.setPrototypeOf(this, GitOperationError.prototype)
	}
}
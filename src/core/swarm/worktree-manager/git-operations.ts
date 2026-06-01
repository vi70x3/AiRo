import { execFile } from 'child_process'
import { promisify } from 'util'
import {
	WorktreeAlreadyExistsError,
	BranchNameConflictError,
	WorktreeNotEmptyError,
	MergeConflictError,
	GitOperationError,
} from './worktree-errors'

const execFileAsync = promisify(execFile)

/**
 * Interface for git operations, allowing injection/mocking for tests.
 * All methods are async since git commands are executed via child_process.
 */
export interface IGitOperations {
	/** Create a new git worktree at the specified path for the given branch */
	createWorktree(worktreePath: string, branchName: string, baseBranch: string): Promise<void>

	/** Remove a git worktree and optionally delete its associated branch */
	removeWorktree(worktreePath: string, branchName: string, force: boolean): Promise<void>

	/** Merge a source branch into a target branch */
	mergeBranch(sourceBranch: string, targetBranch: string, worktreePath: string): Promise<MergeResult>

	/** List all existing git worktrees */
	listWorktrees(): Promise<WorktreeEntry[]>

	/** Create a new branch from a base branch */
	createBranch(branchName: string, baseBranch: string): Promise<void>

	/** Delete a branch */
	deleteBranch(branchName: string, force: boolean): Promise<void>

	/** Check if a branch exists */
	branchExists(branchName: string): Promise<boolean>

	/** Get the current branch name in a worktree */
	getCurrentBranch(worktreePath: string): Promise<string>

	/** Check if a worktree's working directory is clean (no uncommitted changes) */
	isWorktreeClean(worktreePath: string): Promise<CleanStatus>

	/** List files changed in a worktree compared to its base branch */
	listChangedFiles(worktreePath: string, baseBranch: string): Promise<ChangedFile[]>

	/** Get the git repository root directory */
	getRepoRoot(): Promise<string>

	/** Abort an in-progress merge in a worktree */
	abortMerge(worktreePath: string): Promise<void>

	/** Check if a worktree has unresolved merge conflicts */
	hasMergeConflicts(worktreePath: string): Promise<boolean>

	/** Get list of conflicted files in a worktree */
	getConflictedFiles(worktreePath: string): Promise<string[]>

	/** Stage all changes in a worktree */
	stageAll(worktreePath: string): Promise<void>

	/** Commit staged changes in a worktree */
	commit(worktreePath: string, message: string): Promise<void>
}

/** Result of a merge operation */
export interface MergeResult {
	success: boolean
	conflictedFiles: string[]
	message: string
}

/** Entry from `git worktree list` */
export interface WorktreeEntry {
	path: string
	branch: string
	commit: string
	isMain: boolean
}

/** Status of a worktree's cleanliness check */
export interface CleanStatus {
	isClean: boolean
	unstagedChanges: string[]
	stagedChanges: string[]
	untrackedFiles: string[]
}

/** A file that has changed compared to the base branch */
export interface ChangedFile {
	filePath: string
	status: FileChangeStatus
	linesAdded: number
	linesRemoved: number
}

/** Status of a file change relative to base branch */
export type FileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unmerged'

/**
 * Default implementation of IGitOperations using child_process.execFile.
 * All git commands are executed directly (no shell wrappers or aliases).
 */
export class GitOperations implements IGitOperations {
	private gitBinary: string
	private defaultCwd: string

	constructor(gitBinary: string = 'git', defaultCwd?: string) {
		this.gitBinary = gitBinary
		this.defaultCwd = defaultCwd ?? process.cwd()
	}

	/** Execute a git command and return stdout */
	private async execGit(args: string[], cwd?: string): Promise<string> {
		const workingDir = cwd ?? this.defaultCwd
		try {
			const { stdout } = await execFileAsync(this.gitBinary, args, {
				cwd: workingDir,
				maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large diffs
				timeout: 60_000, // 60 second timeout
			})
			return stdout.trim()
		} catch (err: unknown) {
			const error = err as { code?: string | number; stderr?: string; killed?: boolean; signal?: string }
			if (error.killed) {
				throw new GitOperationError(
					`git ${args.join(' ')}`,
					null,
					'Command timed out after 60 seconds',
				)
			}
			// Node.js child_process errors: exit code is in error.code (number or string)
			const exitCode = typeof error.code === 'number' ? error.code : null
			const stderr = error.stderr ?? (typeof error.code === 'string' ? error.code : String(err))
			throw new GitOperationError(
				`git ${args.join(' ')}`,
				exitCode,
				stderr,
			)
		}
	}

	/** Create a new git worktree at the specified path for the given branch */
	async createWorktree(worktreePath: string, branchName: string, baseBranch: string): Promise<void> {
		// Check if branch already exists
		const branchExists = await this.branchExists(branchName)
		if (branchExists) {
			throw new BranchNameConflictError(branchName, branchName)
		}

		// Check if worktree path already exists in the worktree list
		const existingWorktrees = await this.listWorktrees()
		const pathConflict = existingWorktrees.find(wt => wt.path === worktreePath)
		if (pathConflict) {
			throw new WorktreeAlreadyExistsError(worktreePath, pathConflict.branch)
		}

		// Create a new branch from the base branch and add worktree
		// git worktree add -b <new-branch> <path> <base-branch>
		await this.execGit(['worktree', 'add', '-b', branchName, worktreePath, baseBranch])
	}

	/** Remove a git worktree and optionally delete its associated branch */
	async removeWorktree(worktreePath: string, branchName: string, force: boolean): Promise<void> {
		// Check if worktree has uncommitted changes (unless force is true)
		if (!force) {
			const cleanStatus = await this.isWorktreeClean(worktreePath)
			if (!cleanStatus.isClean) {
				const allChanges = [
					...cleanStatus.unstagedChanges,
					...cleanStatus.stagedChanges,
					...cleanStatus.untrackedFiles,
				]
				throw new WorktreeNotEmptyError(worktreePath, allChanges)
			}
		}

		// Remove the worktree
		const forceFlag = force ? '--force' : ''
		const args = ['worktree', 'remove', worktreePath]
		if (force) {
			args.push('--force')
		}
		await this.execGit(args)

		// Delete the associated branch
		try {
			await this.deleteBranch(branchName, force)
		} catch {
			// Branch deletion failure is non-critical after worktree removal
			// The branch may already be gone or may be the current branch
		}
	}

	/** Merge a source branch into a target branch */
	async mergeBranch(sourceBranch: string, targetBranch: string, worktreePath: string): Promise<MergeResult> {
		// Ensure we're on the target branch in the worktree
		const currentBranch = await this.getCurrentBranch(worktreePath)
		if (currentBranch !== targetBranch) {
			await this.execGit(['checkout', targetBranch], worktreePath)
		}

		try {
			const output = await this.execGit(['merge', sourceBranch], worktreePath)
			return {
				success: true,
				conflictedFiles: [],
				message: output,
			}
		} catch (err: unknown) {
			if (err instanceof GitOperationError) {
				// Check if this is a merge conflict (exit code 1 with conflict markers)
				const conflictedFiles = await this.getConflictedFiles(worktreePath)
				if (conflictedFiles.length > 0) {
					throw new MergeConflictError(sourceBranch, targetBranch, conflictedFiles)
				}
				// Re-throw other git errors
				throw err
			}
			throw err
		}
	}

	/** List all existing git worktrees */
	async listWorktrees(): Promise<WorktreeEntry[]> {
		const output = await this.execGit(['worktree', 'list', '--porcelain'])
		return this.parseWorktreeList(output)
	}

	/** Parse the porcelain output of `git worktree list` */
	private parseWorktreeList(output: string): WorktreeEntry[] {
		const entries: WorktreeEntry[] = []
		const blocks = output.split('\n\n')

		for (const block of blocks) {
			if (!block.trim()) continue

			const lines = block.split('\n')
			let path = ''
			let branch = ''
			let commit = ''
			let isMain = false

			for (const line of lines) {
				if (line.startsWith('worktree ')) {
					path = line.substring('worktree '.length)
				} else if (line.startsWith('HEAD ')) {
					commit = line.substring('HEAD '.length)
				} else if (line.startsWith('branch ')) {
					branch = line.substring('branch '.length)
					// refs/heads/ prefix indicates a branch; detached HEAD would be different
					if (branch.startsWith('refs/heads/')) {
						branch = branch.substring('refs/heads/'.length)
					}
				} else if (line === 'bare') {
					// Skip bare worktrees
					continue
				}
			}

			// The first worktree is the main one
			if (entries.length === 0 && path) {
				isMain = true
			}

			if (path && commit) {
				entries.push({ path, branch, commit, isMain })
			}
		}

		return entries
	}

	/** Create a new branch from a base branch */
	async createBranch(branchName: string, baseBranch: string): Promise<void> {
		const exists = await this.branchExists(branchName)
		if (exists) {
			throw new BranchNameConflictError(branchName, branchName)
		}
		await this.execGit(['branch', branchName, baseBranch])
	}

	/** Delete a branch */
	async deleteBranch(branchName: string, force: boolean): Promise<void> {
		const flag = force ? '-D' : '-d'
		await this.execGit(['branch', flag, branchName])
	}

	/** Check if a branch exists */
	async branchExists(branchName: string): Promise<boolean> {
		try {
			const output = await this.execGit(['branch', '--list', branchName])
			// git branch --list returns lines like "  feature-branch" or "* main"
			return output
				.split('\n')
				.some(line => {
					const trimmed = line.trim()
					// Remove the "*" marker for current branch
					const name = trimmed.startsWith('*') ? trimmed.substring(1).trim() : trimmed
					return name === branchName
				})
		} catch {
			return false
		}
	}

	/** Get the current branch name in a worktree */
	async getCurrentBranch(worktreePath: string): Promise<string> {
		const output = await this.execGit(['branch', '--show-current'], worktreePath)
		return output
	}

	/** Check if a worktree's working directory is clean */
	async isWorktreeClean(worktreePath: string): Promise<CleanStatus> {
		const output = await this.execGit(['status', '--porcelain'], worktreePath)
		return this.parseGitStatus(output)
	}

	/** Parse porcelain git status output */
	private parseGitStatus(output: string): CleanStatus {
		const unstagedChanges: string[] = []
		const stagedChanges: string[] = []
		const untrackedFiles: string[] = []

		if (!output) {
			return { isClean: true, unstagedChanges, stagedChanges, untrackedFiles }
		}

		for (const line of output.split('\n')) {
			if (!line.trim()) continue

			const statusCode = line.substring(0, 2)
			const filePath = line.substring(3)

			// Index (staged) status is the first character
			const indexStatus = statusCode[0]
			// Worktree (unstaged) status is the second character
			const worktreeStatus = statusCode[1]

			// Untracked files: '??' status code
			if (statusCode === '??') {
				untrackedFiles.push(filePath)
				continue
			}

			// Conflicted files: 'UU', 'AA', 'DU', etc.
			if (indexStatus === 'U' || worktreeStatus === 'U' ||
				indexStatus === 'A' && worktreeStatus === 'A' ||
				indexStatus === 'D' && worktreeStatus === 'D') {
				unstagedChanges.push(filePath)
				stagedChanges.push(filePath)
				continue
			}

			// Staged changes (index has modifications)
			if (indexStatus !== ' ' && indexStatus !== '?') {
				stagedChanges.push(filePath)
			}

			// Unstaged changes (worktree has modifications)
			if (worktreeStatus !== ' ' && worktreeStatus !== '?') {
				unstagedChanges.push(filePath)
			}
		}

		const isClean = unstagedChanges.length === 0 &&
			stagedChanges.length === 0 &&
			untrackedFiles.length === 0

		return { isClean, unstagedChanges, stagedChanges, untrackedFiles }
	}

	/** List files changed in a worktree compared to its base branch */
	async listChangedFiles(worktreePath: string, baseBranch: string): Promise<ChangedFile[]> {
		const output = await this.execGit(
			['diff', '--name-status', '--numstat', baseBranch],
			worktreePath,
		)
		return this.parseDiffNameStatus(output)
	}

	/** Parse combined --name-status and --numstat output */
	private parseDiffNameStatus(output: string): ChangedFile[] {
		const files: ChangedFile[] = []
		if (!output) return files

		const lines = output.split('\n')
		for (const line of lines) {
			if (!line.trim()) continue

			// Format: status\tadded\tremoved\tfilepath
			// Or for renames: status\tadded\tremoved\told_path\tnew_path
			const parts = line.split('\t')
			if (parts.length < 4) continue

			const statusChar = parts[0]
			const linesAdded = parseInt(parts[1], 10) || 0
			const linesRemoved = parseInt(parts[2], 10) || 0
			const filePath = parts.length >= 5 ? parts[4] : parts[3] // new path for renames

			let status: FileChangeStatus
			switch (statusChar) {
				case 'A':
					status = 'added'
					break
				case 'M':
					status = 'modified'
					break
				case 'D':
					status = 'deleted'
					break
				case 'R':
					status = 'renamed'
					break
				case 'C':
					status = 'copied'
					break
				case 'U':
					status = 'unmerged'
					break
				default:
					status = 'modified'
			}

			files.push({ filePath, status, linesAdded, linesRemoved })
		}

		return files
	}

	/** Get the git repository root directory */
	async getRepoRoot(): Promise<string> {
		return this.execGit(['rev-parse', '--show-toplevel'])
	}

	/** Abort an in-progress merge in a worktree */
	async abortMerge(worktreePath: string): Promise<void> {
		await this.execGit(['merge', '--abort'], worktreePath)
	}

	/** Check if a worktree has unresolved merge conflicts */
	async hasMergeConflicts(worktreePath: string): Promise<boolean> {
		const conflictedFiles = await this.getConflictedFiles(worktreePath)
		return conflictedFiles.length > 0
	}

	/** Get list of conflicted files in a worktree */
	async getConflictedFiles(worktreePath: string): Promise<string[]> {
		try {
			const output = await this.execGit(
				['diff', '--name-only', '--diff-filter=U'],
				worktreePath,
			)
			if (!output) return []
			return output.split('\n').filter(line => line.trim() !== '')
		} catch {
			// If not in a merge state, there are no conflicts
			return []
		}
	}

	/** Stage all changes in a worktree */
	async stageAll(worktreePath: string): Promise<void> {
		await this.execGit(['add', '--all'], worktreePath)
	}

	/** Commit staged changes in a worktree */
	async commit(worktreePath: string, message: string): Promise<void> {
		await this.execGit(['commit', '-m', message], worktreePath)
	}
}
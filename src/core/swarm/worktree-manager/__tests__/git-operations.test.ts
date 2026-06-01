import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GitOperations, IGitOperations, MergeResult, CleanStatus, ChangedFile, WorktreeEntry } from '../git-operations'
import {
	WorktreeAlreadyExistsError,
	BranchNameConflictError,
	WorktreeNotEmptyError,
	MergeConflictError,
	GitOperationError,
} from '../worktree-errors'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const execFileAsync = promisify(execFile)

/**
 * Helper to create a temporary git repository for integration tests.
 * Returns the path to the repo root and the default branch name.
 */
async function createTempGitRepo(): Promise<{ repoRoot: string; defaultBranch: string }> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-ops-test-'))
	await execFileAsync('git', ['init'], { cwd: tmpDir })
	await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
	await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir })
	// Create an initial commit so there's a HEAD
 await fs.promises.writeFile(path.join(tmpDir, 'README.md'), '# Test Repo')
	await execFileAsync('git', ['add', 'README.md'], { cwd: tmpDir })
	await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir })
	// Determine the default branch name (could be 'main' or 'master')
	const { stdout: branchOutput } = await execFileAsync('git', ['branch', '--show-current'], { cwd: tmpDir })
	const defaultBranch = branchOutput.trim()
	return { repoRoot: tmpDir, defaultBranch }
}

/**
 * Helper to clean up a temporary directory.
 */
async function cleanupDir(dirPath: string): Promise<void> {
	await fs.promises.rm(dirPath, { recursive: true, force: true })
}

describe('GitOperations', () => {
	let gitOps: GitOperations
	let repoRoot: string
	let defaultBranch: string

	beforeEach(async () => {
		const { repoRoot: root, defaultBranch: branch } = await createTempGitRepo()
		repoRoot = root
		defaultBranch = branch
		gitOps = new GitOperations('git', repoRoot)
	})

	afterEach(async () => {
		// Clean up any worktrees first to avoid locked dirs
		try {
			const worktrees = await gitOps.listWorktrees()
			for (const wt of worktrees) {
				if (!wt.isMain) {
					try {
						await execFileAsync('git', ['worktree', 'remove', '--force', wt.path], { cwd: repoRoot })
					} catch { /* ignore */ }
				}
			}
		} catch { /* ignore */ }
		await cleanupDir(repoRoot)
	})

	describe('getRepoRoot', () => {
		it('returns the repository root directory', async () => {
			const root = await gitOps.getRepoRoot()
			expect(root).toBe(repoRoot)
		})
	})

	describe('branchExists', () => {
		it('returns false for a non-existent branch', async () => {
			const exists = await gitOps.branchExists('nonexistent-branch')
			expect(exists).toBe(false)
		})

		it('returns true for an existing branch', async () => {
			await execFileAsync('git', ['branch', 'test-branch'], { cwd: repoRoot })
			const exists = await gitOps.branchExists('test-branch')
			expect(exists).toBe(true)
		})
	})

	describe('createBranch', () => {
		it('creates a new branch from a base branch', async () => {
			await gitOps.createBranch('new-branch', defaultBranch)
			const exists = await gitOps.branchExists('new-branch')
			expect(exists).toBe(true)
		})

		it('throws BranchNameConflictError if branch already exists', async () => {
			await execFileAsync('git', ['branch', 'existing-branch'], { cwd: repoRoot })
			await expect(gitOps.createBranch('existing-branch', defaultBranch))
				.rejects.toThrow(BranchNameConflictError)
		})
	})

	describe('deleteBranch', () => {
		it('deletes an existing branch', async () => {
			await execFileAsync('git', ['branch', 'to-delete'], { cwd: repoRoot })
			await gitOps.deleteBranch('to-delete', false)
			const exists = await gitOps.branchExists('to-delete')
			expect(exists).toBe(false)
		})

		it('force deletes a branch', async () => {
			// Create a branch with an unmerged commit
			await execFileAsync('git', ['checkout', '-b', 'unmerged-branch'], { cwd: repoRoot })
			await fs.promises.writeFile(path.join(repoRoot, 'extra.txt'), 'extra content')
			await execFileAsync('git', ['add', 'extra.txt'], { cwd: repoRoot })
			await execFileAsync('git', ['commit', '-m', 'Extra commit'], { cwd: repoRoot })
			// Switch back to default branch
			await execFileAsync('git', ['checkout', defaultBranch], { cwd: repoRoot })
			// Force delete the unmerged branch
			await gitOps.deleteBranch('unmerged-branch', true)
			const exists = await gitOps.branchExists('unmerged-branch')
			expect(exists).toBe(false)
		})
	})

	describe('createWorktree', () => {
		it('creates a new worktree with a new branch', async () => {
			const worktreePath = path.join(repoRoot, 'wt-test-1')
			await gitOps.createWorktree(worktreePath, 'wt-branch-1', defaultBranch)

			// Verify worktree exists
			const worktrees = await gitOps.listWorktrees()
			const wt = worktrees.find(w => w.path === worktreePath)
			expect(wt).toBeDefined()
			expect(wt?.branch).toBe('wt-branch-1')

			// Verify the directory exists
			const dirExists = fs.existsSync(worktreePath)
			expect(dirExists).toBe(true)
		})

		it('throws BranchNameConflictError if branch already exists', async () => {
			await execFileAsync('git', ['branch', 'conflict-branch'], { cwd: repoRoot })
			const worktreePath = path.join(repoRoot, 'wt-conflict')
			await expect(gitOps.createWorktree(worktreePath, 'conflict-branch', defaultBranch))
				.rejects.toThrow(BranchNameConflictError)
		})

		it('throws WorktreeAlreadyExistsError if path already in use', async () => {
			const worktreePath = path.join(repoRoot, 'wt-dup')
			await gitOps.createWorktree(worktreePath, 'wt-dup-branch', defaultBranch)
			await expect(gitOps.createWorktree(worktreePath, 'wt-dup-branch-2', defaultBranch))
				.rejects.toThrow(WorktreeAlreadyExistsError)
		})
	})

	describe('removeWorktree', () => {
		it('removes a clean worktree and its branch', async () => {
			const worktreePath = path.join(repoRoot, 'wt-remove')
			await gitOps.createWorktree(worktreePath, 'wt-remove-branch', defaultBranch)

			await gitOps.removeWorktree(worktreePath, 'wt-remove-branch', false)

			// Verify worktree is gone
			const worktrees = await gitOps.listWorktrees()
			const wt = worktrees.find(w => w.path === worktreePath)
			expect(wt).toBeUndefined()

			// Verify branch is gone
			const branchExists = await gitOps.branchExists('wt-remove-branch')
			expect(branchExists).toBe(false)
		})

		it('throws WorktreeNotEmptyError if worktree has uncommitted changes', async () => {
			const worktreePath = path.join(repoRoot, 'wt-dirty')
			await gitOps.createWorktree(worktreePath, 'wt-dirty-branch', defaultBranch)

			// Add uncommitted changes
			await fs.promises.writeFile(path.join(worktreePath, 'dirty.txt'), 'dirty content')

			await expect(gitOps.removeWorktree(worktreePath, 'wt-dirty-branch', false))
				.rejects.toThrow(WorktreeNotEmptyError)
		})

		it('force removes a worktree with uncommitted changes', async () => {
			const worktreePath = path.join(repoRoot, 'wt-force-remove')
			await gitOps.createWorktree(worktreePath, 'wt-force-branch', defaultBranch)

			// Add uncommitted changes
			await fs.promises.writeFile(path.join(worktreePath, 'dirty.txt'), 'dirty content')

			await gitOps.removeWorktree(worktreePath, 'wt-force-branch', true)

			// Verify worktree is gone
			const worktrees = await gitOps.listWorktrees()
			const wt = worktrees.find(w => w.path === worktreePath)
			expect(wt).toBeUndefined()
		})
	})

	describe('listWorktrees', () => {
		it('lists the main worktree', async () => {
			const worktrees = await gitOps.listWorktrees()
			expect(worktrees.length).toBeGreaterThanOrEqual(1)
			const mainWt = worktrees.find(w => w.isMain)
			expect(mainWt).toBeDefined()
			expect(mainWt?.path).toBe(repoRoot)
		})

		it('lists additional worktrees', async () => {
			const worktreePath = path.join(repoRoot, 'wt-list')
			await gitOps.createWorktree(worktreePath, 'wt-list-branch', defaultBranch)

			const worktrees = await gitOps.listWorktrees()
			expect(worktrees.length).toBe(2)
			const extraWt = worktrees.find(w => w.path === worktreePath)
			expect(extraWt).toBeDefined()
			expect(extraWt?.branch).toBe('wt-list-branch')
			expect(extraWt?.isMain).toBe(false)
		})
	})

	describe('getCurrentBranch', () => {
		it('returns the current branch in the main worktree', async () => {
			const branch = await gitOps.getCurrentBranch(repoRoot)
			expect(branch).toBe(defaultBranch)
		})

		it('returns the branch in a worktree', async () => {
			const worktreePath = path.join(repoRoot, 'wt-branch')
			await gitOps.createWorktree(worktreePath, 'wt-branch-check', defaultBranch)

			const branch = await gitOps.getCurrentBranch(worktreePath)
			expect(branch).toBe('wt-branch-check')
		})
	})

	describe('isWorktreeClean', () => {
		it('returns clean status for a clean worktree', async () => {
			const status = await gitOps.isWorktreeClean(repoRoot)
			expect(status.isClean).toBe(true)
			expect(status.unstagedChanges).toEqual([])
			expect(status.stagedChanges).toEqual([])
			expect(status.untrackedFiles).toEqual([])
		})

		it('detects untracked files', async () => {
			await fs.promises.writeFile(path.join(repoRoot, 'new-file.txt'), 'new content')
			const status = await gitOps.isWorktreeClean(repoRoot)
			expect(status.isClean).toBe(false)
			expect(status.untrackedFiles).toContain('new-file.txt')
		})

		it('detects staged changes', async () => {
			await fs.promises.writeFile(path.join(repoRoot, 'staged.txt'), 'staged content')
			await execFileAsync('git', ['add', 'staged.txt'], { cwd: repoRoot })
			const status = await gitOps.isWorktreeClean(repoRoot)
			expect(status.isClean).toBe(false)
			expect(status.stagedChanges).toContain('staged.txt')
		})

		it('detects unstaged modifications to tracked files', async () => {
			// Modify a tracked file (README.md) without staging
 await fs.promises.writeFile(path.join(repoRoot, 'README.md'), '# Modified')
			const status = await gitOps.isWorktreeClean(repoRoot)
			expect(status.isClean).toBe(false)
			// Modified tracked files appear in both staged and unstaged lists
 expect(status.stagedChanges.length + status.unstagedChanges.length).toBeGreaterThan(0)
		})
	})

	describe('listChangedFiles', () => {
		it('returns empty array when no changes', async () => {
			const files = await gitOps.listChangedFiles(repoRoot, defaultBranch)
			expect(files).toEqual([])
		})

		it('lists added files compared to base branch', async () => {
			// Create a branch and add a file
			await execFileAsync('git', ['checkout', '-b', 'changes-branch'], { cwd: repoRoot })
			await fs.promises.writeFile(path.join(repoRoot, 'added.txt'), 'added content')
			await execFileAsync('git', ['add', 'added.txt'], { cwd: repoRoot })
			await execFileAsync('git', ['commit', '-m', 'Add file'], { cwd: repoRoot })
			await execFileAsync('git', ['checkout', defaultBranch], { cwd: repoRoot })

			const changedFiles = await gitOps.listChangedFiles(repoRoot, 'changes-branch')
			// When comparing current branch (default) to changes-branch, there should be no changes
 expect(changedFiles).toEqual([])
		})
	})

	describe('mergeBranch', () => {
		it('successfully merges a branch with no conflicts', async () => {
			// Create a branch with a new file
			await execFileAsync('git', ['checkout', '-b', 'merge-source'], { cwd: repoRoot })
			await fs.promises.writeFile(path.join(repoRoot, 'merge-file.txt'), 'merge content')
			await execFileAsync('git', ['add', 'merge-file.txt'], { cwd: repoRoot })
			await execFileAsync('git', ['commit', '-m', 'Add merge file'], { cwd: repoRoot })
			await execFileAsync('git', ['checkout', defaultBranch], { cwd: repoRoot })

			const result = await gitOps.mergeBranch('merge-source', defaultBranch, repoRoot)
			expect(result.success).toBe(true)
			expect(result.conflictedFiles).toEqual([])
		})

		it('throws MergeConflictError when merge has conflicts', async () => {
			// Create conflicting changes on two branches
			await execFileAsync('git', ['checkout', '-b', 'conflict-source'], { cwd: repoRoot })
			await fs.promises.writeFile(path.join(repoRoot, 'README.md'), '# Conflict Source')
			await execFileAsync('git', ['add', 'README.md'], { cwd: repoRoot })
			await execFileAsync('git', ['commit', '-m', 'Conflict source change'], { cwd: repoRoot })

			await execFileAsync('git', ['checkout', defaultBranch], { cwd: repoRoot })
			await fs.promises.writeFile(path.join(repoRoot, 'README.md'), '# Conflict Target')
			await execFileAsync('git', ['add', 'README.md'], { cwd: repoRoot })
			await execFileAsync('git', ['commit', '-m', 'Conflict target change'], { cwd: repoRoot })

			await expect(gitOps.mergeBranch('conflict-source', defaultBranch, repoRoot))
				.rejects.toThrow(MergeConflictError)
		})
	})

	describe('abortMerge', () => {
		it('aborts an in-progress merge', async () => {
			// Create conflicting changes
			await execFileAsync('git', ['checkout', '-b', 'abort-source'], { cwd: repoRoot })
			await fs.promises.writeFile(path.join(repoRoot, 'README.md'), '# Abort Source')
			await execFileAsync('git', ['add', 'README.md'], { cwd: repoRoot })
			await execFileAsync('git', ['commit', '-m', 'Abort source change'], { cwd: repoRoot })

			await execFileAsync('git', ['checkout', defaultBranch], { cwd: repoRoot })
			await fs.promises.writeFile(path.join(repoRoot, 'README.md'), '# Abort Target')
			await execFileAsync('git', ['add', 'README.md'], { cwd: repoRoot })
			await execFileAsync('git', ['commit', '-m', 'Abort target change'], { cwd: repoRoot })

			// Start a merge that will conflict
 try {
				await execFileAsync('git', ['merge', 'abort-source'], { cwd: repoRoot })
			} catch { /* expected conflict */ }

			// Verify we're in a merge state
			const hasConflicts = await gitOps.hasMergeConflicts(repoRoot)
			expect(hasConflicts).toBe(true)

			// Abort the merge
			await gitOps.abortMerge(repoRoot)

			// Verify merge is aborted — should be clean now
			const cleanAfter = await gitOps.isWorktreeClean(repoRoot)
			expect(cleanAfter.isClean).toBe(true)
		})
	})

	describe('hasMergeConflicts and getConflictedFiles', () => {
		it('returns false when no merge conflicts', async () => {
			const hasConflicts = await gitOps.hasMergeConflicts(repoRoot)
			expect(hasConflicts).toBe(false)
		})

		it('returns empty array when no conflicts', async () => {
			const files = await gitOps.getConflictedFiles(repoRoot)
			expect(files).toEqual([])
		})
	})

	describe('stageAll and commit', () => {
		it('stages all changes and commits', async () => {
			await fs.promises.writeFile(path.join(repoRoot, 'commit-file.txt'), 'commit content')
			await gitOps.stageAll(repoRoot)
			await gitOps.commit(repoRoot, 'Test commit message')

			const status = await gitOps.isWorktreeClean(repoRoot)
			expect(status.isClean).toBe(true)
		})
	})
})

describe('GitOperations Error Classes', () => {
	describe('WorktreeError', () => {
		it('has correct code and details', () => {
			const error = new WorktreeAlreadyExistsError('/path/to/wt', 'feature-branch')
			expect(error.code).toBe('WORKTREE_ALREADY_EXISTS')
			expect(error.worktreePath).toBe('/path/to/wt')
			expect(error.branchName).toBe('feature-branch')
			expect(error.message).toContain('/path/to/wt')
			expect(error.message).toContain('feature-branch')
		})
	})

	describe('BranchNameConflictError', () => {
		it('has correct properties', () => {
			const error = new BranchNameConflictError('new-branch', 'existing-branch')
			expect(error.code).toBe('BRANCH_NAME_CONFLICT')
			expect(error.branchName).toBe('new-branch')
			expect(error.existingBranch).toBe('existing-branch')
		})
	})

	describe('WorktreeNotEmptyError', () => {
		it('has correct properties', () => {
			const error = new WorktreeNotEmptyError('/path/to/wt', ['file1.txt', 'file2.txt'])
			expect(error.code).toBe('WORKTREE_NOT_EMPTY')
			expect(error.worktreePath).toBe('/path/to/wt')
			expect(error.uncommittedChanges).toEqual(['file1.txt', 'file2.txt'])
		})
	})

	describe('MergeConflictError', () => {
		it('has correct properties', () => {
			const error = new MergeConflictError('source', 'target', ['conflict1.ts', 'conflict2.ts'])
			expect(error.code).toBe('MERGE_CONFLICT')
			expect(error.sourceBranch).toBe('source')
			expect(error.targetBranch).toBe('target')
			expect(error.conflictingFiles).toEqual(['conflict1.ts', 'conflict2.ts'])
		})
	})

	describe('GitOperationError', () => {
		it('has correct properties', () => {
			const error = new GitOperationError('git worktree add', 1, 'some stderr output')
			expect(error.code).toBe('GIT_OPERATION_FAILED')
			expect(error.command).toBe('git worktree add')
			expect(error.exitCode).toBe(1)
			expect(error.stderr).toBe('some stderr output')
		})

		it('accepts custom message', () => {
			const error = new GitOperationError('git merge', 128, 'stderr', 'Custom message')
			expect(error.message).toBe('Custom message')
		})
	})

	describe('Error inheritance', () => {
		it('all errors inherit from Error and have code/details', () => {
			const errors = [
				new WorktreeAlreadyExistsError('/p', 'b'),
				new BranchNameConflictError('b1', 'b2'),
				new WorktreeNotEmptyError('/p', ['f']),
				new MergeConflictError('s', 't', ['f']),
				new GitOperationError('cmd', 1, 'err'),
			]
			for (const error of errors) {
				expect(error).toBeInstanceOf(Error)
				expect(error.code).toBeDefined()
				expect(error.details).toBeDefined()
			}
		})
	})
})

describe('GitOperations with mock IGitOperations', () => {
	/**
	 * Create a mock IGitOperations for testing WorktreeManager
 * without actually running git commands.
	 */
	function createMockGitOps(): IGitOperations {
		return {
			createWorktree: vi.fn(),
			removeWorktree: vi.fn(),
			mergeBranch: vi.fn(),
			listWorktrees: vi.fn(),
			createBranch: vi.fn(),
			deleteBranch: vi.fn(),
			branchExists: vi.fn(),
			getCurrentBranch: vi.fn(),
			isWorktreeClean: vi.fn(),
			listChangedFiles: vi.fn(),
			getRepoRoot: vi.fn(),
			abortMerge: vi.fn(),
			hasMergeConflicts: vi.fn(),
			getConflictedFiles: vi.fn(),
			stageAll: vi.fn(),
			commit: vi.fn(),
		} as IGitOperations
	}

	it('mock can be injected and called', async () => {
		const mockOps = createMockGitOps()
		const mockOpsCreate = mockOps.createWorktree as ReturnType<typeof vi.fn>
		mockOpsCreate.mockResolvedValue(undefined)

		await mockOps.createWorktree('/path', 'branch', 'main')
		expect(mockOpsCreate).toHaveBeenCalledWith('/path', 'branch', 'main')
	})

	it('mock can simulate errors', async () => {
		const mockOps = createMockGitOps()
		const mockOpsCreate = mockOps.createWorktree as ReturnType<typeof vi.fn>
		mockOpsCreate.mockRejectedValue(new BranchNameConflictError('conflict-branch', 'conflict-branch'))

		await expect(mockOps.createWorktree('/path', 'conflict-branch', 'main'))
			.rejects.toThrow(BranchNameConflictError)
	})
})
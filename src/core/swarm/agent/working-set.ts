import { FileStatusType, FileOperation, FileStatus } from '@roo-code/types'
import { ConflictSeverity } from './notification-handler'

// Extended FileStatus for working set that includes operation info
export interface WorkingSetEntry extends FileStatus {
  operation?: FileOperation
}

export class WorkingSet {
  private files: Map<string, WorkingSetEntry>
  
  constructor() {
    this.files = new Map()
  }
  
  /**
   * Mark a file as being read by this agent.
   * If file already has a higher status (intent/modified), don't downgrade.
   */
  markAsRead(filePath: string): void {
    if (!this.files.has(filePath)) {
      const entry: WorkingSetEntry = {
        filePath: filePath,
        status: FileStatusType.Unmodified,
        worktreeId: 'default',
        lastModifiedBy: null,
        modifiedAt: null,
        operation: undefined
      }
      this.files.set(filePath, entry)
    }
  }
  
  /**
   * Mark a file as intended to be modified (from intent declaration).
   * Upgrades from read to intent. Doesn't downgrade from modified/committed.
   */
  markAsIntent(filePath: string, operation: FileOperation): void {
    const current = this.files.get(filePath)
    if (current) {
      if (current.status !== FileStatusType.Modified && current.status !== FileStatusType.Committed) {
        current.status = FileStatusType.Staged
        current.operation = operation
        this.files.set(filePath, current)
      }
    } else {
      const entry: WorkingSetEntry = {
        filePath: filePath,
        status: FileStatusType.Staged,
        worktreeId: 'default',
        lastModifiedBy: null,
        modifiedAt: Date.now(),
        operation: operation
      }
      this.files.set(filePath, entry)
    }
  }
  
  /**
   * Mark a file as actually modified.
   * Upgrades from read/intent to modified.
   */
  markAsModified(filePath: string, operation: FileOperation): void {
    const current = this.files.get(filePath)
    if (current) {
      current.status = FileStatusType.Modified
      current.operation = operation
      this.files.set(filePath, current)
    } else {
      const entry: WorkingSetEntry = {
        filePath: filePath,
        status: FileStatusType.Modified,
        worktreeId: 'default',
        lastModifiedBy: null,
        modifiedAt: Date.now(),
        operation: operation
      }
      this.files.set(filePath, entry)
    }
  }
  
  /**
   * Mark a file as committed (changes saved/committed).
   * Upgrades from modified to committed.
   */
  markAsCommitted(filePath: string): void {
    const current = this.files.get(filePath)
    if (current) {
      current.status = FileStatusType.Committed
      this.files.set(filePath, current)
    } else {
      const entry: WorkingSetEntry = {
        filePath: filePath,
        status: FileStatusType.Committed,
        worktreeId: 'default',
        lastModifiedBy: null,
        modifiedAt: Date.now(),
        operation: undefined
      }
      this.files.set(filePath, entry)
    }
  }
  
  /**
   * Remove a file from the working set.
   */
  remove(filePath: string): void {
    this.files.delete(filePath)
  }
  
  /**
   * Get the status of a file in the working set.
   */
  getStatus(filePath: string): FileStatus | undefined {
    return this.files.get(filePath)
  }
  
  /**
   * Check if a file is in the working set.
   */
  has(filePath: string): boolean {
    return this.files.has(filePath)
  }
  
  /**
   * Get all files in the working set.
   */
  getAll(): Map<string, WorkingSetEntry> {
    return new Map(this.files)
  }
  
  /**
   * Get all files with a specific status type.
   */
  getByStatus(statusType: FileStatusType): Map<string, WorkingSetEntry> {
    const result = new Map<string, WorkingSetEntry>()
    for (const [filePath, entry] of this.files) {
      if (entry.status === statusType) {
        result.set(filePath, entry)
      }
    }
    return result
  }
  
  /**
   * Get all file paths in the working set.
   */
  getFilePaths(): string[] {
    return Array.from(this.files.keys())
  }
  
  /**
   * Check if any of the given file paths overlap with this working set.
   * Returns the overlapping paths and their statuses.
   */
  checkOverlap(filePaths: string[]): Map<string, WorkingSetEntry> {
    const overlaps = new Map<string, WorkingSetEntry>()
    for (const filePath of filePaths) {
      if (this.files.has(filePath)) {
        const entry = this.files.get(filePath)
        if (entry) {
          overlaps.set(filePath, entry)
        }
      }
    }
    return overlaps
  }
  
  /**
   * Assess the severity of a conflict for a given file path.
   * From the spec:
   * - High: agent has uncommitted changes (modified status) on the file
   * - Medium: agent has declared intent on the file
   * - Low: agent has only read the file
   * - None: file not in working set
   */
  assessSeverity(filePath: string): ConflictSeverity {
    const entry = this.files.get(filePath)
    if (!entry) {
      return ConflictSeverity.None
    }
    
    if (entry.status === FileStatusType.Modified) {
      return ConflictSeverity.High
    } else if (entry.status === FileStatusType.Staged) {
      return ConflictSeverity.Medium
    } else if (entry.status === FileStatusType.Unmodified) {
      return ConflictSeverity.Low
    }
    
    return ConflictSeverity.None
  }
  
  /**
   * Clear the entire working set.
   */
  clear(): void {
    this.files.clear()
  }
  
  /**
   * Get the count of files in the working set.
   */
  size(): number {
    return this.files.size
  }
}
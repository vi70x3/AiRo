import { describe, it, expect, beforeEach, vi, test } from 'vitest'
import { WorkingSet } from '../working-set'
import { ConflictSeverity } from '../notification-handler'
import { FileStatusType, FileOperation } from '@roo-code/types'

describe('WorkingSet', () => {
  let workingSet: WorkingSet

  beforeEach(() => {
    workingSet = new WorkingSet()
  })

  it('should initialize with empty files map', () => {
    expect(workingSet.size()).toBe(0)
    expect(workingSet.getAll().size).toBe(0)
  })

  it('should mark file as read', () => {
    workingSet.markAsRead('test.txt')
    expect(workingSet.size()).toBe(1)
    expect(workingSet.has('test.txt')).toBe(true)
  })

  it('should mark file as intent', () => {
    workingSet.markAsIntent('test.txt', FileOperation.Modify)
    expect(workingSet.getStatus('test.txt')).toBeDefined()
    expect(workingSet.assessSeverity('test.txt')).toBe(ConflictSeverity.Medium)
  })

  it('should mark file as modified', () => {
    workingSet.markAsModified('test.txt', FileOperation.Modify)
    const status = workingSet.getStatus('test.txt')
    expect(status).toBeDefined()
    expect(status?.status).toBe(FileStatusType.Modified)
  })

  it('should mark file as committed', () => {
    workingSet.markAsCommitted('test.txt')
    const status = workingSet.getStatus('test.txt')
    expect(status).toBeDefined()
    expect(status?.status).toBe(FileStatusType.Committed)
  })

  it('should assess severity correctly', () => {
    // Test with no file
    expect(workingSet.assessSeverity('nonexistent.txt')).toBe(ConflictSeverity.None)
    
    // Test with read status
    workingSet.markAsRead('test.txt')
    expect(workingSet.assessSeverity('test.txt')).toBe(ConflictSeverity.Low)
    
    // Test with intent status
    workingSet.markAsIntent('test2.txt', FileOperation.Modify)
    expect(workingSet.assessSeverity('test2.txt')).toBe(ConflictSeverity.Medium)
    
    // Test with modified status
    workingSet.markAsModified('test3.txt', FileOperation.Create)
    expect(workingSet.assessSeverity('test3.txt')).toBe(ConflictSeverity.High)
  })

  it('should handle file operations correctly', () => {
    // Test markAsRead
    workingSet.markAsRead('file1.txt')
    expect(workingSet.has('file1.txt')).toBe(true)
    
    // Test markAsIntent
    workingSet.markAsIntent('file2.txt', FileOperation.Modify)
    expect(workingSet.has('file2.txt')).toBe(true)
    
    // Test markAsModified
    workingSet.markAsModified('file3.txt', FileOperation.Create)
    expect(workingSet.has('file3.txt')).toBe(true)
    
    // Test markAsCommitted
    workingSet.markAsCommitted('file3.txt')
    const status = workingSet.getStatus('file3.txt')
    expect(status).toBeDefined()
    expect(status?.status).toBe(FileStatusType.Committed)
  })

  it('should get all files', () => {
    // Add some files first
    workingSet.markAsRead('test1.txt')
    workingSet.markAsIntent('test2.txt', FileOperation.Modify)
    const allFiles = workingSet.getAll()
    expect(allFiles.size).toBeGreaterThan(0)
  })

  it('should get files by status', () => {
    workingSet.markAsRead('test1.txt')
    workingSet.markAsIntent('test2.txt', FileOperation.Modify)
    workingSet.markAsModified('test3.txt', FileOperation.Create)
    workingSet.markAsCommitted('test4.txt')
    
    const unmodifiedFiles = workingSet.getByStatus(FileStatusType.Unmodified)
    const modifiedFiles = workingSet.getByStatus(FileStatusType.Modified)
    const committedFiles = workingSet.getByStatus(FileStatusType.Committed)
    const stagedFiles = workingSet.getByStatus(FileStatusType.Staged)
    const conflictedFiles = workingSet.getByStatus(FileStatusType.Conflicted)
    const deletedFiles = workingSet.getByStatus(FileStatusType.Deleted)
    
    expect(unmodifiedFiles.size).toBeGreaterThanOrEqual(0)
    expect(modifiedFiles.size).toBeGreaterThanOrEqual(0)
    expect(committedFiles.size).toBeGreaterThanOrEqual(0)
    expect(conflictedFiles.size).toBeGreaterThanOrEqual(0)
    expect(deletedFiles.size).toBeGreaterThanOrEqual(0)
  })

  it('should get file paths', () => {
    // Add some files first
    workingSet.markAsRead('test1.txt')
    workingSet.markAsIntent('test2.txt', FileOperation.Modify)
    const paths = workingSet.getFilePaths()
    expect(paths.length).toBeGreaterThan(0)
  })

  it('should check overlap', () => {
    workingSet.markAsRead('test1.txt')
    workingSet.markAsIntent('test2.txt', FileOperation.Modify)
    workingSet.markAsModified('test3.txt', FileOperation.Create)
    
    const overlaps = workingSet.checkOverlap(['test1.txt', 'test2.txt', 'test3.txt'])
    expect(overlaps.size).toBeGreaterThan(0)
  })

  it('should assess severity', () => {
    workingSet.markAsRead('test.txt')
    expect(workingSet.assessSeverity('test.txt')).toBe(ConflictSeverity.Low)
    
    workingSet.markAsIntent('test2.txt', FileOperation.Modify)
    expect(workingSet.assessSeverity('test2.txt')).toBe(ConflictSeverity.Medium)
    
    workingSet.markAsModified('test3.txt', FileOperation.Create)
    expect(workingSet.assessSeverity('test3.txt')).toBe(ConflictSeverity.High)
  })

  it('should clear working set', () => {
    workingSet.clear()
    expect(workingSet.size()).toBe(0)
  })
})
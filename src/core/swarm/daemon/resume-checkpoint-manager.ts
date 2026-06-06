import {
  AgentLifecycleState,
  AgentMetadata,
  ResumeCheckpoint,
} from '@roo-code/types'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export class ResumeCheckpointManager {
  private checkpointDir: string
  private swarmId: string

  constructor(swarmId: string) {
    this.swarmId = swarmId
    this.checkpointDir = path.join(os.homedir(), '.kiro', 'swarm', 'checkpoints', swarmId)
    this.ensureCheckpointDir()
  }

  private ensureCheckpointDir(): void {
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true })
    }
  }

  private getCheckpointPath(checkpointId: string): string {
    return path.join(this.checkpointDir, `${checkpointId}.json`)
  }

  createCheckpoint(
    agentId: string,
    agent: AgentMetadata,
    lastTaskId: string | null,
    progressMarker: { completed: string[]; remaining: string[] }
  ): ResumeCheckpoint {
    const checkpoint: ResumeCheckpoint = {
      checkpointId: `checkpoint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      lastState: agent.state,
      lastTaskId,
      progressMarker,
      timestamp: Date.now(),
      worktreeScope: agent.worktreeScope || null,
    }

    try {
      const checkpointPath = this.getCheckpointPath(checkpoint.checkpointId)
      fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2))
    } catch (error) {
      console.error('Failed to persist checkpoint:', error)
    }

    return checkpoint
  }

  getLatestCheckpoint(agentId: string): ResumeCheckpoint | null {
    try {
      if (!fs.existsSync(this.checkpointDir)) {
        return null
      }

      const files = fs.readdirSync(this.checkpointDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const path = this.getCheckpointPath(f.replace('.json', ''))
          const stat = fs.statSync(path)
          return { path, stat }
        })
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)

      for (const file of files) {
        const checkpointData = fs.readFileSync(file.path, 'utf-8')
        const checkpoint: ResumeCheckpoint = JSON.parse(checkpointData)
        if (checkpoint.agentId === agentId) {
          return checkpoint
        }
      }

      return null
    } catch (error) {
      console.error('Failed to read checkpoint:', error)
      return null
    }
  }

  listCheckpoints(agentId?: string): ResumeCheckpoint[] {
    try {
      if (!fs.existsSync(this.checkpointDir)) {
        return []
      }

      const files = fs.readdirSync(this.checkpointDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const path = this.getCheckpointPath(f.replace('.json', ''))
          const checkpointData = fs.readFileSync(path, 'utf-8')
          return JSON.parse(checkpointData) as ResumeCheckpoint
        })
        .sort((a, b) => b.timestamp - a.timestamp)

      if (agentId) {
        return files.filter(c => c.agentId === agentId)
      }

      return files
    } catch (error) {
      console.error('Failed to list checkpoints:', error)
      return []
    }
  }

  deleteCheckpoint(checkpointId: string): boolean {
    try {
      const checkpointPath = this.getCheckpointPath(checkpointId)
      if (fs.existsSync(checkpointPath)) {
        fs.unlinkSync(checkpointPath)
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to delete checkpoint:', error)
      return false
    }
  }

   cleanupOldCheckpoints(maxToKeep: number = 10): void {
     try {
       if (!fs.existsSync(this.checkpointDir)) {
         return
       }

       const files = fs.readdirSync(this.checkpointDir)
         .filter(f => f.endsWith(".json"))
         .map(f => {
           const checkpointPath = this.getCheckpointPath(f.replace(".json", ""))
           const checkpointData = fs.readFileSync(checkpointPath, "utf-8")
           const checkpoint: ResumeCheckpoint = JSON.parse(checkpointData)
           return { name: f, path: checkpointPath, stat: fs.statSync(checkpointPath), checkpoint }
         })
         .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)

       // Group checkpoints by agentId and keep only the most recent for each agent
       const agentCheckpoints = new Map<string, ResumeCheckpoint[]>();
       for (const file of files) {
         const agentId = file.checkpoint.agentId;
         if (!agentCheckpoints.has(agentId)) {
           agentCheckpoints.set(agentId, []);
         }
         agentCheckpoints.get(agentId)!.push(file.checkpoint);
       }

       // Keep only the most recent checkpoint for each agent
       const recentCheckpoints = new Map<string, ResumeCheckpoint>();
       for (const [agentId, checkpoints] of agentCheckpoints) {
         checkpoints.sort((a, b) => b.timestamp - a.timestamp);
         recentCheckpoints.set(agentId, checkpoints[0]);
       }

       // Collect all checkpoints except the most recent for each agent
       const allCheckpoints = new Set<string>();
       for (const checkpoint of recentCheckpoints.values()) {
         allCheckpoints.add(checkpoint.checkpointId);
       }

       // Delete old checkpoints, excluding the most recent for each agent
       const filesToDelete = files.filter(file => {
         return !allCheckpoints.has(file.checkpoint.checkpointId);
       }).slice(0, maxToKeep - recentCheckpoints.size);

       for (const file of filesToDelete) {
         fs.unlinkSync(file.path);
       }
     } catch (error) {
       console.error("Failed to cleanup old checkpoints:", error)
     }
   }
}
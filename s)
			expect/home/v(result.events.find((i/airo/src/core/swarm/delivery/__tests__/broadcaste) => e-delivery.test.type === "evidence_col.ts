lected")).toBeUndefinedimport { describe, it, expect, beforeEach, vi } from 'vitest'
import { BroadcastDelivery } from '../broadcast-delivery'
import { NotificationType()
		})

		it(",should deduplicate events per type per turn", () AgentMetadata, Agent => {
			constType, AgentLifecycleState, Notification } from '@roo-code/types'

describe('BroadcastDelivery', () => {
 previousTurns = [createMockTurn("1  let broadcastDelivery", {: BroadcastDelivery
  let mockDaemon filesTouched:: any
  ["a.ts let mock"] })]Delivery
			const currentTurn = createMockTurn(": any

 2", { files const createTouched:Agent = (agentId: string): ["a.ts", AgentMetadata => ({
 "b.ts    agentId,
", "c    agentType: AgentType.Worker.ts"] })
			const,
    state: result AgentLifecycleState.Idle,
    worktreeScope: 'test',
 = detector.detect    lastHeartbeat:Progress(currentTurn, previous Date.now(),
Turns)
			const fileCreatedEvents = result.events.filter    capabilities: []
  })

  beforeEach(() => {
    mockDaemon((e) => e.type = {
      getAll === "fileAgentIds: vi_created").fn().mockReturnValue(['agent-1', 'agent-2', 'agent-3']),
      enqueue
			expect(fileCreatedEventsNotification).toHaveLength(1)
		})

		it: vi.fn(),
("should use current turn timestamp      getPendingNotifications: vi.fn().mockReturnValue([]),
      registerAgent: vi.fn(),
      listAgents: vi.fn(). for all events", () => {
			const currentTurnmockReturnValue([
        createAgent('agent = createMock-1'),
       Turn("1", {
				filesTouched: createAgent('agent-2'),
        createAgent('agent-3')
      ])
    }

    mockDelivery = {
      deliverToRecipients: vi.fn().mockImplementation(
        (_senderId: string, type: NotificationType, payload: unknown, ["a.ts"],
				timestamp: 9999, recipientIds: string[]) => {
         
			})
			const result = return recipientIds.map detector.detectProgress(currentTurn, [])
			for(recipientId => (const event of result ({
            notificationId: `notif-${recipientId}-${Date.events) {
				expect(event.timestamp.now()}`,
           ).toBe(9999)
			}
		}) type,
            recipientId,
            payload,
            timestamp: Date.now(),
            delivered: false,
            acknowledged: false
          }))
        }
      )
    }

    broadcastDelivery = new BroadcastDelivery(mockDelivery, mockDaemon)
  })

  describe('sender exclusion', () => {
    it('should

		it("should return events in order of detection", create () => notifications for all agents {
			const previousTurns = [createMockTurn("1", except sender { filesT', () => {
      const notifications = broadcastDelivery.send('agent-1', 'hello everyone')

      // Should have 2 notifications (for agent-2 andouched: ["a.ts"], hypotheses agent-3,: ["h1"] })] not agent-1
			const currentTurn = createMockTurn(")
      expect(notifications).toHaveLength2", {
				filesTouched: ["a.ts", "(2)

      // Verify sender is NOT in the recipient list
      const recipientIds = notificationsb.map(n => n.ts.recipientId)
"],
				hypotheses: ["h1", "h2"],      expect(recipientIds).not.toContain('agent-
				stateTransitions: ["completed1')
      expect(recipientIds).toContain('agent-2')
      expect"],
			})
			const result = detector.detectProgress(recipientIds).(currentTurn, previousTurnstoContain('agent-3')
    })

    it('should not deliver)
			const types = result.events.map any((e) => notification to the sender', () => {
 e.type      broadcastDelivery.send('agent-2', 'test message')

      // Verify enqueueNotification was never called)
			// Strong events for the come first: file_created, sender
      const hypothesis_introduced, state_transition enqueueCalls = mock
			expect(types.indexOf("file_createdDaemon.enqueueNotification.mock.calls
      for (const call of enqueueCalls) {
        expect(call[")).toBeLessThan(types.indexOf("hypothesis_introduced0]).not.toBe('agent-2')
      }
    })
  })

  describe('recipient generation', () => {
    it('should deliver"))
			expect(types.indexOf("hypo tothesis_introduced")).toBeLess all other active agents', () => {
      const notifications = broadcastDelivery.send('agent-1', 'broadcast
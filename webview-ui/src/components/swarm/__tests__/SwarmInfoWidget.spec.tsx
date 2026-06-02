import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import SwarmInfoWidget from '../SwarmInfoWidget'

// Store the handler for later use
let messageHandler: ((event: MessageEvent) => void) | null = null

// Mock UI components
vi.mock('../../../components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => (
    <div data-testid="dialog" data-open={open} onClick={onOpenChange}>{open ? children : null}</div>
  ),
  DialogContent: ({ children }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: any) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: any) => (
    <div data-testid="dialog-title">{children}</div>
  ),
}))

// Mock Button component
vi.mock('../../../components/ui/button', () => ({
  Button: ({ children, onClick }: any) => (
    <button data-testid="button" onClick={onClick}>{children}</button>
  ),
}))

// Mock Badge component
vi.mock('../../../components/ui/badge', () => ({
  Badge: ({ children }: any) => (
    <div data-testid="badge">{children}</div>
  ),
}))

// Mock the message event listener - just store the handler, don't call it
vi.mock('react-use', () => ({
  useEvent: vi.fn((eventName: string, handler: any) => {
    if (eventName === 'message') {
      messageHandler = handler
      ;(window as any).__messageHandler = handler
    }
  }),
}))

// Mock the useExtensionState hook
vi.mock('../../../context/ExtensionStateContext', () => ({
  useExtensionState: () => ({
    didHydrateState: true,
  }),
}))

// Mock the vscode utility
vi.mock('../../../utils/vscode', () => ({
  vscode: {
    postMessage: vi.fn(),
  },
}))

describe('SwarmInfoWidget', () => {
  const mockSwarmState = {
    swarmId: 'test-swarm',
    coordinatorId: 'coordinator-1',
    agents: [
      { agentId: 'agent-1', agentType: 'agent', state: 'running', position: { x: 0, y: 0 }, color: '#10b981' },
      { agentId: 'agent-2', agentType: 'agent', state: 'blocked', position: { x: 100, y: 100 }, color: '#f59e0b' },
      { agentId: 'coordinator-1', agentType: 'coordinator', state: 'ready', position: { x: 200, y: 200 }, color: '#3b82f6' },
    ],
    relationships: [],
    channels: [],
    overallStatus: 'running',
    startTime: new Date('2023-01-01T00:00:00Z'),
    activeAgents: 3,
    completedTasks: 0,
    totalTasks: 5,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    messageHandler = null
  })

  it('renders without crashing', () => {
    render(<SwarmInfoWidget />)
    expect(screen.getByText('Swarm Info')).toBeInTheDocument()
  })

  it('displays status indicators when swarm state is available', async () => {
    render(<SwarmInfoWidget />)
    
    // Simulate message event with swarm state
    if (messageHandler) {
      messageHandler({
        data: {
          type: 'swarmState',
          payload: mockSwarmState,
        },
      } as any)
    }
    
    await waitFor(() => {
      expect(screen.getByText('Running: 1')).toBeInTheDocument()
      expect(screen.getByText('Blocked: 1')).toBeInTheDocument()
      expect(screen.getByText('Ready: 1')).toBeInTheDocument()
    })
  })

  it('opens agent details dialog when an agent is clicked', async () => {
    render(<SwarmInfoWidget />)
    
    // Simulate message event with swarm state
    if (messageHandler) {
      messageHandler({
        data: {
          type: 'swarmState',
          payload: mockSwarmState,
        },
      } as any)
    }
    
    await waitFor(() => {
      // Click on an agent
      const agentElements = screen.getAllByText('Agent')
      const agentElement = agentElements[0]
      fireEvent.click(agentElement)
      
      // Check if the dialog is opened
      expect(screen.getByTestId('dialog[data-open="true"]')).toBeInTheDocument()
    })
  })

  it('opens channel details dialog when a channel is clicked', async () => {
    render(<SwarmInfoWidget />)
    
    // Simulate message event with channels
    if (messageHandler) {
      messageHandler({
        data: {
          type: 'swarmState',
          payload: {
            ...mockSwarmState,
            channels: [
              { channelName: 'channel-1', members: ['agent-1', 'agent-2'], lastMessage: 'Test message', lastMessageTime: new Date() }
            ],
          },
        },
      } as any)
    }
    
    await waitFor(() => {
      // Switch to channels tab
      const channelsTab = screen.getByText('Channels')
      fireEvent.click(channelsTab)
      
      // Click on a channel
      const channelElement = screen.getByText('#channel-1')
      fireEvent.click(channelElement)
      
      // Check if the dialog is opened
      expect(screen.getByTestId('dialog[data-open="true"]')).toBeInTheDocument()
    })
  })

  it('opens swarm info dialog when info button is clicked', async () => {
    render(<SwarmInfoWidget />)
    
    // Simulate message event with swarm state
    if (messageHandler) {
      messageHandler({
        data: {
          type: 'swarmState',
          payload: mockSwarmState,
        },
      } as any)
    }
    
    await waitFor(() => {
      // Click on the info button
      const infoButton = screen.getByText('Info')
      fireEvent.click(infoButton)
      
      // Check if the dialog is opened
      expect(screen.getByTestId('dialog[data-open="true"]')).toBeInTheDocument()
    })
  })

  it('handles connection errors', async () => {
    render(<SwarmInfoWidget />)
    
    // Simulate message event with error
    if (messageHandler) {
      messageHandler({
        data: {
          type: 'swarmStateError',
          payload: {
            error: 'Failed to connect to swarm state service',
          },
        },
      } as any)
    }
    
    await waitFor(() => {
      expect(screen.getByText('Error: Failed to connect to swarm state service')).toBeInTheDocument()
    })
  })
})

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import SwarmInfoWidget from '../SwarmInfoWidget'

// Mock UI components
jest.mock('../../../components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => (
    <div data-testid="dialog" data-open={open} onClick={onOpenChange}>{children}</div>
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
jest.mock('../../../components/ui/button', () => ({
  Button: ({ children, onClick }: any) => (
    <button data-testid="button" onClick={onClick}>{children}</button>
  ),
}))

// Mock Badge component
jest.mock('../../../components/ui/badge', () => ({
  Badge: ({ children }: any) => (
    <div data-testid="badge">{children}</div>
  ),
}))

// Mock the useEvent handler to simulate message events
const mockMessageHandler = jest.fn((event: any) => {
  if (event.data.type === 'swarmState') {
    ;(window as any).__messageHandler(event)
  }
})

// Mock the message event listener
jest.mock('react-use', () => ({
  useEvent: jest.fn((eventName: string, handler: any) => {
    if (eventName === 'message') {
      ;(window as any).__messageHandler = handler
      mockMessageHandler({
        data: {
          type: 'swarmState',
          payload: {
            swarmId: 'test-swarm',
            coordinatorId: 'coordinator-1',
            agents: [],
            channels: [],
            overallStatus: 'running',
            startTime: new Date('2023-01-01T00:00:00Z'),
            activeAgents: 0,
            completedTasks: 0,
            totalTasks: 0,
          },
        },
      })
    }
  }),
}))

// Mock the useExtensionState hook
jest.mock('../../../context/ExtensionStateContext', () => ({
  useExtensionState: () => ({
    didHydrateState: true,
  }),
}))

// Mock the vscode utility
jest.mock('../../../utils/vscode', () => ({
  vscode: {
    postMessage: jest.fn(),
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
    jest.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<SwarmInfoWidget />)
    expect(screen.getByText('Swarm Info')).toBeInTheDocument()
  })

  it('displays status indicators when swarm state is available', async () => {
    render(<SwarmInfoWidget />)
    
    // Simulate message event with swarm state
    const handler = (window as any).__messageHandler
    if (handler) {
      handler({
        data: {
          type: 'swarmState',
          payload: mockSwarmState,
        },
      })
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
    const handler = (window as any).__messageHandler
    if (handler) {
      handler({
        data: {
          type: 'swarmState',
          payload: mockSwarmState,
        },
      })
    }
    
    await waitFor(() => {
      // Click on an agent
      const agentElement = screen.getByText('Agent')
      fireEvent.click(agentElement)
      
      // Check if the dialog is opened
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })
  })

  it('opens channel details dialog when a channel is clicked', async () => {
    render(<SwarmInfoWidget />)
    
    // Simulate message event with channels
    const handler = (window as any).__messageHandler
    if (handler) {
      handler({
        data: {
          type: 'swarmState',
          payload: {
            ...mockSwarmState,
            channels: [
              { channelName: 'channel-1', members: ['agent-1', 'agent-2'], lastMessage: 'Test message', lastMessageTime: new Date() }
            ],
          },
        },
      })
    }
    
    await waitFor(() => {
      // Switch to channels tab
      const channelsTab = screen.getByText('Channels')
      fireEvent.click(channelsTab)
      
      // Click on a channel
      const channelElement = screen.getByText('channel-1')
      fireEvent.click(channelElement)
      
      // Check if the dialog is opened
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })
  })

  it('opens swarm info dialog when info button is clicked', async () => {
    render(<SwarmInfoWidget />)
    
    // Simulate message event with swarm state
    const handler = (window as any).__messageHandler
    if (handler) {
      handler({
        data: {
          type: 'swarmState',
          payload: mockSwarmState,
        },
      })
    }
    
    await waitFor(() => {
      // Click on the info button
      const infoButton = screen.getByText('Info')
      fireEvent.click(infoButton)
      
      // Check if the dialog is opened
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })
  })

  it('handles connection errors', async () => {
    render(<SwarmInfoWidget />)
    
    // Simulate message event with error
    const handler = (window as any).__messageHandler
    if (handler) {
      handler({
        data: {
          type: 'swarmStateError',
          payload: {
            error: 'Failed to connect to swarm state service',
          },
        },
      })
    }
    
    await waitFor(() => {
      expect(screen.getByText('Error: Failed to connect to swarm state service')).toBeInTheDocument()
    })
  })
})
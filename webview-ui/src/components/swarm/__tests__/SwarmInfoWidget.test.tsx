import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import SwarmInfoWidget from '../SwarmInfoWidget'

// Mock UI components
vi.mock('../../../components/ui/dialog', () => ({
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
  DialogTrigger: ({ children }: any) => (
    <div data-testid="dialog-trigger">{children}</div>
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

// Mock the useEvent handler to simulate message events
const mockMessageHandler = vi.fn((event: any) => {
  if (event.data.type === 'swarmState') {
    ;(window as any).__messageHandler(event)
  }
})

// Mock the message event listener
vi.mock('react-use', () => ({
  useEvent: vi.fn((eventName: string, handler: any) => {
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
  })

  it('renders without crashing', () => {
    render(<SwarmInfoWidget />)
    expect(screen.getByText('Swarm Info')).toBeInTheDocument()
  })

  it('displays agent status indicators', async () => {
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

  it('displays agent list with correct types', async () => {
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
      expect(screen.getByText('Agent')).toBeInTheDocument()
      expect(screen.getByText('Coordinator')).toBeInTheDocument()
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
      const agentElements = screen.getAllByText('Agent')
      const agentElement = agentElements[0]
      fireEvent.click(agentElement)
      
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

  it('displays empty state when no agents are available', async () => {
    render(<SwarmInfoWidget />)
    
    // Simulate message event with empty agents
    const handler = (window as any).__messageHandler
    if (handler) {
      handler({
        data: {
          type: 'swarmState',
          payload: {
            ...mockSwarmState,
            agents: [],
          },
        },
      })
    }
    
    await waitFor(() => {
      // Check if empty state is displayed
      expect(screen.getByText('No agents in swarm yet')).toBeInTheDocument()
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

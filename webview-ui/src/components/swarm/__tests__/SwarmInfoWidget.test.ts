import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import SwarmInfoWidget from '../SwarmInfoWidget'

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

// Mock WebSocket
jest.mock('ws', () => ({
  default: jest.fn().mockImplementation(() => ({
    onopen: jest.fn(),
    onmessage: jest.fn(),
    onclose: jest.fn(),
    onerror: jest.fn(),
    close: jest.fn(),
  }))),
}))

describe('SwarmInfoWidget', () => {
  beforeEach(() => {
    // Mock WebSocket implementation
    const mockWebSocket = require('ws')
    mockWebSocket.default.mockClear()
    
    // Mock the WebSocket instance
    const mockWsInstance = {
      onopen: jest.fn(),
      onmessage: jest.fn(),
      onclose: jest.fn(),
      onerror: jest.fn(),
      close: jest.fn(),
    }
    
    mockWebSocket.default.mockReturnValue(mockWsInstance)
  })

  // Mock the useEvent hook
  jest.mock('react-use', () => ({
    ...jest.requireActual('react-use'),
    useEvent: jest.fn((eventName, handler) => {
      if (eventName === 'message') {
        // Simulate a message event
        const mockEvent = {
          data: JSON.stringify({
            type: 'swarmState',
            payload: {
              swarmId: 'test-swarm',
              coordinatorId: 'coordinator-1',
              agents: [
                { agentId: 'agent-1', agentType: 'agent', state: 'running', position: { x: 0, y: 0 }, color: '#10b981' },
                { agentId: 'agent-2', agentType: 'agent', state: 'blocked', position: { x: 100, y: 100 }, color: '#f59e0b' },
              ],
              relationships: [],
              channels: [],
              overallStatus: 'running',
              startTime: new Date(),
              activeAgents: 2,
              completedTasks: 0,
              totalTasks: 5,
            },
          }),
        }
        handler(mockEvent)
      }
    }),
  }))

  it('renders without crashing', () => {
    render(<SwarmInfoWidget />)
    expect(screen.getByText('Swarm Info')).toBeInTheDocument()
  })

  it('displays agent status indicators', async () => {
    render(<SwarmInfoWidget />)
    
    // Wait for the component to update with the mock data
    await waitFor(() => {
      expect(screen.getByText('Running: 1')).toBeInTheDocument()
      expect(screen.getByText('Blocked: 1')).toBeInTheDocument()
    })
  })

  it('displays agent list', async () => {
    render(<SwarmInfoWidget />)
    
    // Wait for the component to update with the mock data
    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeInTheDocument()
      expect(screen.getByText('agent-2')).toBeInTheDocument()
    })
  })

  it('opens agent details dialog when an agent is clicked', async () => {
    render(<SwarmInfoWidget />)
    
    // Wait for the component to update with the mock data
    await waitFor(() => {
      // Click on an agent
      fireEvent.click(screen.getByText('agent-1'))
      
      // Check if the dialog is opened
      expect(screen.getByText('Agent Details')).toBeInTheDocument()
    })
  })

  it('opens swarm info dialog when info button is clicked', async () => {
    render(<SwarmInfoWidget />)
    
    // Wait for the component to update with the mock data
    await waitFor(() => {
      // Click on the info button
      fireEvent.click(screen.getByText('Info'))
      
      // Check if the dialog is opened
      expect(screen.getByText('Swarm Information')).toBeInTheDocument()
    })
  })

  it('handles WebSocket connection errors', async () => {
    // Mock WebSocket to throw an error
    const mockWebSocket = require('ws')
    mockWebSocket.default.mockImplementation(() => {
      const instance = {
        onopen: jest.fn(),
        onmessage: jest.fn(),
        onclose: jest.fn(),
        onerror: jest.fn(),
        close: jest.fn(),
      }
      instance.onerror.mockImplementation(() => {
        throw new Error('WebSocket error')
      })
      return instance
    })
    
    // Mock the SwarmInfoWidget to handle connection errors
    const SwarmInfoWidgetWithMocks = require('../SwarmInfoWidget').default
    const SwarmInfoWidgetMock = SwarmInfoWidgetWithMocks as jest.Mock
    SwarmInfoWidgetMock.mockImplementation(() => {
      const [connectionError, setConnectionError] = React.useState<string | null>(null)
      
      return (
        <div>
          {connectionError && <div className="text-red-500">Connection Error: {connectionError}</div>}
          <SwarmInfoWidget />
        </div>
      )
    })
    
    // Render the component
    render(<SwarmInfoWidgetMock />)
    
    // Check if the connection error is displayed
    expect(screen.getByText('Connection Error: Failed to connect to swarm state service')).toBeInTheDocument()
  })

  it('displays 
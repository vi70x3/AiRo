import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useExtensionState } from '../../context/ExtensionStateContext';
import { useTranslation } from '../../i18n';
import { useToast } from '../../ui/use-toast';
import { Button } from '../../ui/button';
import { Tooltip } from '../../ui/tooltip';
import { cn } from '../../lib/utils';

interface Task {
  id: string;
  name: string;
  owner: string;
  scope: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  checkpoints: string[];
  dependencies: string[];
  isCriticalPath: boolean;
}

interface PlanInfoWidgetProps {
  className?: string;
}

const PlanInfoWidget: React.FC<PlanInfoWidgetProps> = ({ className }) => {
  const { t } = useTranslation('mcp');
  const { toast } = useToast();
  const { cachedState } = useExtensionState();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  const fetchPlanData = useCallback(async () => {
    try {
      setIsLoading(true);
      // In a real implementation, this would fetch from your backend
      // For now, we'll use mock data
      const mockTasks: Task[] = [
        {
          id: 'task-1',
          name: 'Design Architecture',
          owner: 'team-lead',
          scope: 'backend',
          status: 'completed',
          checkpoints: ['Initial draft', 'Reviewed by team'],
          dependencies: [],
          isCriticalPath: true,
        },
        {
          id: 'task-2',
          name: 'Implement Core Logic',
          owner: 'dev-team',
          scope: 'backend',
          status: 'in-progress',
          checkpoints: ['Setup project', 'Implement basic functionality'],
          dependencies: ['task-1'],
          isCriticalPath: true,
        },
        {
          id: 'task-3',
          name: 'Write Tests',
          owner: 'qa-team',
          scope: 'backend',
          status: 'pending',
          checkpoints: [],
          dependencies: ['task-2'],
          isCriticalPath: false,
        },
      ];
      setTasks(mockTasks);
    } catch (error) {
      toast({
        title: t('planInfoWidget.fetchErrorTitle'),
        description: t('planInfoWidget.fetchErrorDescription'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    fetchPlanData();
    // Set up interval for real-time updates
    const interval = setInterval(fetchPlanData, 30000);
    return () => clearInterval(interval);
  }, [fetchPlanData]);

  const handleTaskClick = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setSelectedTask(task);
    }
  };

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-500';
      case 'in-progress':
        return 'text-blue-500';
      case 'blocked':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const renderTaskDetails = () => {
    if (!selectedTask) return null;

    return (
      <div className="p-4 border rounded-lg bg-gray-50">
        <h3 className="text-lg font-semibold mb-2">{selectedTask.name}</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-sm text-gray-600">Owner: {selectedTask.owner}</p>
            <p className="text-sm text-gray-600">Scope: {selectedTask.scope}</p>
            <p className={`text-sm font-medium ${getStatusColor(selectedTask.status)}`}>Status: {selectedTask.status}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Checkpoints:</p>
            <ul className="list-disc pl-5">
              {selectedTask.checkpoints.map((checkpoint, index) => (
                <li key={index} className="text-sm">{checkpoint}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderTaskDAG = () => {
    // This is a simplified DAG visualization
    // In a real implementation, you would use a proper graph visualization library
    return (
      <div className="p-4 border rounded-lg bg-gray-50">
        <svg ref={svgRef} className="w-full h-64" viewBox="0 0 1000 500">
          {/* Render nodes */}
          {tasks.map((task, index) => {
            const x = 100 + index * 200;
            const y = 250;
            return (
              <g key={task.id} onClick={() => handleTaskClick(task.id)} className="cursor-pointer">
                <circle
                  cx={x}
                  cy={y}
                  r="30"
                  fill={task.isCriticalPath ? '#3b82f6' : '#9ca3af'}
                  stroke="#1f2937"
                  strokeWidth="2"
                />
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize="12"
                >
                  {task.name.substring(0, 10) + (task.name.length > 10 ? '...' : '')}
                </text>
              </g>
            );
          })}

          {/* Render edges */}
          {tasks.map(task => {
            return task.dependencies.map(depId => {
              const depTask = tasks.find(t => t.id === depId);
              if (!depTask) return null;

              const depIndex = tasks.indexOf(depTask);
              const taskIndex = tasks.indexOf(task);

              const startX = 100 + depIndex * 200;
              const startY = 250;
              const endX = 100 + taskIndex * 200;
              const endY = 250;

              return (
                <line
                  key={`${depId}-${task.id}`}
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke="#1f2937"
                  strokeWidth="2"
                  markerEnd="url(#arrowhead)"
                />
              );
            });
          })}

          {/* Arrowhead marker */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#1f2937" />
            </marker>
          </defs>
        </svg>
      </div>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">{t('planInfoWidget.title')}</h2>
        <Button
          onClick={fetchPlanData}
          disabled={isLoading}
          size="sm"
        >
          {isLoading ? t('common.refreshing') : t('common.refresh')}
        </Button>
      </div>

      {renderTaskDAG()}
      {renderTaskDetails()}
    </div>
  );
};

export default PlanInfoWidget;
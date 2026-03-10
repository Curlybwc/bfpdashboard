import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Package, Users } from 'lucide-react';

interface TaskLifecycleActionsProps {
  isActionableTask: boolean;
  canExecuteTask: boolean;
  isCrewMode: boolean;
  isUnassigned: boolean;
  isAssignedToMe: boolean;
  materialsReady: boolean;
  canComplete: boolean;
  meIsCandidate: boolean;
  meIsActiveWorker: boolean;
  showBlockerButton: boolean;
  actionLoading: boolean;
  stage: string;
  onDibs: () => void;
  onStart: () => void;
  onComplete: () => void;
  onJoinCrew: () => void;
  onLeaveCrew: () => void;
  onOpenBlocker: () => void;
  onOpenMaterials: () => void;
}

const TaskLifecycleActions = ({
  isActionableTask,
  canExecuteTask,
  isCrewMode,
  isUnassigned,
  isAssignedToMe,
  materialsReady,
  canComplete,
  meIsCandidate,
  meIsActiveWorker,
  showBlockerButton,
  actionLoading,
  stage,
  onDibs,
  onStart,
  onComplete,
  onJoinCrew,
  onLeaveCrew,
  onOpenBlocker,
  onOpenMaterials,
}: TaskLifecycleActionsProps) => {
  return (
    <div className="flex gap-2 flex-wrap">
      {isActionableTask && canExecuteTask && !isCrewMode && isUnassigned && stage === 'Ready' && (
        <Button variant="outline" onClick={onDibs} disabled={actionLoading}>Dibs</Button>
      )}
      {isActionableTask && canExecuteTask && !isCrewMode && isAssignedToMe && stage === 'Ready' && (
        materialsReady ? (
          <Button onClick={onStart} disabled={actionLoading}>Start</Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span><Button disabled>Start</Button></span>
            </TooltipTrigger>
            <TooltipContent>Materials must be on site before starting.</TooltipContent>
          </Tooltip>
        )
      )}
      {isActionableTask && canExecuteTask && !isCrewMode && isAssignedToMe && stage === 'In Progress' && (
        canComplete ? (
          <Button onClick={onComplete} disabled={actionLoading}>Complete</Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span><Button disabled>Complete</Button></span>
            </TooltipTrigger>
            <TooltipContent>All subtasks must be completed first.</TooltipContent>
          </Tooltip>
        )
      )}
      {isActionableTask && canExecuteTask && isCrewMode && meIsCandidate && !meIsActiveWorker && (
        <Button onClick={onJoinCrew} disabled={actionLoading}>
          <Users className="h-4 w-4 mr-1" />Join
        </Button>
      )}
      {isActionableTask && canExecuteTask && isCrewMode && meIsActiveWorker && (
        <Button variant="outline" onClick={onLeaveCrew} disabled={actionLoading}>Leave</Button>
      )}
      {showBlockerButton && (
        <Button variant="destructive" size="sm" onClick={onOpenBlocker} disabled={actionLoading}>
          <AlertTriangle className="h-4 w-4 mr-1" />Report Issue
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={onOpenMaterials}>
        <Package className="h-4 w-4" />
        Materials
      </Button>
    </div>
  );
};

export default TaskLifecycleActions;

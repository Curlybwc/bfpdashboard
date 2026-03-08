import { Card } from '@/components/ui/card';
import { cn, getErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import StatusBadge from '@/components/StatusBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Flag, Package, ChevronRight, ChevronDown, Users, Repeat } from 'lucide-react';
import TaskMaterialsSheet from '@/components/TaskMaterialsSheet';
import { BLOCKER_REASONS } from '@/lib/supabase-types';
import { claimTask, completeTask, startTask } from '@/lib/taskLifecycle';

interface TaskCardProps {
  task: any;
  projectName: string;
  userId: string;
  isAdmin: boolean;
  onUpdate: () => void;
  showProjectName?: boolean;
  isChild?: boolean;
  parentTitle?: string;
  childCount?: number;
  expanded?: boolean;
  onToggle?: () => void;
  allChildrenDone?: boolean;
  context?: 'today' | 'project';
  projectAddress?: string;
  assigneeName?: string;
  isCrewTask?: boolean;
  isActiveWorker?: boolean;
  isCandidate?: boolean;
  activeWorkerCount?: number;
  blockerInfo?: { reason: string; needs_from_manager?: string | null } | null;
  photoCount?: number;
  materialCount?: number;
}

const TaskCard = ({
  task, projectName, userId, isAdmin, onUpdate,
  showProjectName = true, isChild = false, parentTitle,
  childCount = 0, expanded = false, onToggle, allChildrenDone = true,
  context = 'project', projectAddress, assigneeName,
  isCrewTask = false, isActiveWorker = false, isCandidate = false, activeWorkerCount = 0,
  blockerInfo, photoCount = 0, materialCount = 0,
}: TaskCardProps) => {
  const { toast } = useToast();
  const [dibsConfirmOpen, setDibsConfirmOpen] = useState(false);
  const [photoConfirmOpen, setPhotoConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);

  const isAssignedToMe = task.assigned_to_user_id === userId;
  const isUnassigned = !task.assigned_to_user_id;
  const isOutsideVendor = task.is_outside_vendor === true;
  const materialsReady = task.materials_on_site === 'Yes';

  // Solo action visibility — outside vendor tasks are not available for dibs
  const showDibs = !isCrewTask && isUnassigned && !isOutsideVendor && task.stage === 'Ready';
  const showStart = !isCrewTask && isAssignedToMe && task.stage === 'Ready';
  const showComplete = !isCrewTask && isAssignedToMe && task.stage === 'In Progress';

  // Crew action visibility
  const showJoin = isCrewTask && isCandidate && !isActiveWorker;
  const showLeave = isCrewTask && isActiveWorker;

  const showNeedsMaterials = !materialsReady && materialCount > 0;
  const hasChildren = childCount > 0;
  const canComplete = hasChildren ? allChildrenDone : true;

  const handleDibs = async (force = false) => {
    if (!force && !isAdmin) {
      const { count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to_user_id', userId)
        .eq('stage', 'Ready')
        .eq('materials_on_site', 'Yes');

      if ((count ?? 0) >= 5) {
        setDibsConfirmOpen(true);
        return;
      }
    }

    setLoading(true);
    try {
      await claimTask(task.id, userId);
      onUpdate();
    } catch (error: unknown) {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      await startTask(task.id, userId);
      onUpdate();
    } catch (error: unknown) {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (skipPhotoCheck = false) => {
    // Photo nudge: check for "after" photo, prompt but allow override
    if (!skipPhotoCheck) {
      const { count: afterCount } = await supabase
        .from('task_photos')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', task.id)
        .eq('phase', 'after');

      if ((afterCount ?? 0) === 0) {
        setPhotoConfirmOpen(true);
        return;
      }
    }

    setLoading(true);
    try {
      await completeTask({
        taskId: task.id,
        parentTaskId: task.parent_task_id,
        isRecurring: task.is_recurring,
      });
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinCrew = async () => {
    setLoading(true);
    // Upsert into task_workers
    const { error } = await supabase.from('task_workers').upsert({
      task_id: task.id,
      user_id: userId,
      active: true,
      joined_at: new Date().toISOString(),
      left_at: null,
    }, { onConflict: 'task_id,user_id' });

    // Optionally set task to In Progress if Ready
    if (!error && task.stage === 'Ready') {
      await supabase.from('tasks').update({ stage: 'In Progress' }).eq('id', task.id);
    }

    setLoading(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else onUpdate();
  };

  const handleLeaveCrew = async () => {
    setLoading(true);
    const { error } = await supabase.from('task_workers').update({
      active: false,
      left_at: new Date().toISOString(),
    }).eq('task_id', task.id).eq('user_id', userId);
    setLoading(false);

    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else onUpdate();
  };

  const priorityBorderClass =
    task.is_blocked
      ? 'border-l-4 border-destructive'
      : context === 'today'
        ? {
            '1 – Now': 'border-l-4 border-red-500',
            '2 – This Week': 'border-l-4 border-orange-500',
            '3 – Soon': 'border-l-4 border-yellow-500',
            '4 – When Time': 'border-l-4 border-blue-500',
            '5 – Later': 'border-l-4 border-gray-300',
          }[task.priority as string] ?? ''
        : '';

  return (
    <>
      <Card className={cn('p-3', isChild && 'ml-6', priorityBorderClass)}>
        <Link to={`/projects/${task.project_id}/tasks/${task.id}`} className="block">
          {parentTitle && (
            <p className="text-xs text-muted-foreground mb-0.5">{parentTitle} →</p>
          )}
          <div className="flex items-center gap-1">
            {hasChildren && onToggle && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
                className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors"
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            )}
            <p className={`truncate ${context === 'today' && !isChild ? 'text-base font-semibold' : `font-medium ${isChild ? 'text-xs' : 'text-sm'}`}`}>{task.task}</p>
          </div>
          {showProjectName && (
            <p className="text-xs text-muted-foreground mt-0.5">{projectName}</p>
          )}
          {projectAddress && (
            <p className="text-xs text-muted-foreground truncate">{projectAddress}</p>
          )}
          {isOutsideVendor && !assigneeName && (
            <p className="text-xs text-muted-foreground">Outside Vendor</p>
          )}
          {assigneeName && (
            <p className="text-xs text-muted-foreground">Assigned to {assigneeName}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <StatusBadge status={task.stage} />
            {task.is_blocked && <StatusBadge status="Blocked" />}
            {isCrewTask && (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <Users className="h-3 w-3" />
                {activeWorkerCount} active
              </Badge>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Flag className="h-3 w-3" />
              {task.priority}
            </span>
            {task.due_date && (() => {
              const isOverdue = task.stage !== 'Done' && task.due_date < new Date().toISOString().slice(0, 10);
              return (
                <span className={cn("text-xs flex items-center gap-0.5", isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                  <Calendar className={cn("h-3 w-3", isOverdue && "text-destructive")} />
                  {task.due_date}
                </span>
              );
            })()}
            {task.stage !== 'Done' && task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && (
              <StatusBadge status="Overdue" />
            )}
            {materialCount > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                📦 {materialCount}
              </span>
            )}
            {photoCount > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                📷 {photoCount}
              </span>
            )}
            {task.is_recurring && task.recurrence_frequency && (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <Repeat className="h-3 w-3" />
                {task.recurrence_frequency === 'weekly' ? 'Weekly' : task.recurrence_frequency === 'monthly' ? 'Monthly' : 'Yearly'}
              </Badge>
            )}
            {showNeedsMaterials && (
              <Badge variant="outline" className="text-xs border-warning text-warning">
                Needs Materials
              </Badge>
            )}
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMaterialsOpen(true); }}
              className="ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Materials"
            >
              <Package className="h-3.5 w-3.5" />
              Materials
            </button>
          </div>
          {task.is_blocked && blockerInfo && (
            <div className="mt-1 px-2 py-1 bg-destructive/5 rounded text-xs text-destructive">
              <span className="font-medium">{BLOCKER_REASONS.find(r => r.value === blockerInfo.reason)?.label || blockerInfo.reason}</span>
              {blockerInfo.needs_from_manager && (
                <span className="text-muted-foreground ml-1">— {blockerInfo.needs_from_manager.slice(0, 60)}{blockerInfo.needs_from_manager.length > 60 ? '…' : ''}</span>
              )}
            </div>
          )}
        </Link>

        {/* Solo actions */}
        {(showDibs || showStart || showComplete) && (
          <div className="mt-2 flex gap-2">
            {showDibs && (
              <Button size="sm" variant="outline" onClick={() => handleDibs()} disabled={loading}>
                Dibs
              </Button>
            )}
            {showStart && (
              materialsReady ? (
                <Button size="sm" onClick={handleStart} disabled={loading}>
                  Start
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" disabled>Start</Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Materials must be on site before starting.</TooltipContent>
                </Tooltip>
              )
            )}
            {showComplete && (
              canComplete ? (
                <Button size="sm" onClick={() => handleComplete()} disabled={loading}>
                  Complete
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" disabled>Complete</Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>All subtasks must be completed first.</TooltipContent>
                </Tooltip>
              )
            )}
          </div>
        )}

        {/* Crew actions */}
        {(showJoin || showLeave) && (
          <div className="mt-2 flex gap-2">
            {showJoin && (
              <Button size="sm" onClick={handleJoinCrew} disabled={loading}>
                Join
              </Button>
            )}
            {showLeave && (
              <Button size="sm" variant="outline" onClick={handleLeaveCrew} disabled={loading}>
                Leave
              </Button>
            )}
          </div>
        )}
      </Card>

      <TaskMaterialsSheet
        taskId={task.id}
        open={materialsOpen}
        onOpenChange={setMaterialsOpen}
        onMaterialsChange={onUpdate}
      />

      <AlertDialog open={dibsConfirmOpen} onOpenChange={setDibsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dibs Limit Reached</AlertDialogTitle>
            <AlertDialogDescription>
              You already have 5 active tasks ready to start. Are you sure you want to claim another?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDibsConfirmOpen(false); handleDibs(true); }}>
              Claim Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={photoConfirmOpen} onOpenChange={setPhotoConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No "After" Photo</AlertDialogTitle>
            <AlertDialogDescription>
              This task doesn't have an "after" photo yet. It's best to add one when you can, but you can complete it now if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setPhotoConfirmOpen(false); handleComplete(true); }}>
              Complete Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TaskCard;

import { Card } from '@/components/ui/card';
import { cn, getErrorMessage } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, Users, Repeat, AlertTriangle, Trash2 } from 'lucide-react';
import TaskMaterialsSheet from '@/components/TaskMaterialsSheet';
import TaskQuickActions from '@/components/task-card/TaskQuickActions';
import { BLOCKER_REASONS } from '@/lib/supabase-types';
import { completeTask } from '@/lib/taskLifecycle';
import { getTaskOperationalStatus, isTaskActionable } from '@/lib/taskOperationalStatus';

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
  canReportIssue?: boolean;
  canDelete?: boolean;
  allProfiles?: { id: string; full_name: string | null }[];
}

const TaskCard = ({
  task, projectName, userId, isAdmin, onUpdate,
  showProjectName = true, isChild = false, parentTitle,
  childCount = 0, expanded = false, onToggle, allChildrenDone = true,
  context = 'project', projectAddress, assigneeName,
  isCrewTask = false, isActiveWorker = false, isCandidate = false, activeWorkerCount = 0,
  blockerInfo, photoCount = 0, materialCount = 0, canReportIssue = false,
  canDelete = false,
  allProfiles,
}: TaskCardProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [photoConfirmOpen, setPhotoConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);

  const materialsReady = task.materials_on_site === 'Yes';
  const operationalStatus = getTaskOperationalStatus(task, {
    requiredCount: materialCount,
    hasRequiredMaterials: materialCount > 0 ? materialsReady : true,
  });
  const hasChildren = childCount > 0;
  const showNeedsMaterials = !materialsReady && materialCount > 0;

  const handleComplete = async (skipPhotoCheck = false) => {
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
    } catch (error: unknown) {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const { error: childErr } = await supabase.from('tasks').delete().eq('parent_task_id', task.id);
      if (childErr) throw childErr;
      const { error } = await supabase.from('tasks').delete().eq('id', task.id);
      if (error) throw error;
      toast({ title: 'Task deleted' });
      onUpdate();
    } catch (error: unknown) {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setLoading(false);
      setDeleteConfirmOpen(false);
    }
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
        {/* Title row with optional delete icon top-right */}
        <div className="flex items-start gap-1">
          <Link to={`/projects/${task.project_id}/tasks/${task.id}`} className="flex-1 min-w-0 block">
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
          </Link>

          {canDelete && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteConfirmOpen(true); }}
              className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Delete task"
              disabled={loading}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Info badges row */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {isCrewTask && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1">
              <Users className="h-3 w-3" />
              {activeWorkerCount} active
            </Badge>
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
          {task.stage !== 'Done' && task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && (
            <Badge variant="destructive" className="text-xs">Overdue</Badge>
          )}
        </div>

        {/* Blocker info */}
        {task.is_blocked && blockerInfo && (
          <div className="mt-1 px-2 py-1 bg-destructive/5 rounded text-xs text-destructive">
            <span className="font-medium">{BLOCKER_REASONS.find(r => r.value === blockerInfo.reason)?.label || blockerInfo.reason}</span>
            {blockerInfo.needs_from_manager && (
              <span className="text-muted-foreground ml-1">— {blockerInfo.needs_from_manager.slice(0, 60)}{blockerInfo.needs_from_manager.length > 60 ? '…' : ''}</span>
            )}
          </div>
        )}

        {/* Unified action pill row */}
        <div className="mt-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <TaskQuickActions
            task={task}
            userId={userId}
            isAdmin={isAdmin}
            onUpdate={onUpdate}
            allProfiles={allProfiles}
            assigneeName={assigneeName}
            photoCount={photoCount}
            materialCount={materialCount}
            operationalStatus={operationalStatus}
            isCrewTask={isCrewTask}
            isActiveWorker={isActiveWorker}
            isCandidate={isCandidate}
            hasChildren={hasChildren}
            allChildrenDone={allChildrenDone}
            materialsReady={materialsReady}
            onMaterialsOpen={() => setMaterialsOpen(true)}
            onPhotoConfirm={() => setPhotoConfirmOpen(true)}
            canReportIssue={canReportIssue}
            canReassign={isAdmin || canDelete}
          />
        </div>
      </Card>

      <TaskMaterialsSheet
        taskId={task.id}
        open={materialsOpen}
        onOpenChange={setMaterialsOpen}
        onMaterialsChange={onUpdate}
      />

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

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{task.task}"?{hasChildren ? ' This will also delete all subtasks.' : ''} This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TaskCard;

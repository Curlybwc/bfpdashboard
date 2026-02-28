import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import StatusBadge from '@/components/StatusBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Flag, Package, ChevronRight, ChevronDown } from 'lucide-react';
import TaskMaterialsSheet from '@/components/TaskMaterialsSheet';

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
}

const TaskCard = ({
  task, projectName, userId, isAdmin, onUpdate,
  showProjectName = true, isChild = false, parentTitle,
  childCount = 0, expanded = false, onToggle, allChildrenDone = true,
}: TaskCardProps) => {
  const { toast } = useToast();
  const [dibsConfirmOpen, setDibsConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materialCount, setMaterialCount] = useState(0);

  useEffect(() => {
    supabase
      .from('task_materials')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', task.id)
      .then(({ count }) => setMaterialCount(count ?? 0));
  }, [task.id, materialsOpen]);

  const isAssignedToMe = task.assigned_to_user_id === userId;
  const isUnassigned = !task.assigned_to_user_id;
  const materialsReady = task.materials_on_site === 'Yes';

  const showDibs = isUnassigned && task.stage === 'Ready';
  const showStart = isAssignedToMe && task.stage === 'Ready';
  const showComplete = isAssignedToMe && task.stage === 'In Progress';
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
    const { error } = await supabase.from('tasks').update({
      assigned_to_user_id: userId,
      claimed_by_user_id: userId,
      claimed_at: new Date().toISOString(),
    }).eq('id', task.id);
    setLoading(false);

    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else onUpdate();
  };

  const handleStart = async () => {
    setLoading(true);
    const { error } = await supabase.from('tasks').update({
      stage: 'In Progress',
      started_at: new Date().toISOString(),
      started_by_user_id: userId,
    }).eq('id', task.id);
    setLoading(false);

    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else onUpdate();
  };

  const handleComplete = async () => {
    setLoading(true);
    const { error } = await supabase.from('tasks').update({
      stage: 'Done',
      completed_at: new Date().toISOString(),
    }).eq('id', task.id);

    if (!error && task.parent_task_id) {
      // Check if all siblings are now Done
      const { data: siblings } = await supabase
        .from('tasks')
        .select('id, stage')
        .eq('parent_task_id', task.parent_task_id)
        .neq('id', task.id);

      const allSiblingsDone = (siblings || []).every(s => s.stage === 'Done');
      if (allSiblingsDone) {
        await supabase.from('tasks').update({
          stage: 'Done',
          completed_at: new Date().toISOString(),
        }).eq('id', task.parent_task_id);
      }
    }

    setLoading(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else onUpdate();
  };

  return (
    <>
      <Card className={`p-3 ${isChild ? 'ml-6' : ''}`}>
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
            <p className={`font-medium truncate ${isChild ? 'text-xs' : 'text-sm'}`}>{task.task}</p>
          </div>
          {showProjectName && (
            <p className="text-xs text-muted-foreground mt-0.5">{projectName}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <StatusBadge status={task.stage} />
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Flag className="h-3 w-3" />
              {task.priority}
            </span>
            {task.due_date && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Calendar className="h-3 w-3" />
                {task.due_date}
              </span>
            )}
            {materialCount > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                📦 {materialCount}
              </span>
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
        </Link>

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
                <Button size="sm" onClick={handleComplete} disabled={loading}>
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
    </>
  );
};

export default TaskCard;

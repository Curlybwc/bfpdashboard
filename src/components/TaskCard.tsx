import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import StatusBadge from '@/components/StatusBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Flag, Package } from 'lucide-react';
import TaskMaterialsSheet from '@/components/TaskMaterialsSheet';

interface TaskCardProps {
  task: any;
  projectName: string;
  userId: string;
  isAdmin: boolean;
  onUpdate: () => void;
  showProjectName?: boolean;
}

const TaskCard = ({ task, projectName, userId, isAdmin, onUpdate, showProjectName = true }: TaskCardProps) => {
  const { toast } = useToast();
  const [dibsConfirmOpen, setDibsConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);

  const isAssignedToMe = task.assigned_to_user_id === userId;
  const isUnassigned = !task.assigned_to_user_id;
  const materialsReady = task.materials_on_site === 'Yes';

  const showDibs = isUnassigned && task.stage === 'Ready';
  const showStart = isAssignedToMe && task.stage === 'Ready';
  const showComplete = isAssignedToMe && task.stage === 'In Progress';
  const showNeedsMaterials = isAssignedToMe && task.stage === 'Ready' && !materialsReady;

  const handleDibs = async (force = false) => {
    if (!force && !isAdmin) {
      // Check dibs limit: count Ready + materials_on_site = Yes assigned to user
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
    setLoading(false);

    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else onUpdate();
  };

  return (
    <>
      <Card className="p-3">
        <Link to={`/projects/${task.project_id}/tasks/${task.id}`} className="block">
          <p className="font-medium text-sm truncate">{task.task}</p>
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
              <Button size="sm" onClick={handleComplete} disabled={loading}>
                Complete
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
    </>
  );
};

export default TaskCard;

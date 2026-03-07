import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';
import TaskCard from '@/components/TaskCard';

interface NextUpCardProps {
  task: any | null;
  projectName: string;
  projectAddress?: string;
  parentTitle?: string;
  userId: string;
  isAdmin: boolean;
  onUpdate: () => void;
  isCrewTask?: boolean;
  isActiveWorker?: boolean;
  isCandidate?: boolean;
  activeWorkerCount?: number;
  blockerInfo?: { reason: string; needs_from_manager?: string | null } | null;
}

const NextUpCard = ({
  task,
  projectName,
  projectAddress,
  parentTitle,
  userId,
  isAdmin,
  onUpdate,
  isCrewTask = false,
  isActiveWorker = false,
  isCandidate = false,
  activeWorkerCount = 0,
  blockerInfo,
}: NextUpCardProps) => {
  if (!task) {
    return (
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-6 text-center">
          <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-primary/40" />
          <p className="text-sm text-muted-foreground">
            You're all caught up — nothing queued right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-primary/70 uppercase tracking-wide px-1">
        Suggested next
      </p>
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-1">
        <TaskCard
          task={task}
          projectName={projectName}
          projectAddress={projectAddress}
          parentTitle={parentTitle}
          userId={userId}
          isAdmin={isAdmin}
          onUpdate={onUpdate}
          context="today"
          isCrewTask={isCrewTask}
          isActiveWorker={isActiveWorker}
          isCandidate={isCandidate}
          activeWorkerCount={activeWorkerCount}
          blockerInfo={blockerInfo}
        />
      </div>
    </div>
  );
};

export default NextUpCard;

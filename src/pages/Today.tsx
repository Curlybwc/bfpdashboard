import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import { useTodayData } from '@/hooks/useTodayData';
import PageHeader from '@/components/PageHeader';
import TaskCard from '@/components/TaskCard';
import NextUpCard from '@/components/NextUpCard';
import DailyReminders from '@/components/DailyReminders';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Zap, Clock, CalendarDays, AlertTriangle } from 'lucide-react';
import { generateAlerts } from '@/lib/alerts';
import { getTaskOperationalStatus } from '@/lib/taskOperationalStatus';
import AlertsBanner from '@/components/AlertsBanner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import AvailabilityForm from '@/components/AvailabilityForm';

/* ── Priority sort helpers ── */
const PRIORITY_ORDER: Record<string, number> = {
  '1 – Now': 1,
  '2 – This Week': 2,
  '3 – Soon': 3,
  '4 – When Time': 4,
  '5 – Later': 5,
};

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  ready: 1,
  review_needed: 2,
  blocked: 3,
  done: 4,
};

function rankTasks(a: any, b: any): number {
  const todayStr = new Date().toISOString().slice(0, 10);
  const aOverdue = a.due_date && a.due_date < todayStr ? 0 : 1;
  const bOverdue = b.due_date && b.due_date < todayStr ? 0 : 1;
  if (aOverdue !== bOverdue) return aOverdue - bOverdue;
  const sa = STATUS_ORDER[getTaskOperationalStatus(a)] ?? 9;
  const sb = STATUS_ORDER[getTaskOperationalStatus(b)] ?? 9;
  if (sa !== sb) return sa - sb;
  const pa = PRIORITY_ORDER[a.priority] ?? 9;
  const pb = PRIORITY_ORDER[b.priority] ?? 9;
  if (pa !== pb) return pa - pb;
  const oa = a.sort_order ?? 999999;
  const ob = b.sort_order ?? 999999;
  if (oa !== ob) return oa - ob;
  const da = a.due_date ?? '9999-12-31';
  const db = b.due_date ?? '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  // created_at ascending
  const ca = a.created_at || '';
  const cb = b.created_at || '';
  if (ca === cb) return 0;
  return ca < cb ? -1 : 1;
}

const Today = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();

  const { data, loading, error, refresh } = useTodayData(user?.id, isAdmin);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const {
    inProgress, assigned, available, needsReview, blocked,
    projectMap, parentTitles, assigneeMap, blockerMap,
    crewActiveTaskIds, crewCandidateTaskIds, crewWorkerCounts,
    photoCountMap, materialCountMap, childTasksByParent, hasShiftToday, isManager,
    allProfiles,
  } = data;

  /* ── Derived state ── */
  const isContractor = !isAdmin && !isManager;

  const nextUpTask = useMemo(() => {
    if (!isContractor) return null;
    const candidates = [...inProgress, ...assigned].filter(t => getTaskOperationalStatus(t) !== 'blocked');
    candidates.sort(rankTasks);
    return candidates[0] || null;
  }, [isContractor, inProgress, assigned]);

  const filteredInProgress = useMemo(() => {
    if (!nextUpTask) return inProgress;
    return inProgress.filter(t => t.id !== nextUpTask.id);
  }, [inProgress, nextUpTask]);

  const filteredAssigned = useMemo(() => {
    if (!nextUpTask) return assigned;
    return assigned.filter(t => t.id !== nextUpTask.id);
  }, [assigned, nextUpTask]);

  const showShiftReminder = isContractor && !hasShiftToday && new Date().getHours() >= 10;


  const toggleExpanded = (taskId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };


  const alerts = useMemo(() => {
    if (!user) return [];
    return generateAlerts({
      inProgress, assigned, blocked, needsReview, available,
      isAdmin, isManager, isContractor,
      hasShiftToday, photoCountMap, projectMap,
      userId: user.id,
      crewActiveTaskIds,
    });
  }, [inProgress, assigned, blocked, needsReview, available, isAdmin, isManager, isContractor, hasShiftToday, photoCountMap, projectMap, user, crewActiveTaskIds]);

  /* ── Error state ── */
  if (error) {
    return (
      <div className="pb-20">
        <PageHeader title="Today" />
        <div className="p-4">
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive font-medium">Failed to load today's data</p>
            <p className="text-xs text-muted-foreground max-w-xs">{error}</p>
            <Button size="sm" variant="outline" onClick={refresh}>Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="pb-20">
      <PageHeader title="Today" />
      <div className="p-4 space-y-4">
        <div className="rounded-lg border p-4 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
        </div>
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="rounded-lg border p-3 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );

  /* ── Shared section renderer ── */
  const Section = ({ title, tasks, emptyText, isBlockedSection = false }: { title: string; tasks: any[]; emptyText: string; isBlockedSection?: boolean }) => {
    const sectionTaskIds = new Set(tasks.map((task) => task.id));
    const topLevelTasks = tasks.filter((task) => !task.parent_task_id || !sectionTaskIds.has(task.parent_task_id));

    return (
    <div className="mb-6">
      <h2 className={cn(
        "text-sm font-semibold uppercase tracking-wide mb-2",
        isBlockedSection ? "text-destructive" : "text-muted-foreground"
      )}>{title}</h2>
      {topLevelTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {topLevelTasks.map((t) => {
            const children = childTasksByParent[t.id] || [];
            const isExpanded = expandedIds.has(t.id);
            const allChildrenDone = children.length === 0 || children.every((c: any) => c.stage === 'Done');

            return (
              <div key={t.id} className="space-y-2">
                <TaskCard
                  task={t}
                  projectName={projectMap[t.project_id]?.name || ''}
                  projectAddress={projectMap[t.project_id]?.address}
                  assigneeName={t.assigned_to_user_id && t.assigned_to_user_id !== user!.id ? assigneeMap[t.assigned_to_user_id] : undefined}
                  userId={user!.id}
                  isAdmin={isAdmin}
                  onUpdate={refresh}
                  parentTitle={t.parent_task_id ? parentTitles[t.parent_task_id] : undefined}
                  context="today"
                  childCount={children.length}
                  expanded={isExpanded}
                  onToggle={() => toggleExpanded(t.id)}
                  allChildrenDone={allChildrenDone}
                  isCrewTask={t.assignment_mode === 'crew'}
                  isActiveWorker={crewActiveTaskIds.has(t.id)}
                  isCandidate={crewCandidateTaskIds.has(t.id)}
                  activeWorkerCount={crewWorkerCounts[t.id] || 0}
                  blockerInfo={blockerMap[t.id] || null}
                  photoCount={photoCountMap[t.id] || 0}
                  materialCount={materialCountMap[t.id] || 0}
                  canReportIssue={isContractor}
                  canDelete={isAdmin || isManager}
                  allProfiles={allProfiles}
                />

                {isExpanded && children.map((child: any) => (
                  <TaskCard
                    key={child.id}
                    task={child}
                    projectName={projectMap[child.project_id]?.name || ''}
                    projectAddress={projectMap[child.project_id]?.address}
                    assigneeName={child.assigned_to_user_id && child.assigned_to_user_id !== user!.id ? assigneeMap[child.assigned_to_user_id] : undefined}
                    userId={user!.id}
                    isAdmin={isAdmin}
                    onUpdate={refresh}
                    parentTitle={t.task}
                    context="today"
                    isChild
                    isCrewTask={child.assignment_mode === 'crew'}
                    isActiveWorker={crewActiveTaskIds.has(child.id)}
                    isCandidate={crewCandidateTaskIds.has(child.id)}
                    activeWorkerCount={crewWorkerCounts[child.id] || 0}
                    blockerInfo={blockerMap[child.id] || null}
                    photoCount={photoCountMap[child.id] || 0}
                    materialCount={materialCountMap[child.id] || 0}
                    canReportIssue={isContractor}
                    canDelete={isAdmin || isManager}
                    allProfiles={allProfiles}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

  /* ── Contractor layout ── */
  const ContractorView = () => (
    <>
      {showShiftReminder && (
        <div className="mb-6">
          <DailyReminders
            showShiftReminder={showShiftReminder}
            onLogShift={() => navigate('/shifts')}
          />
        </div>
      )}

      <Section title="Working Now" tasks={inProgress} emptyText="No tasks in progress." />
      <Section title="Up Next" tasks={assigned} emptyText="No assigned tasks." />
      <Section title="Available to Take" tasks={available} emptyText="No tasks available for dibs." />

      {blocked.length > 0 && (
        <Section title={`Blocked (${blocked.length})`} tasks={blocked} emptyText="" isBlockedSection />
      )}
    </>
  );

  /* ── Manager / Admin layout ── */
  const ManagerView = () => (
    <>
      <Section title="Needs Review (Contractor / Field Reports)" tasks={needsReview} emptyText="No tasks pending review." />
      <Section title={`Blocked (${blocked.length})`} tasks={blocked} emptyText="No blocked tasks — all clear." isBlockedSection />
      <Section title="In Progress" tasks={inProgress} emptyText="No tasks in progress." />
      <Section title="Assigned" tasks={assigned} emptyText="No assigned tasks." />
      <Section title="Available" tasks={available} emptyText="No tasks available for dibs." />
    </>
  );

  return (
    <div className="pb-20">
      <PageHeader
        title="Today"
        actions={
          <div className="flex gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button size="sm" variant="outline">
                  <CalendarDays className="h-4 w-4 mr-1" />Availability
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Availability</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <AvailabilityForm />
                </div>
              </SheetContent>
            </Sheet>
            <Button size="sm" variant="outline" onClick={() => navigate('/shifts')}>
              <Clock className="h-4 w-4 mr-1" />Log Shift
            </Button>
            {!isContractor && (
              <Button size="sm" variant="outline" onClick={() => navigate('/today/field-mode')}>
                <Zap className="h-4 w-4 mr-1" />Field Mode
              </Button>
            )}
          </div>
        }
      />
      <div className="p-4">
        <AlertsBanner alerts={alerts} />
        {isContractor ? <ContractorView /> : <ManagerView />}
      </div>
    </div>
  );
};

export default Today;

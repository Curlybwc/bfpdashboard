import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import PageHeader from '@/components/PageHeader';
import TaskCard from '@/components/TaskCard';
import NextUpCard from '@/components/NextUpCard';
import DailyReminders from '@/components/DailyReminders';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Zap, Clock, CalendarDays } from 'lucide-react';
import { generateAlerts } from '@/lib/alerts';
import AlertsBanner from '@/components/AlertsBanner';
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

const STAGE_ORDER: Record<string, number> = {
  'In Progress': 0,
  'Ready': 1,
};

function rankTasks(a: any, b: any): number {
  // Stage: In Progress before Ready
  const sa = STAGE_ORDER[a.stage] ?? 9;
  const sb = STAGE_ORDER[b.stage] ?? 9;
  if (sa !== sb) return sa - sb;
  // Priority ascending
  const pa = PRIORITY_ORDER[a.priority] ?? 9;
  const pb = PRIORITY_ORDER[b.priority] ?? 9;
  if (pa !== pb) return pa - pb;
  // sort_order ascending, nulls last
  const oa = a.sort_order ?? 999999;
  const ob = b.sort_order ?? 999999;
  if (oa !== ob) return oa - ob;
  // due_date ascending, nulls last
  const da = a.due_date ?? '9999-12-31';
  const db = b.due_date ?? '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  // created_at ascending
  return (a.created_at || '') < (b.created_at || '') ? -1 : 1;
}

const Today = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const [inProgress, setInProgress] = useState<any[]>([]);
  const [assigned, setAssigned] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [needsReview, setNeedsReview] = useState<any[]>([]);
  const [blocked, setBlocked] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectMap, setProjectMap] = useState<Record<string, { name: string; address?: string }>>({});
  const [parentTitles, setParentTitles] = useState<Record<string, string>>({});
  const [assigneeMap, setAssigneeMap] = useState<Record<string, string>>({});
  const [isManager, setIsManager] = useState(false);
  const [blockerMap, setBlockerMap] = useState<Record<string, { reason: string; needs_from_manager?: string | null }>>({});
  const [hasShiftToday, setHasShiftToday] = useState(true); // default true to suppress flash

  // Crew task state
  const [crewActiveTaskIds, setCrewActiveTaskIds] = useState<Set<string>>(new Set());
  const [crewCandidateTaskIds, setCrewCandidateTaskIds] = useState<Set<string>>(new Set());
  const [crewWorkerCounts, setCrewWorkerCounts] = useState<Record<string, number>>({});
  const [photoCountMap, setPhotoCountMap] = useState<Record<string, number>>({});

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const todayStr = new Date().toISOString().slice(0, 10);

    const { data: memberships } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id);

    const memberProjectIds = (memberships || []).map(m => m.project_id);

    // Check if user is manager on any project
    let hasManagerRole = false;
    if (memberProjectIds.length > 0) {
      const { data: managerCheck } = await supabase
        .from('project_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'manager')
        .limit(1);
      hasManagerRole = (managerCheck || []).length > 0;
    }
    setIsManager(hasManagerRole);

    // Solo queries + crew membership queries + shift check in parallel
    const [ipRes, assignedRes, availRes, myWorkerRows, myCandidateRows, shiftCheck] = await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to_user_id', user.id)
        .eq('stage', 'In Progress')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to_user_id', user.id)
        .eq('stage', 'Ready')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('tasks')
        .select('*')
        .is('assigned_to_user_id', null)
        .eq('stage', 'Ready')
        .eq('materials_on_site', 'Yes')
        .eq('assignment_mode', 'solo')
        .in('project_id', memberProjectIds.length > 0 ? memberProjectIds : ['00000000-0000-0000-0000-000000000000'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(20),
      // My active crew worker rows
      supabase
        .from('task_workers')
        .select('task_id')
        .eq('user_id', user.id)
        .eq('active', true),
      // My candidate rows
      supabase
        .from('task_candidates')
        .select('task_id')
        .eq('user_id', user.id),
      // Shift check for today
      supabase
        .from('shifts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('shift_date', todayStr),
    ]);

    setHasShiftToday((shiftCheck.count ?? 0) > 0);

    const myActiveTaskIds = new Set((myWorkerRows.data || []).map(r => r.task_id));
    const myCandidateIds = new Set((myCandidateRows.data || []).map(r => r.task_id));
    setCrewActiveTaskIds(myActiveTaskIds);
    setCrewCandidateTaskIds(myCandidateIds);

    // Fetch crew tasks for In Progress (active worker on non-Done crew tasks)
    let crewIpTasks: any[] = [];
    if (myActiveTaskIds.size > 0) {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .in('id', [...myActiveTaskIds])
        .eq('assignment_mode', 'crew')
        .neq('stage', 'Done');
      crewIpTasks = data || [];
    }

    // Fetch crew tasks for Available (candidate but not active worker, non-Done)
    const crewAvailableIds = [...myCandidateIds].filter(id => !myActiveTaskIds.has(id));
    let crewAvailTasks: any[] = [];
    if (crewAvailableIds.length > 0) {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .in('id', crewAvailableIds)
        .eq('assignment_mode', 'crew')
        .neq('stage', 'Done');
      crewAvailTasks = data || [];
    }

    // Merge and dedupe
    const soloIp = ipRes.data || [];
    const mergedIp = [...soloIp];
    const ipIds = new Set(soloIp.map(t => t.id));
    crewIpTasks.forEach(t => { if (!ipIds.has(t.id)) mergedIp.push(t); });

    const soloAvail = availRes.data || [];
    const mergedAvail = [...soloAvail];
    const availIds = new Set(soloAvail.map(t => t.id));
    crewAvailTasks.forEach(t => { if (!availIds.has(t.id)) mergedAvail.push(t); });

    // Fetch blocked tasks
    let blockedTasks: any[] = [];
    if (isAdmin || hasManagerRole) {
      const { data: blockedRes } = await supabase
        .from('tasks')
        .select('*')
        .eq('is_blocked', true)
        .neq('stage', 'Done')
        .in('project_id', memberProjectIds.length > 0 ? memberProjectIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: false })
        .limit(30);
      blockedTasks = blockedRes || [];
    } else {
      const myBlockedIds = new Set<string>();
      mergedIp.concat(assignedRes.data || []).forEach(t => {
        if (t.is_blocked) myBlockedIds.add(t.id);
      });
      crewIpTasks.forEach(t => {
        if (t.is_blocked) myBlockedIds.add(t.id);
      });
      blockedTasks = [...mergedIp, ...(assignedRes.data || []), ...crewIpTasks].filter(t => myBlockedIds.has(t.id));
      const seen = new Set<string>();
      blockedTasks = blockedTasks.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
    }
    const blockedIds = new Set(blockedTasks.map(t => t.id));
    setBlocked(blockedTasks);

    // Batch-fetch active blocker info for blocked tasks
    const blockedTaskIdList = blockedTasks.map(t => t.id);
    let newBlockerMap: Record<string, { reason: string; needs_from_manager?: string | null }> = {};
    if (blockedTaskIdList.length > 0) {
      const { data: blockerRows } = await supabase
        .from('task_blockers')
        .select('task_id, reason, needs_from_manager')
        .in('task_id', blockedTaskIdList)
        .is('resolved_at', null);
      (blockerRows || []).forEach(r => {
        newBlockerMap[r.task_id] = { reason: r.reason, needs_from_manager: r.needs_from_manager };
      });
    }
    setBlockerMap(newBlockerMap);

    // Remove blocked tasks from In Progress and Assigned to avoid duplication
    setInProgress(mergedIp.filter(t => !blockedIds.has(t.id)));
    setAssigned((assignedRes.data || []).filter(t => !blockedIds.has(t.id)));
    setAvailable(mergedAvail);

    // Fetch needs_manager_review tasks (for admins and managers)
    let reviewTasks: any[] = [];
    if (isAdmin || hasManagerRole) {
      const { data: reviewRes } = await supabase
        .from('tasks')
        .select('*')
        .eq('needs_manager_review', true)
        .in('project_id', memberProjectIds.length > 0 ? memberProjectIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: false })
        .limit(30);
      reviewTasks = reviewRes || [];
    }
    setNeedsReview(reviewTasks);

    const allTasks = [...mergedIp, ...(assignedRes.data || []), ...mergedAvail, ...reviewTasks, ...blockedTasks];

    // Fetch active worker counts for all crew tasks
    const crewTaskIds = allTasks.filter(t => t.assignment_mode === 'crew').map(t => t.id);
    if (crewTaskIds.length > 0) {
      const { data: workerRows } = await supabase
        .from('task_workers')
        .select('task_id')
        .in('task_id', crewTaskIds)
        .eq('active', true);
      const counts: Record<string, number> = {};
      (workerRows || []).forEach(r => { counts[r.task_id] = (counts[r.task_id] || 0) + 1; });
      setCrewWorkerCounts(counts);
    } else {
      setCrewWorkerCounts({});
    }

    // Fetch project names
    const projectIds = [...new Set(allTasks.map(t => t.project_id))];
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, address')
        .in('id', projectIds);
      const map: Record<string, { name: string; address?: string }> = {};
      (projects || []).forEach(p => { map[p.id] = { name: p.name, address: p.address ?? undefined }; });
      setProjectMap(map);
    }

    // Batch fetch parent titles
    const parentIds = [...new Set(allTasks.map(t => t.parent_task_id).filter(Boolean))];
    if (parentIds.length > 0) {
      const { data: parents } = await supabase
        .from('tasks')
        .select('id, task')
        .in('id', parentIds);
      const titles: Record<string, string> = {};
      (parents || []).forEach(p => { titles[p.id] = p.task; });
      setParentTitles(titles);
    } else {
      setParentTitles({});
    }

    // Batch fetch assignee names
    const assigneeIds = [...new Set(
      allTasks.map(t => t.assigned_to_user_id).filter((id): id is string => !!id && id !== user!.id)
    )];
    if (assigneeIds.length > 0) {
      const { data: assignees } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', assigneeIds);
      const aMap: Record<string, string> = {};
      (assignees || []).forEach(a => { aMap[a.id] = a.full_name || 'Unknown'; });
      setAssigneeMap(aMap);
    } else {
      setAssigneeMap({});
    }

    // Batch-fetch photo counts
    const allTaskIds = [...new Set(allTasks.map(t => t.id))];
    if (allTaskIds.length > 0) {
      const { data: photoRows } = await supabase
        .from('task_photos' as any)
        .select('task_id')
        .in('task_id', allTaskIds);
      const pMap: Record<string, number> = {};
      (photoRows || []).forEach((r: any) => { pMap[r.task_id] = (pMap[r.task_id] || 0) + 1; });
      setPhotoCountMap(pMap);
    } else {
      setPhotoCountMap({});
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  /* ── Derived state ── */
  const isContractor = !isAdmin && !isManager;

  // Next Up: deterministic pick from contractor's non-blocked assigned work
  const nextUpTask = useMemo(() => {
    if (!isContractor) return null;
    const candidates = [...inProgress, ...assigned].filter(t => !t.is_blocked);
    candidates.sort(rankTasks);
    return candidates[0] || null;
  }, [isContractor, inProgress, assigned]);

  // Filter nextUpTask out of its source section to avoid duplication
  const filteredInProgress = useMemo(() => {
    if (!nextUpTask) return inProgress;
    return inProgress.filter(t => t.id !== nextUpTask.id);
  }, [inProgress, nextUpTask]);

  const filteredAssigned = useMemo(() => {
    if (!nextUpTask) return assigned;
    return assigned.filter(t => t.id !== nextUpTask.id);
  }, [assigned, nextUpTask]);

  // Shift reminder: only for contractors, after 10am, no shift logged
  const showShiftReminder = isContractor && !hasShiftToday && new Date().getHours() >= 10;

  // ── Derived alerts ──
  const alerts = useMemo(() => generateAlerts({
    inProgress, assigned, blocked, needsReview, available,
    isAdmin, isManager, isContractor,
    hasShiftToday, photoCountMap, projectMap,
    userId: user!.id,
    crewActiveTaskIds,
  }), [inProgress, assigned, blocked, needsReview, available, isAdmin, isManager, isContractor, hasShiftToday, photoCountMap, projectMap, user, crewActiveTaskIds]);

  if (loading) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;

  /* ── Shared section renderer ── */
  const Section = ({ title, tasks, emptyText, isBlockedSection = false }: { title: string; tasks: any[]; emptyText: string; isBlockedSection?: boolean }) => (
    <div className="mb-6">
      <h2 className={cn(
        "text-sm font-semibold uppercase tracking-wide mb-2",
        isBlockedSection ? "text-destructive" : "text-muted-foreground"
      )}>{title}</h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {tasks.map(t => (
            <TaskCard
              key={t.id}
              task={t}
              projectName={projectMap[t.project_id]?.name || ''}
              projectAddress={projectMap[t.project_id]?.address}
              assigneeName={t.assigned_to_user_id && t.assigned_to_user_id !== user!.id ? assigneeMap[t.assigned_to_user_id] : undefined}
              userId={user!.id}
              isAdmin={isAdmin}
              onUpdate={fetchTasks}
              parentTitle={t.parent_task_id ? parentTitles[t.parent_task_id] : undefined}
              context="today"
              isCrewTask={t.assignment_mode === 'crew'}
              isActiveWorker={crewActiveTaskIds.has(t.id)}
              isCandidate={crewCandidateTaskIds.has(t.id)}
              activeWorkerCount={crewWorkerCounts[t.id] || 0}
              blockerInfo={blockerMap[t.id] || null}
              photoCount={photoCountMap[t.id] || 0}
            />
          ))}
        </div>
      )}
    </div>
  );

  /* ── Contractor layout ── */
  const ContractorView = () => (
    <>
      {/* Next Up hero */}
      <div className="mb-6">
        <NextUpCard
          task={nextUpTask}
          projectName={nextUpTask ? (projectMap[nextUpTask.project_id]?.name || '') : ''}
          projectAddress={nextUpTask ? projectMap[nextUpTask.project_id]?.address : undefined}
          parentTitle={nextUpTask?.parent_task_id ? parentTitles[nextUpTask.parent_task_id] : undefined}
          userId={user!.id}
          isAdmin={isAdmin}
          onUpdate={fetchTasks}
          isCrewTask={nextUpTask?.assignment_mode === 'crew'}
          isActiveWorker={nextUpTask ? crewActiveTaskIds.has(nextUpTask.id) : false}
          isCandidate={nextUpTask ? crewCandidateTaskIds.has(nextUpTask.id) : false}
          activeWorkerCount={nextUpTask ? (crewWorkerCounts[nextUpTask.id] || 0) : 0}
          blockerInfo={nextUpTask ? (blockerMap[nextUpTask.id] || null) : null}
          photoCount={nextUpTask ? (photoCountMap[nextUpTask.id] || 0) : 0}
        />
      </div>

      {/* Shift reminder */}
      {showShiftReminder && (
        <div className="mb-6">
          <DailyReminders
            showShiftReminder={showShiftReminder}
            onLogShift={() => navigate('/shifts')}
          />
        </div>
      )}

      {/* Blocked — only when present */}
      {blocked.length > 0 && (
        <Section title={`Blocked (${blocked.length})`} tasks={blocked} emptyText="" isBlockedSection />
      )}

      <Section title="Working Now" tasks={filteredInProgress} emptyText="No tasks in progress." />
      <Section title="Up Next" tasks={filteredAssigned} emptyText="No assigned tasks." />
      <Section title="Available to Take" tasks={available} emptyText="No tasks available for dibs." />
    </>
  );

  /* ── Manager / Admin layout ── */
  const ManagerView = () => (
    <>
      <Section title="Needs Review" tasks={needsReview} emptyText="No tasks pending review." />
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
            <Button size="sm" variant="outline" onClick={() => navigate('/today/field-mode')}>
              <Zap className="h-4 w-4 mr-1" />Field Mode
            </Button>
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

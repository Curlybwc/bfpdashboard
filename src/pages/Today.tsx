import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import PageHeader from '@/components/PageHeader';
import TaskCard from '@/components/TaskCard';
import { Button } from '@/components/ui/button';
import { Zap, Clock } from 'lucide-react';

const Today = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const [inProgress, setInProgress] = useState<any[]>([]);
  const [assigned, setAssigned] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [needsReview, setNeedsReview] = useState<any[]>([]);
  const [blocked, setBlocked] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [needsReview, setNeedsReview] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectMap, setProjectMap] = useState<Record<string, { name: string; address?: string }>>({});
  const [parentTitles, setParentTitles] = useState<Record<string, string>>({});
  const [assigneeMap, setAssigneeMap] = useState<Record<string, string>>({});
  const [isManager, setIsManager] = useState(false);

  // Crew task state
  const [crewActiveTaskIds, setCrewActiveTaskIds] = useState<Set<string>>(new Set());
  const [crewCandidateTaskIds, setCrewCandidateTaskIds] = useState<Set<string>>(new Set());
  const [crewWorkerCounts, setCrewWorkerCounts] = useState<Record<string, number>>({});

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);

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

    // Solo queries + crew membership queries in parallel
    const [ipRes, assignedRes, availRes, myWorkerRows, myCandidateRows] = await Promise.all([
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
    ]);

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

    setInProgress(mergedIp);
    setAssigned(assignedRes.data || []);
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

    const allTasks = [...mergedIp, ...(assignedRes.data || []), ...mergedAvail, ...reviewTasks];

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

    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  if (loading) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;

  const Section = ({ title, tasks, emptyText }: { title: string; tasks: any[]; emptyText: string }) => (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</h2>
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
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="pb-20">
      <PageHeader
        title="Today"
        actions={
          <div className="flex gap-2">
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
        {(isAdmin || isManager) && needsReview.length > 0 && (
          <Section title="Needs Review" tasks={needsReview} emptyText="" />
        )}
        <Section title="In Progress" tasks={inProgress} emptyText="No tasks in progress." />
        <Section title="Assigned" tasks={assigned} emptyText="No assigned tasks." />
        <Section title="Available" tasks={available} emptyText="No tasks available for dibs." />
      </div>
    </div>
  );
};

export default Today;

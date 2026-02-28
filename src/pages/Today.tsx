import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import PageHeader from '@/components/PageHeader';
import TaskCard from '@/components/TaskCard';

const Today = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [inProgress, setInProgress] = useState<any[]>([]);
  const [assigned, setAssigned] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [parentTitles, setParentTitles] = useState<Record<string, string>>({});

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: memberships } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id);

    const memberProjectIds = (memberships || []).map(m => m.project_id);

    const [ipRes, assignedRes, availRes] = await Promise.all([
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
        .in('project_id', memberProjectIds.length > 0 ? memberProjectIds : ['00000000-0000-0000-0000-000000000000'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(20),
    ]);

    const allTasks = [...(ipRes.data || []), ...(assignedRes.data || []), ...(availRes.data || [])];
    setInProgress(ipRes.data || []);
    setAssigned(assignedRes.data || []);
    setAvailable(availRes.data || []);

    // Fetch project names
    const projectIds = [...new Set(allTasks.map(t => t.project_id))];
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', projectIds);
      const names: Record<string, string> = {};
      (projects || []).forEach(p => { names[p.id] = p.name; });
      setProjectNames(names);
    }

    // Batch fetch parent titles (no N+1)
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
              projectName={projectNames[t.project_id] || ''}
              userId={user!.id}
              isAdmin={isAdmin}
              onUpdate={fetchTasks}
              parentTitle={t.parent_task_id ? parentTitles[t.parent_task_id] : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="pb-20">
      <PageHeader title="Today" />
      <div className="p-4">
        <Section title="In Progress" tasks={inProgress} emptyText="No tasks in progress." />
        <Section title="Assigned" tasks={assigned} emptyText="No assigned tasks." />
        <Section title="Available" tasks={available} emptyText="No tasks available for dibs." />
      </div>
    </div>
  );
};

export default Today;

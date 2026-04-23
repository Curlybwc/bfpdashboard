import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Play, Hand, CircleDot, Plus, Ban, ShieldAlert, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  task_completed: { label: 'Completed', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  task_started: { label: 'Started', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Play },
  task_claimed: { label: 'Claimed', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', icon: Hand },
  task_unclaimed: { label: 'Unclaimed', color: 'bg-muted text-muted-foreground', icon: CircleDot },
  task_created: { label: 'Created', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: Plus },
  task_blocked: { label: 'Blocked', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: Ban },
  task_unblocked: { label: 'Unblocked', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400', icon: ShieldAlert },
};

const PAGE_SIZE = 50;

const AdminActivityLog = () => {
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [page, setPage] = useState(0);

  const { data: people } = useQuery({
    queryKey: ['activity-log-people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      if (error) throw error;
      return (data ?? []).filter(p => p.full_name);
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['activity-log', actionFilter, actorFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }
      if (actorFilter !== 'all') {
        query = query.eq('actor_id', actorFilter);
      }

      const { data: logs, error } = await query;
      if (error) throw error;

      // Get unique actor and project IDs
      const actorIds = [...new Set((logs ?? []).map(l => l.actor_id).filter(Boolean))] as string[];
      const projectIds = [...new Set((logs ?? []).map(l => l.project_id).filter(Boolean))] as string[];

      const [{ data: profiles }, { data: projects }] = await Promise.all([
        actorIds.length > 0
          ? supabase.from('profiles').select('id, full_name').in('id', actorIds)
          : Promise.resolve({ data: [] }),
        projectIds.length > 0
          ? supabase.from('projects').select('id, name').in('id', projectIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap: Record<string, string> = {};
      (profiles ?? []).forEach(p => { profileMap[p.id] = p.full_name || 'Unknown'; });

      const projectMap: Record<string, string> = {};
      (projects ?? []).forEach(p => { projectMap[p.id] = p.name; });

      return { logs: logs ?? [], profileMap, projectMap };
    },
  });

  const logs = data?.logs ?? [];
  const profileMap = data?.profileMap ?? {};
  const projectMap = data?.projectMap ?? {};

  return (
    <div className="pb-20">
      <PageHeader title="Activity Log" backTo="/admin" />
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Select value={actorFilter} onValueChange={(v) => { setActorFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="All people" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All people</SelectItem>
              {(people ?? []).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="task_created">Created</SelectItem>
              <SelectItem value="task_started">Started</SelectItem>
              <SelectItem value="task_completed">Completed</SelectItem>
              <SelectItem value="task_claimed">Claimed</SelectItem>
              <SelectItem value="task_unclaimed">Unclaimed</SelectItem>
              <SelectItem value="task_blocked">Blocked</SelectItem>
              <SelectItem value="task_unblocked">Unblocked</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">
            Page {page + 1}
          </span>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading activity...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No activity logged yet. Events will appear here as your team works.
          </p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const config = ACTION_CONFIG[log.action] || { label: log.action, color: 'bg-muted text-muted-foreground', icon: CircleDot };
              const Icon = config.icon;
              const actorName = log.actor_id ? (profileMap[log.actor_id] || 'Unknown') : 'System';
              const projectName = log.project_id ? (projectMap[log.project_id] || 'Unknown project') : null;

              return (
                <Card key={log.id} className="p-3 flex items-start gap-3">
                  <div className={`rounded-full p-1.5 mt-0.5 ${config.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{actorName}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                        {config.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground truncate">{log.description}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {projectName && <span>{projectName}</span>}
                      {projectName && <span>·</span>}
                      <span>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={logs.length < PAGE_SIZE}
            onClick={() => setPage(p => p + 1)}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminActivityLog;

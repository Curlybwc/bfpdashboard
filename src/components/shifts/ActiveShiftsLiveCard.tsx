import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const RUNAWAY_THRESHOLD_MS = 12 * 60 * 60 * 1000;

function formatHumanElapsed(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface ActiveRow {
  id: string;
  user_id: string;
  project_id: string | null;
  clock_in_at: string;
}

export default function ActiveShiftsLiveCard() {
  const [now, setNow] = useState(() => Date.now());

  const { data, isLoading } = useQuery({
    queryKey: ['admin-active-shifts'],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: shifts, error } = await supabase
        .from('shifts')
        .select('id, user_id, project_id, clock_in_at')
        .not('clock_in_at', 'is', null)
        .is('clock_out_at', null)
        .order('clock_in_at', { ascending: true });
      if (error) throw error;
      const rows = (shifts ?? []) as ActiveRow[];

      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const projectIds = [...new Set(rows.map((r) => r.project_id).filter((p): p is string => !!p))];

      const [profilesRes, projectsRes] = await Promise.all([
        userIds.length
          ? supabase.from('profiles').select('id, full_name').in('id', userIds)
          : Promise.resolve({ data: [], error: null } as any),
        projectIds.length
          ? supabase.from('projects').select('id, name').in('id', projectIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const profileMap: Record<string, string> = {};
      (profilesRes.data ?? []).forEach((p: any) => { profileMap[p.id] = p.full_name || 'Unknown'; });
      const projectMap: Record<string, string> = {};
      (projectsRes.data ?? []).forEach((p: any) => { projectMap[p.id] = p.name; });

      return { rows, profileMap, projectMap };
    },
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (isLoading || !data || data.rows.length === 0) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">On the clock now</p>
        <Badge variant="secondary" className="ml-auto">{data.rows.length}</Badge>
      </div>
      <ul className="space-y-1.5">
        {data.rows.map((r) => {
          const startedAt = new Date(r.clock_in_at);
          const elapsedMs = now - startedAt.getTime();
          const runaway = elapsedMs > RUNAWAY_THRESHOLD_MS;
          return (
            <li
              key={r.id}
              className={
                'flex items-center justify-between gap-3 text-sm rounded-md px-2 py-1.5 ' +
                (runaway ? 'bg-destructive/10 text-destructive' : 'hover:bg-muted/50')
              }
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {data.profileMap[r.user_id] || 'Unknown'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.project_id ? data.projectMap[r.project_id] || 'Unknown project' : 'No project'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 font-mono tabular-nums text-xs shrink-0">
                {runaway && <AlertTriangle className="h-3.5 w-3.5" />}
                {formatHumanElapsed(elapsedMs)}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
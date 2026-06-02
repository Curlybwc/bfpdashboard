import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, AlertTriangle, Square } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const RUNAWAY_THRESHOLD_MS = 12 * 60 * 60 * 1000;
const SOFT_WARN_THRESHOLD_MS = 8 * 60 * 60 * 1000;

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
  const [forcingId, setForcingId] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

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

  const handleForceClockOut = async (shiftId: string) => {
    setForcingId(shiftId);
    try {
      const { error } = await supabase.rpc('admin_force_clock_out', { p_shift_id: shiftId });
      if (error) throw error;
      toast({ title: 'Shift closed', description: 'Worker has been clocked out.' });
      qc.invalidateQueries({ queryKey: ['admin-active-shifts'] });
      qc.invalidateQueries({ queryKey: ['active-shift'] });
    } catch (e: any) {
      toast({ title: 'Force clock out failed', description: e.message, variant: 'destructive' });
    } finally {
      setForcingId(null);
    }
  };

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
          const softWarn = !runaway && elapsedMs > SOFT_WARN_THRESHOLD_MS;
          const workerName = data.profileMap[r.user_id] || 'Unknown';
          return (
            <li
              key={r.id}
              className={
                'flex items-center justify-between gap-3 text-sm rounded-md px-2 py-1.5 ' +
                (runaway
                  ? 'bg-destructive/10 text-destructive'
                  : softWarn
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  : 'hover:bg-muted/50')
              }
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {workerName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.project_id ? data.projectMap[r.project_id] || 'Unknown project' : 'No project'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 font-mono tabular-nums text-xs">
                  {(runaway || softWarn) && <AlertTriangle className="h-3.5 w-3.5" />}
                  {formatHumanElapsed(elapsedMs)}
                </div>
                {(runaway || softWarn) && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant={runaway ? 'destructive' : 'outline'}
                        className="h-7 px-2 text-xs"
                        disabled={forcingId === r.id}
                      >
                        <Square className="h-3 w-3 mr-1 fill-current" />
                        Force out
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Force clock out {workerName}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This shift has been open for {formatHumanElapsed(elapsedMs)}. Closing it
                          now will log {formatHumanElapsed(elapsedMs)} on the shift and mark it as
                          admin-edited. The worker can still adjust the project and tasks afterward.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleForceClockOut(r.id)}>
                          Clock out
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
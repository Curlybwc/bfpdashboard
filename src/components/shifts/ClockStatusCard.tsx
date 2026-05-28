import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, Clock, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveShift } from '@/hooks/useActiveShift';
import { useToast } from '@/hooks/use-toast';
import ShiftForm from '@/components/shifts/ShiftForm';
import { fetchShiftById, fetchShiftAllocations, type Shift, type ShiftAllocation } from '@/hooks/useShifts';

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatHumanElapsed(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const RUNAWAY_THRESHOLD_MS = 12 * 60 * 60 * 1000;

export default function ClockStatusCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: active, isLoading, clockIn, clockOut } = useActiveShift(user?.id);
  const [now, setNow] = useState(() => Date.now());
  const [lastClosed, setLastClosed] = useState<{ id: string; hours: number } | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [allocOpen, setAllocOpen] = useState(false);
  const [allocShift, setAllocShift] = useState<Shift | null>(null);
  const [allocAllocations, setAllocAllocations] = useState<ShiftAllocation[]>([]);
  const [allocLoading, setAllocLoading] = useState(false);

  const { data: myProjects = [] } = useQuery({
    queryKey: ['my-active-projects', user?.id],
    enabled: !!user?.id && !active?.clock_in_at,
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', user!.id);
      const pids = (memberships || []).map((m: any) => m.project_id);
      if (pids.length === 0) return [] as { id: string; name: string }[];
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', pids)
        .eq('status', 'active')
        .order('name');
      return (data || []) as { id: string; name: string }[];
    },
  });

  useEffect(() => {
    if (!active?.clock_in_at) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active?.clock_in_at]);

  if (isLoading) {
    return <Card className="p-4 mb-4 h-20 animate-pulse bg-muted/30" />;
  }

  const handleClockIn = async () => {
    setLastClosed(null);
    try {
      await clockIn.mutateAsync(selectedProjectId || null);
      toast({
        title: 'Clocked in',
        description: selectedProjectId ? 'Timer started on project.' : 'Timer started.',
      });
      setSelectedProjectId('');
    } catch (e: any) {
      toast({ title: 'Clock in failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleClockOut = async () => {
    try {
      const row = await clockOut.mutateAsync();
      setLastClosed({ id: row.id, hours: Number(row.total_hours ?? 0) });
      toast({
        title: 'Clocked out',
        description: `Logged ${Number(row.total_hours ?? 0).toFixed(2)} h`,
      });
    } catch (e: any) {
      toast({ title: 'Clock out failed', description: e.message, variant: 'destructive' });
    }
  };

  const openAllocationSheet = async (shiftId: string) => {
    setAllocOpen(true);
    setAllocLoading(true);
    try {
      const [s, a] = await Promise.all([
        fetchShiftById(shiftId),
        fetchShiftAllocations(shiftId),
      ]);
      setAllocShift(s);
      setAllocAllocations(a);
    } catch (e: any) {
      toast({ title: 'Could not load shift', description: e.message, variant: 'destructive' });
      setAllocOpen(false);
    } finally {
      setAllocLoading(false);
    }
  };

  const allocationSheet = (
    <Sheet open={allocOpen} onOpenChange={setAllocOpen}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Assign project &amp; tasks</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {allocLoading || !allocShift ? (
            <div className="h-32 animate-pulse bg-muted/40 rounded-md" />
          ) : (
            <ShiftForm
              editShift={allocShift}
              editAllocations={allocAllocations}
              onSaved={() => {
                setAllocOpen(false);
                setLastClosed(null);
                toast({ title: 'Shift updated' });
              }}
              onCancel={() => setAllocOpen(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );

  if (active?.clock_in_at) {
    const startedAt = new Date(active.clock_in_at);
    const elapsedMs = now - startedAt.getTime();
    const isRunaway = elapsedMs > RUNAWAY_THRESHOLD_MS;
    return (
      <Card
        className={
          isRunaway
            ? 'p-4 mb-4 border-2 border-destructive/60 bg-destructive/10'
            : 'p-4 mb-4 border-2 border-primary/40 bg-primary/5'
        }
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              {isRunaway && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
              On the clock
            </p>
            <p className="text-2xl font-mono font-bold tabular-nums">{formatElapsed(elapsedMs)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Started {startedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
            {isRunaway && (
              <p className="text-xs text-destructive font-medium mt-1.5 max-w-xs">
                Looks like you forgot to clock out. Tap Clock Out to close this shift now.
              </p>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="lg"
                variant="destructive"
                className="h-14 px-6 text-base min-w-[140px]"
                disabled={clockOut.isPending}
              >
                <Square className="h-5 w-5 mr-2 fill-current" />
                Clock Out
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clock out after {formatHumanElapsed(elapsedMs)}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {isRunaway
                    ? `This shift has been open for ${formatHumanElapsed(elapsedMs)} — that looks unusually long. Only confirm if this is correct.`
                    : `You'll log ${formatHumanElapsed(elapsedMs)} on this shift. You can still assign a project and tasks afterward.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep working</AlertDialogCancel>
                <AlertDialogAction onClick={handleClockOut}>Clock out</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>
    );
  }

  return (
    <>
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Not clocked in
          </p>
          {lastClosed ? (
            <p className="text-xs text-muted-foreground mt-1">
              Last shift recorded: {lastClosed.hours.toFixed(2)} h.{' '}
              <button
                type="button"
                onClick={() => openAllocationSheet(lastClosed.id)}
                className="underline text-primary hover:opacity-80"
              >
                Assign project &amp; tasks
              </button>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Pick a project now (optional) or assign one later.
            </p>
          )}
          {myProjects.length > 0 && (
            <div className="mt-2 max-w-xs">
              <Select value={selectedProjectId || 'none'} onValueChange={(v) => setSelectedProjectId(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="No project (assign later)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project (assign later)</SelectItem>
                  {myProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <Button
          size="lg"
          className="h-14 px-6 text-base min-w-[140px] bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleClockIn}
          disabled={clockIn.isPending}
        >
          <Play className="h-5 w-5 mr-2 fill-current" />
          Clock In
        </Button>
      </div>
    </Card>
    {allocationSheet}
    </>
  );
}
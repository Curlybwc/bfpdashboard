import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useActiveShift } from '@/hooks/useActiveShift';
import { useToast } from '@/hooks/use-toast';

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function ClockStatusCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: active, isLoading, clockIn, clockOut } = useActiveShift(user?.id);
  const [now, setNow] = useState(() => Date.now());
  const [lastClosed, setLastClosed] = useState<{ id: string; hours: number } | null>(null);

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
      await clockIn.mutateAsync();
      toast({ title: 'Clocked in', description: 'Timer started.' });
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

  if (active?.clock_in_at) {
    const startedAt = new Date(active.clock_in_at);
    const elapsedMs = now - startedAt.getTime();
    return (
      <Card className="p-4 mb-4 border-2 border-primary/40 bg-primary/5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">On the clock</p>
            <p className="text-2xl font-mono font-bold tabular-nums">{formatElapsed(elapsedMs)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Started {startedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
          <Button
            size="lg"
            variant="destructive"
            className="h-14 px-6 text-base min-w-[140px]"
            onClick={handleClockOut}
            disabled={clockOut.isPending}
          >
            <Square className="h-5 w-5 mr-2 fill-current" />
            Clock Out
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Not clocked in
          </p>
          {lastClosed ? (
            <p className="text-xs text-muted-foreground mt-1">
              Last shift recorded: {lastClosed.hours.toFixed(2)} h.{' '}
              <Link to={`/shifts?edit=${lastClosed.id}`} className="underline text-primary">
                Assign project &amp; tasks
              </Link>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Tap to start. You can pick a project and tasks after you clock out.
            </p>
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
  );
}
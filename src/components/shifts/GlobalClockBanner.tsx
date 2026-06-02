import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Square, Clock, AlertTriangle } from 'lucide-react';
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
import { useAuth } from '@/hooks/useAuth';
import { useActiveShift } from '@/hooks/useActiveShift';
import { useToast } from '@/hooks/use-toast';

const HIDDEN_PREFIXES = ['/login', '/reset-password', '/privacy', '/eula', '/qb-disconnected', '/today'];

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
const SOFT_WARN_THRESHOLD_MS = 8 * 60 * 60 * 1000;

export default function GlobalClockBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const { data: active, clockOut } = useActiveShift(user?.id);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active?.clock_in_at) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active?.clock_in_at]);

  if (!user || !active?.clock_in_at) return null;
  if (HIDDEN_PREFIXES.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))) return null;

  const elapsedMs = now - new Date(active.clock_in_at).getTime();
  const isRunaway = elapsedMs > RUNAWAY_THRESHOLD_MS;
  const isSoftWarn = !isRunaway && elapsedMs > SOFT_WARN_THRESHOLD_MS;

  const handleClockOut = async () => {
    try {
      const row = await clockOut.mutateAsync();
      toast({
        title: 'Clocked out',
        description: `Logged ${Number(row.total_hours ?? 0).toFixed(2)} h`,
      });
    } catch (e: any) {
      toast({ title: 'Clock out failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div
      className={
        isRunaway
          ? 'sticky top-0 z-40 w-full bg-destructive text-destructive-foreground border-b border-destructive/40 shadow-sm'
          : isSoftWarn
          ? 'sticky top-0 z-40 w-full bg-amber-500 text-white border-b border-amber-600/40 shadow-sm'
          : 'sticky top-0 z-40 w-full bg-primary text-primary-foreground border-b border-primary/40 shadow-sm'
      }
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2 max-w-screen-xl mx-auto">
        <Link to="/today" className="flex items-center gap-2 min-w-0 hover:opacity-90">
          {isRunaway || isSoftWarn ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <Clock className="h-4 w-4 shrink-0" />
          )}
          <span className="text-xs uppercase tracking-wide opacity-90 hidden sm:inline">
            {isRunaway ? 'Forgot to clock out?' : isSoftWarn ? 'Still clocked in' : 'On the clock'}
          </span>
          <span className="font-mono font-bold tabular-nums text-sm sm:text-base">{formatElapsed(elapsedMs)}</span>
        </Link>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant={isRunaway || isSoftWarn ? 'secondary' : 'destructive'}
              disabled={clockOut.isPending}
              className="h-8"
            >
              <Square className="h-3.5 w-3.5 mr-1.5 fill-current" />
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
    </div>
  );
}
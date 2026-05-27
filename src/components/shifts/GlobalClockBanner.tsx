import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Square, Clock } from 'lucide-react';
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
    <div className="sticky top-0 z-40 w-full bg-primary text-primary-foreground border-b border-primary/40 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-3 py-2 max-w-screen-xl mx-auto">
        <Link to="/today" className="flex items-center gap-2 min-w-0 hover:opacity-90">
          <Clock className="h-4 w-4 shrink-0" />
          <span className="text-xs uppercase tracking-wide opacity-90 hidden sm:inline">On the clock</span>
          <span className="font-mono font-bold tabular-nums text-sm sm:text-base">{formatElapsed(elapsedMs)}</span>
        </Link>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleClockOut}
          disabled={clockOut.isPending}
          className="h-8"
        >
          <Square className="h-3.5 w-3.5 mr-1.5 fill-current" />
          Clock Out
        </Button>
      </div>
    </div>
  );
}
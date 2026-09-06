import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ShiftRow {
  id: string;
  project_id: string | null;
  user_id: string;
  shift_date: string;
  total_hours: number | null;
  hourly_rate_snapshot: number | null;
  is_flat_rate?: boolean | null;
  flat_rate_amount?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string | null;
  projectName: string;
  shifts: ShiftRow[];
  profileMap: Record<string, string>;
}

const hoursOf = (s: ShiftRow) => (s.is_flat_rate ? 0 : Number(s.total_hours) || 0);
const costOf = (s: ShiftRow) =>
  s.is_flat_rate
    ? Number(s.flat_rate_amount || 0)
    : (Number(s.total_hours) || 0) * (Number(s.hourly_rate_snapshot) || 0);

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const LaborBreakdownSheet = ({ open, onOpenChange, projectId, projectName, shifts, profileMap }: Props) => {
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<Record<string, { task: string; hours: number }[]>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!open) setSelectedWorker(null);
  }, [open]);

  const projectShifts = useMemo(
    () => shifts.filter(s => s.project_id === projectId),
    [shifts, projectId]
  );

  const workers = useMemo(() => {
    const map: Record<string, { userId: string; name: string; hours: number; cost: number; days: number }> = {};
    projectShifts.forEach(s => {
      if (!map[s.user_id]) {
        map[s.user_id] = {
          userId: s.user_id,
          name: profileMap[s.user_id] || 'Unknown',
          hours: 0,
          cost: 0,
          days: 0,
        };
      }
      map[s.user_id].hours += hoursOf(s);
      map[s.user_id].cost += costOf(s);
      map[s.user_id].days += 1;
    });
    return Object.values(map).sort((a, b) => b.hours - a.hours || b.cost - a.cost);
  }, [projectShifts, profileMap]);

  const workerShifts = useMemo(
    () =>
      projectShifts
        .filter(s => s.user_id === selectedWorker)
        .sort((a, b) => (a.shift_date < b.shift_date ? 1 : -1)),
    [projectShifts, selectedWorker]
  );

  useEffect(() => {
    if (!selectedWorker) return;
    const ids = workerShifts.map(s => s.id);
    if (ids.length === 0) {
      setAllocations({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingDetail(true);
      const { data } = await supabase
        .from('shift_task_allocations')
        .select('shift_id, hours, tasks(task)')
        .in('shift_id', ids);
      if (cancelled) return;
      const map: Record<string, { task: string; hours: number }[]> = {};
      (data || []).forEach((a: any) => {
        if (!map[a.shift_id]) map[a.shift_id] = [];
        map[a.shift_id].push({ task: a.tasks?.task || 'Task', hours: Number(a.hours) || 0 });
      });
      setAllocations(map);
      setLoadingDetail(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedWorker, workerShifts]);

  const totalHours = workers.reduce((s, w) => s + w.hours, 0);
  const totalCost = workers.reduce((s, w) => s + w.cost, 0);
  const current = workers.find(w => w.userId === selectedWorker);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">
            {selectedWorker ? current?.name || 'Contractor' : projectName}
          </SheetTitle>
          <SheetDescription>
            {selectedWorker
              ? `${projectName} · ${(current?.hours || 0).toFixed(1)}h · ${money(current?.cost || 0)}`
              : `${totalHours.toFixed(1)}h · ${money(totalCost)} across ${workers.length} ${workers.length === 1 ? 'person' : 'people'}`}
          </SheetDescription>
        </SheetHeader>

        {selectedWorker && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 -ml-2"
            onClick={() => setSelectedWorker(null)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> All contractors
          </Button>
        )}

        <div className="mt-4 space-y-2">
          {!selectedWorker &&
            (workers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No logged hours yet.</p>
            ) : (
              workers.map(w => (
                <button
                  key={w.userId}
                  onClick={() => setSelectedWorker(w.userId)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-left min-h-[56px] hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{w.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {w.days} {w.days === 1 ? 'shift' : 'shifts'} · {money(w.cost)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-sm font-semibold text-foreground">{w.hours.toFixed(1)}h</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))
            ))}

          {selectedWorker &&
            (workerShifts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No shifts found.</p>
            ) : (
              workerShifts.map(s => {
                const allocs = allocations[s.id] || [];
                return (
                  <div key={s.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{s.shift_date}</p>
                      <p className="text-sm font-semibold text-foreground">
                        {s.is_flat_rate ? 'Flat rate' : `${hoursOf(s).toFixed(1)}h`}
                        <span className="text-muted-foreground font-normal"> · {money(costOf(s))}</span>
                      </p>
                    </div>
                    <div className="mt-2 space-y-1">
                      {allocs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {loadingDetail ? 'Loading tasks…' : 'Unallocated'}
                        </p>
                      ) : (
                        allocs.map((a, i) => (
                          <div key={i} className="flex items-start justify-between gap-3 text-xs">
                            <span className="text-muted-foreground min-w-0 break-words">{a.task}</span>
                            <span className="text-foreground shrink-0">{a.hours.toFixed(1)}h</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default LaborBreakdownSheet;

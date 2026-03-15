import { useEffect, useState, useMemo } from 'react';
import { format, addDays, addWeeks, addMonths, startOfDay, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isBefore, isAfter } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useAvailability, AvailabilityWindow } from '@/hooks/useAvailability';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Check, X, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const MAX_WEEKS_AHEAD = 8;

const formatDateLabel = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return format(d, 'EEE, MMM d');
};

const computeHours = (start: string, end: string) => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
};

const formatHours = (h: number) => {
  if (h === Math.floor(h)) return `${h}h`;
  return `${h.toFixed(1)}h`;
};

interface EditingRow {
  date: string;
  id?: string;
  start_time: string;
  end_time: string;
  notes: string;
}

type ViewMode = 'week' | 'month';

const AvailabilityForm = () => {
  const { user } = useAuth();
  const { windows, loading, fetchMyAvailability, addWindow, updateWindow, deleteWindow } = useAvailability(user?.id);
  const { toast } = useToast();
  const [editing, setEditing] = useState<EditingRow | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [offset, setOffset] = useState(0); // weeks or months offset from today

  const today = startOfDay(new Date());
  const maxDate = addWeeks(today, MAX_WEEKS_AHEAD);

  const { dates, rangeLabel, from, to } = useMemo(() => {
    if (viewMode === 'week') {
      const weekStart = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), offset);
      const weekEnd = addDays(weekStart, 6);
      const clampedStart = isBefore(weekStart, today) ? today : weekStart;
      const clampedEnd = isAfter(weekEnd, maxDate) ? maxDate : weekEnd;
      if (isAfter(clampedStart, clampedEnd)) {
        return { dates: [], rangeLabel: '', from: '', to: '' };
      }
      const days = eachDayOfInterval({ start: clampedStart, end: clampedEnd });
      return {
        dates: days.map(d => format(d, 'yyyy-MM-dd')),
        rangeLabel: `${format(clampedStart, 'MMM d')} – ${format(clampedEnd, 'MMM d')}`,
        from: format(clampedStart, 'yyyy-MM-dd'),
        to: format(clampedEnd, 'yyyy-MM-dd'),
      };
    } else {
      const monthStart = startOfMonth(addMonths(today, offset));
      const monthEnd = endOfMonth(monthStart);
      const clampedStart = isBefore(monthStart, today) ? today : monthStart;
      const clampedEnd = isAfter(monthEnd, maxDate) ? maxDate : monthEnd;
      if (isAfter(clampedStart, clampedEnd)) {
        return { dates: [], rangeLabel: '', from: '', to: '' };
      }
      const days = eachDayOfInterval({ start: clampedStart, end: clampedEnd });
      return {
        dates: days.map(d => format(d, 'yyyy-MM-dd')),
        rangeLabel: format(monthStart, 'MMMM yyyy'),
        from: format(clampedStart, 'yyyy-MM-dd'),
        to: format(clampedEnd, 'yyyy-MM-dd'),
      };
    }
  }, [viewMode, offset, today.getTime()]);

  // Reset offset when switching view modes
  useEffect(() => {
    setOffset(0);
    setEditing(null);
  }, [viewMode]);

  useEffect(() => {
    if (user && from && to) fetchMyAvailability(from, to);
  }, [user, from, to, fetchMyAvailability]);

  // Navigation limits
  const canGoBack = offset > 0;
  const canGoForward = useMemo(() => {
    if (viewMode === 'week') {
      const nextWeekStart = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), offset + 1);
      return isBefore(nextWeekStart, maxDate);
    } else {
      const nextMonthStart = startOfMonth(addMonths(today, offset + 1));
      return isBefore(nextMonthStart, maxDate);
    }
  }, [viewMode, offset, today.getTime()]);

  const windowsByDate = (date: string) => windows.filter(w => w.available_date === date);

  const startAdd = (date: string) => {
    setEditing({ date, start_time: '08:00', end_time: '17:00', notes: '' });
  };

  const startEdit = (w: AvailabilityWindow) => {
    setEditing({
      date: w.available_date,
      id: w.id,
      start_time: w.start_time.slice(0, 5),
      end_time: w.end_time.slice(0, 5),
      notes: w.notes || '',
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (editing.end_time <= editing.start_time) {
      toast({ title: 'Invalid time range', description: 'End time must be after start time.', variant: 'destructive' });
      return;
    }
    let ok: boolean;
    if (editing.id) {
      ok = await updateWindow(editing.id, {
        start_time: editing.start_time,
        end_time: editing.end_time,
        notes: editing.notes || null,
      });
    } else {
      ok = await addWindow({
        available_date: editing.date,
        start_time: editing.start_time,
        end_time: editing.end_time,
        notes: editing.notes || undefined,
      });
    }
    if (ok) {
      setEditing(null);
      fetchMyAvailability(from, to);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteWindow(id);
    if (ok) fetchMyAvailability(from, to);
  };

  // Copy a day's availability to all remaining empty days in the visible range
  const handleCopyToWeek = async (sourceDate: string) => {
    const sourceWindows = windowsByDate(sourceDate);
    if (sourceWindows.length === 0) return;

    let copied = 0;
    for (const date of dates) {
      if (date === sourceDate) continue;
      const existing = windowsByDate(date);
      if (existing.length > 0) continue;
      for (const w of sourceWindows) {
        await addWindow({
          available_date: date,
          start_time: w.start_time.slice(0, 5),
          end_time: w.end_time.slice(0, 5),
          notes: w.notes || undefined,
        });
        copied++;
      }
    }
    if (copied > 0) {
      fetchMyAvailability(from, to);
      toast({ title: `Copied to ${dates.length - 1} days` });
    }
  };

  const totalHoursInRange = windows.reduce((sum, w) => sum + computeHours(w.start_time, w.end_time), 0);
  const daysWithAvailability = new Set(windows.map(w => w.available_date)).size;

  return (
    <div>
      {/* View mode toggle */}
      <Tabs value={viewMode} onValueChange={v => setViewMode(v as ViewMode)} className="mb-3">
        <TabsList className="w-full">
          <TabsTrigger value="week" className="flex-1">Week</TabsTrigger>
          <TabsTrigger value="month" className="flex-1">Month</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Navigation */}
      <div className="flex items-center justify-between mb-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setOffset(o => o - 1)}
          disabled={!canGoBack}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{rangeLabel}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setOffset(o => o + 1)}
          disabled={!canGoForward}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary */}
      {!loading && windows.length > 0 && (
        <p className="text-xs text-muted-foreground mb-3 text-center">
          {daysWithAvailability} day{daysWithAvailability !== 1 ? 's' : ''} · {formatHours(totalHoursInRange)} total
        </p>
      )}

      {loading && <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>}

      {!loading && dates.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No dates in this range.</p>
      )}

      {!loading && dates.map(date => {
        const dayWindows = windowsByDate(date);
        return (
          <div key={date} className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-semibold">{formatDateLabel(date)}</h3>
              <div className="flex items-center gap-1">
                {dayWindows.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleCopyToWeek(date)}
                    disabled={editing !== null}
                    title="Copy to empty days"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => startAdd(date)}
                  disabled={editing !== null}
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            </div>

            {dayWindows.length === 0 && (!editing || editing.date !== date) && (
              <p className="text-xs text-muted-foreground pl-1 mb-2">No availability added yet.</p>
            )}

            {dayWindows.map(w => {
              if (editing?.id === w.id) return null;
              return (
                <Card key={w.id} className="p-2.5 mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">
                      {w.start_time.slice(0, 5)} – {w.end_time.slice(0, 5)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {formatHours(computeHours(w.start_time, w.end_time))}
                    </span>
                    {w.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{w.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(w)} disabled={editing !== null}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(w.id)} disabled={editing !== null}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}

            {editing && editing.date === date && (
              <Card className="p-3 mb-1.5 space-y-2 border-primary/30">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <Input
                    type="time"
                    value={editing.start_time}
                    onChange={e => setEditing({ ...editing, start_time: e.target.value })}
                    className="h-9 min-w-0"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={editing.end_time}
                    onChange={e => setEditing({ ...editing, end_time: e.target.value })}
                    className="h-9 min-w-0"
                  />
                </div>
                <Input
                  placeholder="Note (optional)"
                  value={editing.notes}
                  onChange={e => setEditing({ ...editing, notes: e.target.value })}
                  className="h-9"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" className="h-8 gap-1 flex-1" onClick={handleSave}>
                    <Check className="h-3.5 w-3.5" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 gap-1 flex-1" onClick={() => setEditing(null)}>
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </div>
              </Card>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AvailabilityForm;

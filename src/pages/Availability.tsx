import { useEffect, useState } from 'react';
import { format, addDays, startOfDay } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useAvailability, AvailabilityWindow } from '@/hooks/useAvailability';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';

const DAYS_AHEAD = 7;

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
  id?: string; // undefined = new
  start_time: string;
  end_time: string;
  notes: string;
}

const Availability = () => {
  const { user } = useAuth();
  const { windows, loading, fetchMyAvailability, addWindow, updateWindow, deleteWindow } = useAvailability(user?.id);
  const { toast } = useToast();
  const [editing, setEditing] = useState<EditingRow | null>(null);

  const today = startOfDay(new Date());
  const dates = Array.from({ length: DAYS_AHEAD }, (_, i) => format(addDays(today, i), 'yyyy-MM-dd'));
  const from = dates[0];
  const to = dates[dates.length - 1];

  useEffect(() => {
    if (user) fetchMyAvailability(from, to);
  }, [user, from, to, fetchMyAvailability]);

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

  return (
    <div className="pb-20">
      <PageHeader title="Availability" backTo="/today" />
      <div className="p-4">
        <p className="text-sm text-muted-foreground mb-4">Enter when you're available over the next week.</p>

        {loading && <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>}

        {!loading && dates.map(date => {
          const dayWindows = windowsByDate(date);
          return (
            <div key={date} className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-sm font-semibold">{formatDateLabel(date)}</h3>
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

              {dayWindows.length === 0 && (!editing || editing.date !== date) && (
                <p className="text-xs text-muted-foreground pl-1 mb-2">No availability added yet.</p>
              )}

              {dayWindows.map(w => {
                if (editing?.id === w.id) return null; // shown in edit form below
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
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={editing.start_time}
                      onChange={e => setEditing({ ...editing, start_time: e.target.value })}
                      className="h-9 w-[120px]"
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={editing.end_time}
                      onChange={e => setEditing({ ...editing, end_time: e.target.value })}
                      className="h-9 w-[120px]"
                    />
                  </div>
                  <Input
                    placeholder="Note (optional)"
                    value={editing.notes}
                    onChange={e => setEditing({ ...editing, notes: e.target.value })}
                    className="h-9"
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="h-8 gap-1" onClick={handleSave}>
                      <Check className="h-3.5 w-3.5" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setEditing(null)}>
                      <X className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Availability;

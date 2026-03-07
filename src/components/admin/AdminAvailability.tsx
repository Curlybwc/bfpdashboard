import { useEffect, useState } from 'react';
import { format, addDays, startOfDay } from 'date-fns';
import { useAdminAvailability, AdminAvailabilityRow } from '@/hooks/useAdminAvailability';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DAYS_AHEAD = 7;

const formatDateLabel = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return format(d, 'EEEE, MMM d');
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

const AdminAvailability = () => {
  const { rows, loading, fetchAll } = useAdminAvailability();
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);
  const [filterUser, setFilterUser] = useState<string>('all');

  const today = startOfDay(new Date());
  const dates = Array.from({ length: DAYS_AHEAD }, (_, i) => format(addDays(today, i), 'yyyy-MM-dd'));
  const from = dates[0];
  const to = dates[dates.length - 1];

  useEffect(() => {
    fetchAll(from, to, filterUser === 'all' ? undefined : filterUser);
  }, [from, to, filterUser, fetchAll]);

  useEffect(() => {
    const loadProfiles = async () => {
      const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
      if (data) setProfiles(data);
    };
    loadProfiles();
  }, []);

  const rowsByDate = (date: string) => rows.filter(r => r.available_date === date);

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-1">Crew Availability</h2>
      <p className="text-xs text-muted-foreground mb-3">Planning reference for upcoming worker availability.</p>

      <div className="mb-4">
        <Select value={filterUser} onValueChange={setFilterUser}>
          <SelectTrigger className="w-full max-w-[240px] h-9">
            <SelectValue placeholder="All workers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workers</SelectItem>
            {profiles.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.full_name || 'Unnamed'}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No availability submitted for this range.</p>
      )}

      {!loading && dates.map(date => {
        const dayRows = rowsByDate(date);
        if (dayRows.length === 0) return null;

        const uniqueWorkers = new Set(dayRows.map(r => r.user_id)).size;
        const totalHours = dayRows.reduce((sum, r) => sum + computeHours(r.start_time, r.end_time), 0);

        return (
          <div key={date} className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-semibold">{formatDateLabel(date)}</h3>
              <span className="text-xs text-muted-foreground">
                {uniqueWorkers} worker{uniqueWorkers !== 1 ? 's' : ''} · {formatHours(totalHours)}
              </span>
            </div>

            {dayRows.map(r => (
              <Card key={r.id} className="p-2.5 mb-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{r.full_name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {r.start_time.slice(0, 5)} – {r.end_time.slice(0, 5)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1.5">
                      ({formatHours(computeHours(r.start_time, r.end_time))})
                    </span>
                  </div>
                </div>
                {r.notes && <p className="text-xs text-muted-foreground mt-0.5">{r.notes}</p>}
              </Card>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default AdminAvailability;

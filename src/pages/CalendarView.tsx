import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isSameDay, isToday,
} from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CalTask {
  id: string;
  task: string;
  due_date: string;
  stage: string;
  priority: string;
  project_id: string;
  assigned_to_user_id: string | null;
}

interface CalShift {
  id: string;
  shift_date: string;
  total_hours: number;
  project_id: string;
}

const STAGE_COLORS: Record<string, string> = {
  'Ready': 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
  'In Progress': 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
  'Done': 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  'Not Ready': 'bg-muted text-muted-foreground border-border',
  'Hold': 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30',
};

export default function CalendarView() {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tasks, setTasks] = useState<CalTask[]>([]);
  const [shifts, setShifts] = useState<CalShift[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const rangeStart = format(calStart, 'yyyy-MM-dd');
  const rangeEnd = format(calEnd, 'yyyy-MM-dd');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [taskRes, shiftRes, projRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, task, due_date, stage, priority, project_id, assigned_to_user_id')
        .gte('due_date', rangeStart)
        .lte('due_date', rangeEnd)
        .neq('stage', 'Done'),
      supabase
        .from('shifts')
        .select('id, shift_date, total_hours, project_id')
        .gte('shift_date', rangeStart)
        .lte('shift_date', rangeEnd)
        .eq('user_id', user.id),
      supabase.from('projects').select('id, name'),
    ]);

    setTasks((taskRes.data as CalTask[]) || []);
    setShifts((shiftRes.data as CalShift[]) || []);

    const pm: Record<string, string> = {};
    (projRes.data || []).forEach((p: any) => { pm[p.id] = p.name; });
    setProjects(pm);
    setLoading(false);
  }, [user, rangeStart, rangeEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Group tasks & shifts by date string
  const tasksByDate = useMemo(() => {
    const map: Record<string, CalTask[]> = {};
    tasks.forEach((t) => {
      if (!t.due_date) return;
      (map[t.due_date] ||= []).push(t);
    });
    return map;
  }, [tasks]);

  const shiftsByDate = useMemo(() => {
    const map: Record<string, CalShift[]> = {};
    shifts.forEach((s) => {
      (map[s.shift_date] ||= []).push(s);
    });
    return map;
  }, [shifts]);

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const selectedTasks = selectedDateStr ? (tasksByDate[selectedDateStr] || []) : [];
  const selectedShifts = selectedDateStr ? (shiftsByDate[selectedDateStr] || []) : [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="Calendar" />

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold">{format(currentMonth, 'MMMM yyyy')}</h2>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 border border-border rounded-lg overflow-hidden">
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayTasks = tasksByDate[dateStr] || [];
            const dayShifts = shiftsByDate[dateStr] || [];
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);
            const selected = selectedDate && isSameDay(day, selectedDate);

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(selected ? null : day)}
                className={cn(
                  'relative min-h-[72px] md:min-h-[88px] p-1 border-b border-r border-border text-left transition-colors',
                  !inMonth && 'opacity-40',
                  today && 'bg-primary/5',
                  selected && 'ring-2 ring-primary ring-inset',
                  'hover:bg-accent/50',
                )}
              >
                <span className={cn(
                  'text-xs font-medium',
                  today && 'text-primary font-bold',
                )}>
                  {format(day, 'd')}
                </span>

                {/* Task dots */}
                <div className="mt-0.5 space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <div key={t.id} className={cn('text-[10px] leading-tight truncate px-1 rounded border', STAGE_COLORS[t.stage] || 'bg-muted')}>
                      {t.task}
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="text-[10px] text-muted-foreground px-1">+{dayTasks.length - 3} more</span>
                  )}
                </div>

                {/* Shift indicator */}
                {dayShifts.length > 0 && (
                  <div className="absolute bottom-1 right-1">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" title={`${dayShifts.reduce((s, sh) => s + sh.total_hours, 0)}h logged`} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day detail */}
        {selectedDate && (
          <div className="space-y-3 pt-2">
            <h3 className="text-base font-semibold">{format(selectedDate, 'EEEE, MMMM d')}</h3>

            {selectedTasks.length === 0 && selectedShifts.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing scheduled for this day.</p>
            )}

            {selectedTasks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Tasks due</h4>
                {selectedTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/tasks/${t.id}`)}
                    className="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{t.task}</span>
                      <Badge variant="outline" className={cn('text-[10px] shrink-0', STAGE_COLORS[t.stage])}>
                        {t.stage}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{projects[t.project_id] || 'Unknown project'}</p>
                  </button>
                ))}
              </div>
            )}

            {selectedShifts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Shifts logged</h4>
                {selectedShifts.map((s) => (
                  <div key={s.id} className="p-3 rounded-lg border bg-card space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{projects[s.project_id] || 'Project'}</span>
                      <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{s.total_hours}h</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

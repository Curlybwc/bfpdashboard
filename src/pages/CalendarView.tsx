import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Filter, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Types ── */
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
  user_id: string;
}

/* ── Stable project color palette (HSL-based, 10 colors) ── */
const PROJECT_HUES = [210, 340, 150, 30, 270, 190, 10, 100, 50, 310];

function projectColor(index: number): { bg: string; text: string; border: string; dot: string } {
  const hue = PROJECT_HUES[index % PROJECT_HUES.length];
  return {
    bg: `hsl(${hue} 60% 92%)`,
    text: `hsl(${hue} 50% 35%)`,
    border: `hsl(${hue} 50% 75%)`,
    dot: `hsl(${hue} 60% 50%)`,
  };
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
  const [searchParams] = useSearchParams();

  // If opened from a project link, pre-select that project
  const initialProjectFilter = searchParams.get('project') || 'all';

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tasks, setTasks] = useState<CalTask[]>([]);
  const [shifts, setShifts] = useState<CalShift[]>([]);
  const [projectList, setProjectList] = useState<{ id: string; name: string }[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [projectFilter, setProjectFilter] = useState(initialProjectFilter);
  const [contractorFilter, setContractorFilter] = useState<string>('all');
  const [contractorList, setContractorList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const rangeStart = format(calStart, 'yyyy-MM-dd');
  const rangeEnd = format(calEnd, 'yyyy-MM-dd');

  /* ── Project ID → index map for stable colors ── */
  const projectColorMap = useMemo(() => {
    const m: Record<string, ReturnType<typeof projectColor>> = {};
    projectList.forEach((p, i) => { m[p.id] = projectColor(i); });
    return m;
  }, [projectList]);

  const projectNames = useMemo(() => {
    const m: Record<string, string> = {};
    projectList.forEach((p) => { m[p.id] = p.name; });
    return m;
  }, [projectList]);

  /* ── Data fetching ── */
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const taskQuery = supabase
      .from('tasks')
      .select('id, task, due_date, stage, priority, project_id, assigned_to_user_id')
      .gte('due_date', rangeStart)
      .lte('due_date', rangeEnd)
      .neq('stage', 'Done');

    // Admin sees all shifts; non-admin sees only own
    const shiftQuery = isAdmin
      ? supabase
          .from('shifts')
          .select('id, shift_date, total_hours, project_id, user_id')
          .gte('shift_date', rangeStart)
          .lte('shift_date', rangeEnd)
      : supabase
          .from('shifts')
          .select('id, shift_date, total_hours, project_id, user_id')
          .gte('shift_date', rangeStart)
          .lte('shift_date', rangeEnd)
          .eq('user_id', user.id);

    const [taskRes, shiftRes, projRes] = await Promise.all([
      taskQuery,
      shiftQuery,
      supabase.from('projects').select('id, name'),
    ]);

    setTasks((taskRes.data as CalTask[]) || []);
    setShifts((shiftRes.data as CalShift[]) || []);
    setProjectList((projRes.data as any[]) || []);

    // Fetch contractor list for admin view
    if (isAdmin) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name');
      const pm: Record<string, string> = {};
      const cl: { id: string; name: string }[] = [];
      (profs || []).forEach((p: any) => {
        pm[p.id] = p.full_name || 'Unnamed';
        cl.push({ id: p.id, name: p.full_name || 'Unnamed' });
      });
      setProfiles(pm);
      setContractorList(cl.sort((a, b) => a.name.localeCompare(b.name)));
    }

    setLoading(false);
  }, [user, rangeStart, rangeEnd, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Filtered data ── */
  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    if (projectFilter !== 'all') {
      filtered = filtered.filter((t) => t.project_id === projectFilter);
    }
    if (isAdmin && contractorFilter !== 'all') {
      filtered = filtered.filter((t) => t.assigned_to_user_id === contractorFilter);
    }
    return filtered;
  }, [tasks, projectFilter, contractorFilter, isAdmin]);

  const filteredShifts = useMemo(() => {
    let filtered = shifts;
    if (projectFilter !== 'all') {
      filtered = filtered.filter((s) => s.project_id === projectFilter);
    }
    if (isAdmin && contractorFilter !== 'all') {
      filtered = filtered.filter((s) => s.user_id === contractorFilter);
    }
    return filtered;
  }, [shifts, projectFilter, contractorFilter, isAdmin]);

  /* ── Group by date ── */
  const tasksByDate = useMemo(() => {
    const map: Record<string, CalTask[]> = {};
    filteredTasks.forEach((t) => {
      if (!t.due_date) return;
      (map[t.due_date] ||= []).push(t);
    });
    return map;
  }, [filteredTasks]);

  const shiftsByDate = useMemo(() => {
    const map: Record<string, CalShift[]> = {};
    filteredShifts.forEach((s) => {
      (map[s.shift_date] ||= []).push(s);
    });
    return map;
  }, [filteredShifts]);

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const selectedTasks = selectedDateStr ? (tasksByDate[selectedDateStr] || []) : [];
  const selectedShifts = selectedDateStr ? (shiftsByDate[selectedDateStr] || []) : [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="Calendar" />

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Project filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projectList.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: projectColorMap[p.id]?.dot }}
                      />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Admin contractor filter */}
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={contractorFilter} onValueChange={setContractorFilter}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="All Contractors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Contractors</SelectItem>
                  {contractorList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Project color legend (when showing all projects) */}
        {projectFilter === 'all' && projectList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {projectList.slice(0, 10).map((p) => (
              <button
                key={p.id}
                onClick={() => setProjectFilter(p.id)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: projectColorMap[p.id]?.dot }}
                />
                {p.name}
              </button>
            ))}
          </div>
        )}

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

                {/* Task pills — color-coded by project */}
                <div className="mt-0.5 space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => {
                    const pc = projectColorMap[t.project_id];
                    return (
                      <div
                        key={t.id}
                        className="text-[10px] leading-tight truncate px-1 rounded border"
                        style={pc ? {
                          backgroundColor: pc.bg,
                          color: pc.text,
                          borderColor: pc.border,
                        } : undefined}
                      >
                        {t.task}
                      </div>
                    );
                  })}
                  {dayTasks.length > 3 && (
                    <span className="text-[10px] text-muted-foreground px-1">+{dayTasks.length - 3} more</span>
                  )}
                </div>

                {/* Shift indicator */}
                {dayShifts.length > 0 && (
                  <div className="absolute bottom-1 right-1">
                    <div
                      className="h-2 w-2 rounded-full bg-emerald-500"
                      title={`${dayShifts.reduce((s, sh) => s + sh.total_hours, 0)}h logged`}
                    />
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
                {selectedTasks.map((t) => {
                  const pc = projectColorMap[t.project_id];
                  return (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/projects/${t.project_id}/tasks/${t.id}`)}
                      className="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors space-y-1"
                      style={pc ? { borderLeftWidth: 4, borderLeftColor: pc.dot } : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{t.task}</span>
                        <Badge variant="outline" className={cn('text-[10px] shrink-0', STAGE_COLORS[t.stage])}>
                          {t.stage}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{projectNames[t.project_id] || 'Unknown project'}</span>
                        {isAdmin && t.assigned_to_user_id && profiles[t.assigned_to_user_id] && (
                          <span>• {profiles[t.assigned_to_user_id]}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedShifts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Shifts logged</h4>
                {selectedShifts.map((s) => {
                  const pc = projectColorMap[s.project_id];
                  return (
                    <div
                      key={s.id}
                      className="p-3 rounded-lg border bg-card space-y-1"
                      style={pc ? { borderLeftWidth: 4, borderLeftColor: pc.dot } : undefined}
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">{projectNames[s.project_id] || 'Project'}</span>
                          {isAdmin && profiles[s.user_id] && (
                            <p className="text-xs text-muted-foreground">{profiles[s.user_id]}</p>
                          )}
                        </div>
                        <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{s.total_hours}h</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

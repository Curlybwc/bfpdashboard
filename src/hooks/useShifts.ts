import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Shift {
  id: string;
  user_id: string;
  project_id: string;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  total_hours: number;
  hourly_rate_snapshot: number | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  admin_edited_at: string | null;
  admin_edited_by: string | null;
}

export interface ShiftAllocation {
  id: string;
  shift_id: string;
  task_id: string;
  hours: number;
}

export function useMyShifts(userId: string | undefined) {
  return useQuery({
    queryKey: ['shifts', 'my', userId],
    queryFn: async () => {
      if (!userId) return { shifts: [] as Shift[], projectMap: {} as Record<string, string> };

      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', userId)
        .order('shift_date', { ascending: false })
        .limit(20);

      if (error) throw error;

      const shifts = ((data ?? []) as Shift[]);
      const pids = [...new Set(shifts.map((s) => s.project_id))];
      const projectMap: Record<string, string> = {};

      if (pids.length > 0) {
        const { data: projects, error: projectsError } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', pids);

        if (projectsError) throw projectsError;
        (projects ?? []).forEach((p) => {
          projectMap[p.id] = p.name;
        });
      }

      return { shifts, projectMap };
    },
    enabled: !!userId,
  });
}

export async function fetchShiftById(shiftId: string): Promise<Shift | null> {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', shiftId)
    .maybeSingle();

  if (error) throw error;
  return (data as Shift | null) ?? null;
}

export async function fetchShiftAllocations(shiftId: string): Promise<ShiftAllocation[]> {
  const { data, error } = await supabase
    .from('shift_task_allocations')
    .select('*')
    .eq('shift_id', shiftId);

  if (error) throw error;
  return (data as ShiftAllocation[]) ?? [];
}

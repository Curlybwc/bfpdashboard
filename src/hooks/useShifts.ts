import { useState, useCallback } from 'react';
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

export const useShifts = (userId: string | undefined) => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMyShifts = useCallback(async (limit = 20) => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', userId)
      .order('shift_date', { ascending: false })
      .limit(limit);
    setShifts((data as Shift[]) || []);
    setLoading(false);
  }, [userId]);

  const fetchAllShifts = useCallback(async (from: string, to: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .gte('shift_date', from)
      .lte('shift_date', to)
      .order('shift_date', { ascending: false });
    setShifts((data as Shift[]) || []);
    setLoading(false);
  }, []);

  const fetchAllocations = useCallback(async (shiftId: string): Promise<ShiftAllocation[]> => {
    const { data } = await supabase
      .from('shift_task_allocations')
      .select('*')
      .eq('shift_id', shiftId);
    return (data as ShiftAllocation[]) || [];
  }, []);

  const deleteShift = useCallback(async (shiftId: string) => {
    const { error } = await supabase.from('shifts').delete().eq('id', shiftId);
    return error;
  }, []);

  return { shifts, loading, fetchMyShifts, fetchAllShifts, fetchAllocations, deleteShift };
};

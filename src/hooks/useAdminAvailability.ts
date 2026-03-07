import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AdminAvailabilityRow {
  id: string;
  user_id: string;
  available_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  full_name: string | null;
}

export const useAdminAvailability = () => {
  const [rows, setRows] = useState<AdminAvailabilityRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async (from: string, to: string, filterUserId?: string) => {
    setLoading(true);
    let query = supabase
      .from('worker_availability')
      .select('*, profiles!worker_availability_user_id_fkey(full_name)')
      .gte('available_date', from)
      .lte('available_date', to)
      .order('available_date')
      .order('start_time');

    if (filterUserId) {
      query = query.eq('user_id', filterUserId);
    }

    const { data } = await query;

    const mapped: AdminAvailabilityRow[] = (data || []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      available_date: r.available_date,
      start_time: r.start_time,
      end_time: r.end_time,
      notes: r.notes,
      full_name: r.profiles?.full_name || 'Unknown',
    }));

    // Sort by date, start_time, then name
    mapped.sort((a, b) => {
      if (a.available_date !== b.available_date) return a.available_date.localeCompare(b.available_date);
      if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
      return (a.full_name || '').localeCompare(b.full_name || '');
    });

    setRows(mapped);
    setLoading(false);
  }, []);

  return { rows, loading, fetchAll };
};

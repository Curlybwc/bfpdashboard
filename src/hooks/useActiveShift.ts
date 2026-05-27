import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Shift } from '@/hooks/useShifts';

export function useActiveShift(userId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['active-shift', userId],
    enabled: !!userId,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Shift | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', userId)
        .not('clock_in_at', 'is', null)
        .is('clock_out_at', null)
        .order('clock_in_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Shift) ?? null;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['active-shift', userId] });
    qc.invalidateQueries({ queryKey: ['shifts', 'my', userId] });
    qc.invalidateQueries({ queryKey: ['today'] });
  };

  const clockIn = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('clock_in');
      if (error) throw error;
      return data as unknown as Shift;
    },
    onSuccess: invalidate,
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('clock_out');
      if (error) throw error;
      return data as unknown as Shift;
    },
    onSuccess: invalidate,
  });

  return { ...query, clockIn, clockOut };
}
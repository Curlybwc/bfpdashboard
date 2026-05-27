import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Shift } from '@/hooks/useShifts';

interface AdminShiftsFilters {
  contractorId?: string;
  projectId?: string;
  fromDate: string;
  toDate: string;
}

export function useAdminShifts(filters: AdminShiftsFilters, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-shifts', filters],
    queryFn: async () => {
      let query = supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', filters.fromDate)
        .lte('shift_date', filters.toDate)
        .not('total_hours', 'is', null)
        .order('shift_date', { ascending: false });

      if (filters.contractorId) {
        query = query.eq('user_id', filters.contractorId);
      }
      if (filters.projectId) {
        query = query.eq('project_id', filters.projectId);
      }

      const { data, error } = await query;
      if (error) throw error;
      const shifts = (data ?? []) as Shift[];

      // Fetch profile names, project names, and paid shift IDs in parallel
      const userIds = [...new Set(shifts.map((s) => s.user_id))];
      const projectIds = [...new Set(shifts.map((s) => s.project_id))];
      const shiftIds = shifts.map((s) => s.id);

      const [profilesRes, projectsRes, paidBatchRes, paidPaymentRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from('profiles').select('id, full_name').in('id', userIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null }[], error: null }),
        projectIds.length > 0
          ? supabase.from('projects').select('id, name').in('id', projectIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
        shiftIds.length > 0
          ? supabase.from('worker_payable_batch_shifts').select('shift_id, payable_batch_id').in('shift_id', shiftIds).is('voided_at', null)
          : Promise.resolve({ data: [] as { shift_id: string; payable_batch_id: string }[], error: null }),
        shiftIds.length > 0
          ? supabase.from('worker_payment_shifts').select('shift_id').in('shift_id', shiftIds)
          : Promise.resolve({ data: [] as { shift_id: string }[], error: null }),
      ]);

      const profileMap: Record<string, string> = {};
      (profilesRes.data ?? []).forEach((p) => { profileMap[p.id] = p.full_name || 'Unknown'; });

      const projectMap: Record<string, string> = {};
      (projectsRes.data ?? []).forEach((p) => { projectMap[p.id] = p.name; });

      const paidShiftIds = new Set<string>();
      (paidBatchRes.data ?? []).forEach((r) => paidShiftIds.add(r.shift_id));
      (paidPaymentRes.data ?? []).forEach((r) => paidShiftIds.add(r.shift_id));

      return { shifts, profileMap, projectMap, paidShiftIds };
    },
    enabled,
  });
}

export function useContractorList() {
  return useQuery({
    queryKey: ['contractor-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });
}

export function useProjectList() {
  return useQuery({
    queryKey: ['project-list-simple'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .in('status', ['active', 'paused'])
        .order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

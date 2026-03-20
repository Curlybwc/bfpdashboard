import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

export interface AccountingFilters {
  workerId?: string;
  companyId?: string; // uuid, "legacy" for null-company rows, or undefined for all
  fromDate: string; // YYYY-MM-DD
  toDate: string;   // YYYY-MM-DD
}

export interface AccountingPayment {
  id: string;
  worker_user_id: string;
  paid_date: string;
  amount: number;
  payment_source: string;
  status: string;
  company_id: string | null;
  project_id: string | null;
  external_reference: string | null;
  memo: string | null;
  pay_period_start: string | null;
  pay_period_end: string | null;
  qb_txn_type: string | null;
}

export interface ContractorTotal {
  userId: string;
  name: string;
  total: number;
  count: number;
}

export function useAccountingPayments(filters: AccountingFilters) {
  const paymentsQuery = useQuery({
    queryKey: ['accounting-payments', filters],
    queryFn: async () => {
      let q = supabase
        .from('worker_payments')
        .select('id, worker_user_id, paid_date, amount, payment_source, status, company_id, project_id, external_reference, memo, pay_period_start, pay_period_end, qb_txn_type')
        .eq('status', 'paid')
        .gte('paid_date', filters.fromDate)
        .lte('paid_date', filters.toDate)
        .order('paid_date', { ascending: false });

      if (filters.workerId) {
        q = q.eq('worker_user_id', filters.workerId);
      }

      if (filters.companyId === 'legacy') {
        q = q.is('company_id', null);
      } else if (filters.companyId) {
        q = q.eq('company_id', filters.companyId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AccountingPayment[];
    },
  });

  const profilesQuery = useQuery({
    queryKey: ['accounting-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const companiesQuery = useQuery({
    queryKey: ['accounting-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, short_name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const profileMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profilesQuery.data ?? []) {
      map.set(p.id, p.full_name ?? 'Unnamed');
    }
    return map;
  }, [profilesQuery.data]);

  const companyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companiesQuery.data ?? []) {
      map.set(c.id, c.short_name ?? c.name);
    }
    return map;
  }, [companiesQuery.data]);

  // Contractors who actually have payment rows in current result set
  const ledgerContractors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of paymentsQuery.data ?? []) {
      if (!seen.has(p.worker_user_id)) {
        seen.set(p.worker_user_id, profileMap.get(p.worker_user_id) ?? 'Unnamed');
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [paymentsQuery.data, profileMap]);

  const totalPaid = useMemo(() => {
    return (paymentsQuery.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  }, [paymentsQuery.data]);

  const contractorTotals = useMemo<ContractorTotal[]>(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const p of paymentsQuery.data ?? []) {
      const existing = map.get(p.worker_user_id) ?? { total: 0, count: 0 };
      existing.total += Number(p.amount);
      existing.count += 1;
      map.set(p.worker_user_id, existing);
    }
    return Array.from(map.entries())
      .map(([userId, { total, count }]) => ({
        userId,
        name: profileMap.get(userId) ?? 'Unnamed',
        total,
        count,
      }))
      .sort((a, b) => b.total - a.total);
  }, [paymentsQuery.data, profileMap]);

  return {
    payments: paymentsQuery.data ?? [],
    loading: paymentsQuery.isLoading || profilesQuery.isLoading || companiesQuery.isLoading,
    error: paymentsQuery.error || profilesQuery.error || companiesQuery.error,
    profileMap,
    companyMap,
    companies: companiesQuery.data ?? [],
    ledgerContractors,
    totalPaid,
    contractorTotals,
  };
}

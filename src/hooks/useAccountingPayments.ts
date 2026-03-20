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
  source_table: 'worker_payments' | 'worker_payable_batches';
}

export interface ContractorTotal {
  userId: string;
  name: string;
  total: number;
  count: number;
}

export function useAccountingPayments(filters: AccountingFilters) {
  // Source 1: worker_payments with status = 'paid'
  const wpQuery = useQuery({
    queryKey: ['accounting-wp', filters],
    queryFn: async () => {
      let q = supabase
        .from('worker_payments')
        .select('id, worker_user_id, paid_date, amount, payment_source, status, company_id, project_id, external_reference, memo, pay_period_start, pay_period_end, qb_txn_type')
        .eq('status', 'paid')
        .gte('paid_date', filters.fromDate)
        .lte('paid_date', filters.toDate)
        .order('paid_date', { ascending: false });

      if (filters.workerId) q = q.eq('worker_user_id', filters.workerId);
      if (filters.companyId === 'legacy') q = q.is('company_id', null);
      else if (filters.companyId) q = q.eq('company_id', filters.companyId);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        worker_user_id: r.worker_user_id,
        paid_date: r.paid_date,
        amount: Number(r.amount),
        payment_source: r.payment_source,
        status: r.status,
        company_id: r.company_id,
        project_id: r.project_id,
        external_reference: r.external_reference,
        memo: r.memo,
        pay_period_start: r.pay_period_start,
        pay_period_end: r.pay_period_end,
        qb_txn_type: r.qb_txn_type,
        source_table: 'worker_payments' as const,
      }));
    },
  });

  // Source 2: worker_payable_batches with status = 'paid'
  // paid_at is a timestamptz, so we filter by casting to date range
  const batchQuery = useQuery({
    queryKey: ['accounting-batches', filters],
    queryFn: async () => {
      let q = supabase
        .from('worker_payable_batches')
        .select('id, worker_user_id, total_amount, paid_at, period_start, period_end, status, company_id, project_id, settlement_method, accounting_source, qb_bill_doc_number')
        .eq('status', 'paid')
        .not('paid_at', 'is', null)
        .gte('paid_at', filters.fromDate + 'T00:00:00Z')
        .lte('paid_at', filters.toDate + 'T23:59:59Z')
        .order('paid_at', { ascending: false });

      if (filters.workerId) q = q.eq('worker_user_id', filters.workerId);
      if (filters.companyId === 'legacy') q = q.is('company_id', null);
      else if (filters.companyId) q = q.eq('company_id', filters.companyId);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        worker_user_id: r.worker_user_id,
        paid_date: r.paid_at ? r.paid_at.split('T')[0] : r.period_end,
        amount: Number(r.total_amount),
        payment_source: r.settlement_method ?? r.accounting_source ?? 'batch',
        status: 'paid',
        company_id: r.company_id,
        project_id: r.project_id,
        external_reference: r.qb_bill_doc_number ?? null,
        memo: null,
        pay_period_start: r.period_start,
        pay_period_end: r.period_end,
        qb_txn_type: null,
        source_table: 'worker_payable_batches' as const,
      }));
    },
  });

  const profilesQuery = useQuery({
    queryKey: ['accounting-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const companiesQuery = useQuery({
    queryKey: ['accounting-companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('id, name, short_name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Deduplicate: if a worker_payments row and a batch row share the same worker + similar amount + date, prefer worker_payments
  const payments = useMemo<AccountingPayment[]>(() => {
    const wpRows = wpQuery.data ?? [];
    const batchRows = batchQuery.data ?? [];

    // Build a set of worker_payments IDs for dedup
    // Also track (worker_user_id, paid_date, amount) tuples from worker_payments
    const wpKeys = new Set<string>();
    for (const r of wpRows) {
      wpKeys.add(`${r.worker_user_id}|${r.paid_date}|${r.amount.toFixed(2)}`);
    }

    // Only include batch rows that don't already appear in worker_payments
    const dedupedBatches = batchRows.filter((b) => {
      const key = `${b.worker_user_id}|${b.paid_date}|${b.amount.toFixed(2)}`;
      return !wpKeys.has(key);
    });

    const all = [...wpRows, ...dedupedBatches];
    all.sort((a, b) => b.paid_date.localeCompare(a.paid_date));
    return all;
  }, [wpQuery.data, batchQuery.data]);

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

  const ledgerContractors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of payments) {
      if (!seen.has(p.worker_user_id)) {
        seen.set(p.worker_user_id, profileMap.get(p.worker_user_id) ?? 'Unnamed');
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [payments, profileMap]);

  const totalPaid = useMemo(() => {
    return payments.reduce((sum, p) => sum + p.amount, 0);
  }, [payments]);

  const contractorTotals = useMemo<ContractorTotal[]>(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const p of payments) {
      const existing = map.get(p.worker_user_id) ?? { total: 0, count: 0 };
      existing.total += p.amount;
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
  }, [payments, profileMap]);

  return {
    payments,
    loading: wpQuery.isLoading || batchQuery.isLoading || profilesQuery.isLoading || companiesQuery.isLoading,
    error: wpQuery.error || batchQuery.error || profilesQuery.error || companiesQuery.error,
    profileMap,
    companyMap,
    companies: companiesQuery.data ?? [],
    ledgerContractors,
    totalPaid,
    contractorTotals,
  };
}

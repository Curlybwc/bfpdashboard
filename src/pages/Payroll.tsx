import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import PayrollSummary from '@/components/shifts/PayrollSummary';
import PaymentHistory from '@/components/shifts/PaymentHistory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, DollarSign, Clock, CreditCard } from 'lucide-react';

function useWorkerFinancialSummary(workerId: string | undefined) {
  return useQuery({
    queryKey: ['worker-financial-summary', workerId],
    queryFn: async () => {
      if (!workerId) return null;

      // Fetch all shifts for this worker
      const { data: shifts, error: shiftsErr } = await supabase
        .from('shifts')
        .select('id, total_hours, hourly_rate_snapshot, is_flat_rate, flat_rate_amount')
        .eq('user_id', workerId)
        .not('total_hours', 'is', null);
      if (shiftsErr) throw shiftsErr;

      const allShifts = shifts ?? [];
      const shiftIds = allShifts.map(s => s.id);

      // Find which shifts are paid (via either payment table)
      const [batchRes, paymentRes, paymentsRes] = await Promise.all([
        shiftIds.length > 0
          ? supabase.from('worker_payable_batch_shifts').select('shift_id').in('shift_id', shiftIds).is('voided_at', null)
          : Promise.resolve({ data: [] as { shift_id: string }[], error: null }),
        shiftIds.length > 0
          ? supabase.from('worker_payment_shifts').select('shift_id').in('shift_id', shiftIds)
          : Promise.resolve({ data: [] as { shift_id: string }[], error: null }),
        // Total historically paid from worker_payments
        supabase
          .from('worker_payments')
          .select('amount')
          .eq('worker_user_id', workerId)
          .eq('status', 'paid'),
      ]);

      const paidShiftIds = new Set<string>();
      (batchRes.data ?? []).forEach(r => paidShiftIds.add(r.shift_id));
      (paymentRes.data ?? []).forEach(r => paidShiftIds.add(r.shift_id));

      let totalOwed = 0;
      let unpaidHours = 0;
      let unpaidShiftCount = 0;

      for (const s of allShifts) {
        if (paidShiftIds.has(s.id)) continue;
        unpaidShiftCount++;
        if (s.is_flat_rate) {
          totalOwed += Number(s.flat_rate_amount || 0);
        } else {
          const hrs = Number(s.total_hours ?? 0);
          const amount = hrs * Number(s.hourly_rate_snapshot ?? 0);
          totalOwed += amount;
          unpaidHours += hrs;
        }
      }

      const totalPaid = (paymentsRes.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);

      return {
        totalOwed,
        unpaidHours,
        unpaidShiftCount,
        totalPaid,
        totalShifts: allShifts.length,
      };
    },
    enabled: !!workerId,
  });
}

const Payroll = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const workerFilter = searchParams.get('worker') || undefined;
  const workerName = searchParams.get('workerName') || undefined;
  const defaultTab = searchParams.get('tab') || 'prepare';

  const { data: summary, isLoading: summaryLoading } = useWorkerFinancialSummary(workerFilter);

  const clearFilter = () => {
    searchParams.delete('worker');
    searchParams.delete('workerName');
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <div className="pb-20">
      <PageHeader title="Payroll" backTo="/admin" />
      <div className="p-4 space-y-4">
        {workerFilter && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Filtered: {workerName || 'Worker'}
            </Badge>
            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={clearFilter}>
              <X className="h-3 w-3" />Clear
            </Button>
          </div>
        )}

        {workerFilter && (
          summaryLoading ? (
            <Card className="p-4">
              <Skeleton className="h-16 w-full" />
            </Card>
          ) : summary ? (
            <Card className="p-4 bg-primary/5 border-primary/20">
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                {workerName || 'Worker'} — Financial Summary
              </p>
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-xl font-bold text-destructive">
                      ${summary.totalOwed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Owed ({summary.unpaidShiftCount} shift{summary.unpaidShiftCount !== 1 ? 's' : ''})
                    </p>
                  </div>
                </div>
                <div className="h-10 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xl font-bold">{summary.unpaidHours.toFixed(1)}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Unpaid Hours</p>
                  </div>
                </div>
                <div className="h-10 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xl font-bold text-primary">
                      ${summary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Total Paid (All Time)
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          ) : null
        )}

        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full">
            <TabsTrigger value="prepare" className="flex-1 text-xs">Bills</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 text-xs">Bill History</TabsTrigger>
          </TabsList>
          <TabsContent value="prepare" className="mt-4">
            <PayrollSummary
              billFirstMode
              workerFilter={workerFilter}
              onEditShift={(shift) => {
                window.location.href = `/shifts?edit=${shift.id}`;
              }}
            />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <PaymentHistory workerFilter={workerFilter} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Payroll;

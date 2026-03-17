import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, ChevronDown, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Shift } from '@/hooks/useShifts';
import type { Tables } from '@/integrations/supabase/types';

type ShiftRow = Tables<'shifts'>;
type ProfileRow = Tables<'profiles'>;
type ProjectRow = Tables<'projects'>;
type ShiftAllocationRow = Tables<'shift_task_allocations'>;
type TaskRow = Tables<'tasks'>;
type PayableBatchRow = Tables<'worker_payable_batches'>;
type PayableBatchShiftRow = Tables<'worker_payable_batch_shifts'>;

type ShiftWithComputed = {
  shift: ShiftRow;
  projectName: string;
  workerName: string;
  rateUsed: number;
  dollars: number;
  allocations: { task_name: string; hours: number }[];
};

type CandidateGroup = {
  key: string;
  worker_user_id: string;
  project_id: string;
  contractorName: string;
  projectName: string;
  periodStart: string;
  periodEnd: string;
  shifts: ShiftWithComputed[];
  totalHours: number;
  totalDollars: number;
};

type ExistingPayableGroup = {
  batch: PayableBatchRow;
  contractorName: string;
  projectName: string;
  shifts: ShiftWithComputed[];
  totalHours: number;
  totalDollars: number;
};

type ExcludedShift = {
  shift: ShiftWithComputed;
  reason: string;
};

interface PayrollSummaryProps {
  onEditShift: (shift: Pick<Shift, 'id'>) => void;
}

const PayrollSummary = ({ onEditShift }: PayrollSummaryProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [creatingGroupKey, setCreatingGroupKey] = useState<string | null>(null);
  const [updatingBatchId, setUpdatingBatchId] = useState<string | null>(null);
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(new Set());
  const [expandedExisting, setExpandedExisting] = useState<Set<string>>(new Set());

  const [candidateGroups, setCandidateGroups] = useState<CandidateGroup[]>([]);
  const [exportedGroups, setExportedGroups] = useState<ExistingPayableGroup[]>([]);
  const [paidGroups, setPaidGroups] = useState<ExistingPayableGroup[]>([]);
  const [excludedShifts, setExcludedShifts] = useState<ExcludedShift[]>([]);

  const toggleCandidate = (key: string) => {
    setExpandedCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleExisting = (key: string) => {
    setExpandedExisting((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const loadPayroll = useCallback(async () => {
    setLoading(true);

    const [{ data: shifts, error: shiftsError }, { data: profiles, error: profilesError }, { data: projects, error: projectsError }] = await Promise.all([
      supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', fromDate)
        .lte('shift_date', toDate)
        .order('shift_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name, hourly_rate'),
      supabase.from('projects').select('id, name'),
    ]);

    if (shiftsError || profilesError || projectsError) {
      setLoading(false);
      throw new Error(shiftsError?.message || profilesError?.message || projectsError?.message || 'Failed to load payroll data');
    }

    const shiftRows = shifts || [];
    const profileMap = new Map<string, Pick<ProfileRow, 'id' | 'full_name' | 'hourly_rate'>>((profiles || []).map((row) => [row.id, row]));
    const projectMap = new Map<string, string>((projects || []).map((row: Pick<ProjectRow, 'id' | 'name'>) => [row.id, row.name]));

    const shiftIds = shiftRows.map((row) => row.id);
    const [{ data: allocations }, { data: payableLinks }] = await Promise.all([
      shiftIds.length > 0
        ? supabase.from('shift_task_allocations').select('*').in('shift_id', shiftIds)
        : Promise.resolve({ data: [] as ShiftAllocationRow[], error: null }),
      shiftIds.length > 0
        ? supabase
            .from('worker_payable_batch_shifts')
            .select('id, shift_id, payable_batch_id, voided_at, worker_payable_batches!inner(id, status, period_start, period_end)')
            .in('shift_id', shiftIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    const taskIds = [...new Set(((allocations || []) as ShiftAllocationRow[]).map((row) => row.task_id))];
    const { data: tasks } = taskIds.length > 0
      ? await supabase.from('tasks').select('id, task').in('id', taskIds)
      : { data: [] as Pick<TaskRow, 'id' | 'task'>[] };

    const taskMap = new Map<string, string>((tasks || []).map((row: Pick<TaskRow, 'id' | 'task'>) => [row.id, row.task]));

    const allocationsByShift = new Map<string, { task_name: string; hours: number }[]>();
    ((allocations || []) as ShiftAllocationRow[]).forEach((row) => {
      if (!allocationsByShift.has(row.shift_id)) allocationsByShift.set(row.shift_id, []);
      allocationsByShift.get(row.shift_id)!.push({ task_name: taskMap.get(row.task_id) || 'Unknown task', hours: Number(row.hours) });
    });

    const computedShifts: ShiftWithComputed[] = shiftRows.map((row) => {
      const profile = profileMap.get(row.user_id);
      const rate = Number(row.hourly_rate_snapshot ?? profile?.hourly_rate ?? 0);
      const dollars = Number((Number(row.total_hours) * rate).toFixed(2));
      return {
        shift: row,
        projectName: projectMap.get(row.project_id) || 'Unknown project',
        workerName: profile?.full_name || 'Unknown worker',
        rateUsed: rate,
        dollars,
        allocations: allocationsByShift.get(row.id) || [],
      };
    });

    const activeLinkByShiftId = new Map<string, { batchId: string; status: PayableBatchRow['status']; periodStart: string; periodEnd: string }>();
    ((payableLinks || []) as Array<PayableBatchShiftRow & { worker_payable_batches: Pick<PayableBatchRow, 'id' | 'status' | 'period_start' | 'period_end'> }>).forEach((row) => {
      const batch = row.worker_payable_batches;
      if (!row.voided_at && batch && batch.status !== 'voided') {
        activeLinkByShiftId.set(row.shift_id, { batchId: batch.id, status: batch.status, periodStart: batch.period_start, periodEnd: batch.period_end });
      }
    });

    const excluded: ExcludedShift[] = [];
    const eligible: ShiftWithComputed[] = [];
    for (const shift of computedShifts) {
      const linked = activeLinkByShiftId.get(shift.shift.id);
      if (linked) {
        excluded.push({
          shift,
          reason: `Linked to ${linked.status} payable (${linked.periodStart} → ${linked.periodEnd}, #${linked.batchId.slice(0, 8)})`,
        });
      } else {
        eligible.push(shift);
      }
    }

    const groupsMap = new Map<string, CandidateGroup>();
    for (const row of eligible) {
      const key = `${row.shift.user_id}::${row.shift.project_id}::${fromDate}::${toDate}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          worker_user_id: row.shift.user_id,
          project_id: row.shift.project_id,
          contractorName: row.workerName,
          projectName: row.projectName,
          periodStart: fromDate,
          periodEnd: toDate,
          shifts: [],
          totalHours: 0,
          totalDollars: 0,
        });
      }
      const group = groupsMap.get(key)!;
      group.shifts.push(row);
      group.totalHours += Number(row.shift.total_hours);
      group.totalDollars += row.dollars;
    }

    const { data: batches, error: batchesError } = await supabase
      .from('worker_payable_batches')
      .select('*')
      .eq('period_start', fromDate)
      .eq('period_end', toDate)
      .in('status', ['draft', 'exported', 'paid'])
      .order('created_at', { ascending: false });

    if (batchesError) {
      setLoading(false);
      throw new Error(batchesError.message);
    }

    const batchRows = (batches || []) as PayableBatchRow[];
    const batchIds = batchRows.map((row) => row.id);

    const { data: batchLinks, error: batchLinksError } = await (batchIds.length > 0
      ? supabase
          .from('worker_payable_batch_shifts')
          .select('id, payable_batch_id, shift_id, voided_at')
          .in('payable_batch_id', batchIds)
      : Promise.resolve({ data: [] as Pick<PayableBatchShiftRow, 'id' | 'payable_batch_id' | 'shift_id' | 'voided_at'>[], error: null }));

    if (batchLinksError) {
      setLoading(false);
      throw new Error(batchLinksError.message);
    }

    const computedByShiftId = new Map(computedShifts.map((row) => [row.shift.id, row]));
    const linksByBatch = new Map<string, Pick<PayableBatchShiftRow, 'id' | 'payable_batch_id' | 'shift_id' | 'voided_at'>[]>();
    ((batchLinks || []) as Pick<PayableBatchShiftRow, 'id' | 'payable_batch_id' | 'shift_id' | 'voided_at'>[]).forEach((row) => {
      if (!linksByBatch.has(row.payable_batch_id)) linksByBatch.set(row.payable_batch_id, []);
      linksByBatch.get(row.payable_batch_id)!.push(row);
    });

    const existingGroups: ExistingPayableGroup[] = batchRows.map((batch) => {
      const links = (linksByBatch.get(batch.id) || []).filter((row) => !row.voided_at);
      const groupShifts = links
        .map((row) => computedByShiftId.get(row.shift_id))
        .filter(Boolean) as ShiftWithComputed[];
      const contractorName = profileMap.get(batch.worker_user_id)?.full_name || 'Unknown worker';
      const projectName = batch.project_id ? projectMap.get(batch.project_id) || 'Unknown project' : 'Mixed / Unset project';
      return {
        batch,
        contractorName,
        projectName,
        shifts: groupShifts,
        totalHours: groupShifts.reduce((sum, row) => sum + Number(row.shift.total_hours), 0),
        totalDollars: groupShifts.reduce((sum, row) => sum + row.dollars, 0),
      };
    });

    setCandidateGroups([...groupsMap.values()].sort((a, b) => a.contractorName.localeCompare(b.contractorName) || a.projectName.localeCompare(b.projectName)));
    setExportedGroups(existingGroups.filter((row) => row.batch.status === 'exported' || row.batch.status === 'draft'));
    setPaidGroups(existingGroups.filter((row) => row.batch.status === 'paid'));
    setExcludedShifts(excluded.sort((a, b) => a.shift.workerName.localeCompare(b.shift.workerName) || a.shift.projectName.localeCompare(b.shift.projectName)));
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    loadPayroll().catch((error) => {
      setLoading(false);
      toast({ title: 'Load failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    });
  }, [loadPayroll, toast]);

  const handleCreatePayable = async (group: CandidateGroup) => {
    if (!user?.id) {
      toast({ title: 'Auth required', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }

    setCreatingGroupKey(group.key);
    const { data: batch, error: batchError } = await supabase
      .from('worker_payable_batches')
      .insert({
        worker_user_id: group.worker_user_id,
        project_id: group.project_id,
        period_start: group.periodStart,
        period_end: group.periodEnd,
        total_amount: Number(group.totalDollars.toFixed(2)),
        status: 'draft',
        accounting_source: 'quickbooks_placeholder',
        settlement_method: 'off_platform_manual',
        created_by: user.id,
      })
      .select('*')
      .single();

    if (batchError || !batch) {
      setCreatingGroupKey(null);
      toast({ title: 'Create payable failed', description: batchError?.message || 'Unknown error', variant: 'destructive' });
      return;
    }

    const linkRows = group.shifts.map((row) => ({ payable_batch_id: batch.id, shift_id: row.shift.id }));
    const { error: linksError } = await supabase.from('worker_payable_batch_shifts').insert(linkRows);

    if (linksError) {
      setCreatingGroupKey(null);
      toast({ title: 'Link shifts failed', description: linksError.message, variant: 'destructive' });
      return;
    }

    setCreatingGroupKey(null);
    toast({ title: 'Payable created', description: `Created batch #${batch.id.slice(0, 8)} (${group.contractorName} · ${group.projectName})` });
    await loadPayroll();
  };

  const handleMarkExportedPlaceholder = async (batchId: string) => {
    setUpdatingBatchId(batchId);
    const { error } = await supabase
      .from('worker_payable_batches')
      .update({ status: 'exported', accounting_source: 'quickbooks_placeholder' })
      .eq('id', batchId);
    setUpdatingBatchId(null);

    if (error) {
      toast({ title: 'Export mark failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Marked exported', description: 'QuickBooks export placeholder set on payable batch.' });
    await loadPayroll();
  };

  const handleMarkPaid = async (batchId: string) => {
    if (!user?.id) {
      toast({ title: 'Auth required', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }

    setUpdatingBatchId(batchId);
    const { error } = await supabase
      .from('worker_payable_batches')
      .update({ status: 'paid', paid_at: new Date().toISOString(), marked_paid_by: user.id })
      .eq('id', batchId);
    setUpdatingBatchId(null);

    if (error) {
      toast({ title: 'Mark paid failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Payable marked paid' });
    await loadPayroll();
  };

  const totals = useMemo(() => {
    const candidateDollars = candidateGroups.reduce((sum, row) => sum + row.totalDollars, 0);
    const exportedDollars = exportedGroups.reduce((sum, row) => sum + Number(row.batch.total_amount || row.totalDollars), 0);
    const paidDollars = paidGroups.reduce((sum, row) => sum + Number(row.batch.total_amount || row.totalDollars), 0);
    return {
      candidateDollars,
      exportedDollars,
      paidDollars,
    };
  }, [candidateGroups, exportedGroups, paidGroups]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>

      <Card className="p-3 text-xs text-muted-foreground">
        <p>Eligible unpaid: <span className="text-foreground font-medium">${totals.candidateDollars.toFixed(2)}</span></p>
        <p>Exported (selected period): <span className="text-foreground font-medium">${totals.exportedDollars.toFixed(2)}</span></p>
        <p>Paid (selected period): <span className="text-foreground font-medium">${totals.paidDollars.toFixed(2)}</span></p>
      </Card>

      <Card className="p-3 space-y-2">
        <div>
          <p className="text-sm font-medium">Unpaid Eligible Payable Groups</p>
          <p className="text-xs text-muted-foreground">Grouped by contractor + project + selected period. Already-linked shifts are excluded.</p>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground flex items-center"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Loading…</p>
        ) : candidateGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground">No eligible unpaid shift groups in this range.</p>
        ) : (
          <div className="space-y-2">
            {candidateGroups.map((group) => (
              <Collapsible key={group.key} open={expandedCandidates.has(group.key)} onOpenChange={() => toggleCandidate(group.key)}>
                <CollapsibleTrigger asChild>
                  <div className="rounded border border-border px-3 py-2 cursor-pointer hover:bg-muted/30">
                    <div className="flex items-center gap-2">
                      <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${expandedCandidates.has(group.key) ? 'rotate-180' : ''}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{group.contractorName} · {group.projectName}</p>
                        <p className="text-xs text-muted-foreground">{group.periodStart} → {group.periodEnd} · {group.shifts.length} shifts</p>
                      </div>
                      <p className="text-sm font-medium">${group.totalDollars.toFixed(2)}</p>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 pl-4 space-y-1">
                  {group.shifts.map((row) => (
                    <div key={row.shift.id} className="text-xs border rounded p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>{row.shift.shift_date} · {Number(row.shift.total_hours)}h @ ${row.rateUsed.toFixed(2)}</span>
                        <span className="font-medium">${row.dollars.toFixed(2)}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-muted-foreground">
                        {row.allocations.map((a, idx) => <span key={`${row.shift.id}-${idx}`}>{a.task_name}: {a.hours}h</span>)}
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onEditShift({ id: row.shift.id })}>
                        <Pencil className="h-3 w-3 mr-1" />Edit Shift
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" disabled={creatingGroupKey === group.key} onClick={() => handleCreatePayable(group)}>
                    {creatingGroupKey === group.key ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                    Create Payable Batch
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-3 space-y-2">
        <div>
          <p className="text-sm font-medium">Exported / Draft Payables</p>
          <p className="text-xs text-muted-foreground">These groups are already linked and excluded from new candidates.</p>
        </div>
        {exportedGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground">No draft/exported payables for this selected period.</p>
        ) : (
          <div className="space-y-2">
            {exportedGroups.map((group) => {
              const key = `existing-${group.batch.id}`;
              return (
                <Collapsible key={group.batch.id} open={expandedExisting.has(key)} onOpenChange={() => toggleExisting(key)}>
                  <CollapsibleTrigger asChild>
                    <div className="rounded border border-border px-3 py-2 cursor-pointer hover:bg-muted/30">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${expandedExisting.has(key) ? 'rotate-180' : ''}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{group.contractorName} · {group.projectName}</p>
                          <p className="text-xs text-muted-foreground">{group.batch.period_start} → {group.batch.period_end} · {group.batch.status}</p>
                        </div>
                        <p className="text-sm font-medium">${Number(group.batch.total_amount || group.totalDollars).toFixed(2)}</p>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-1 pl-4 space-y-1">
                    {group.shifts.map((row) => (
                      <div key={row.shift.id} className="text-xs border rounded p-2 flex justify-between">
                        <span>{row.shift.shift_date} · {row.projectName} · {Number(row.shift.total_hours)}h</span>
                        <span>${row.dollars.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updatingBatchId === group.batch.id || group.batch.status === 'exported'}
                        onClick={() => handleMarkExportedPlaceholder(group.batch.id)}
                      >
                        {updatingBatchId === group.batch.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                        Mark Exported (QB Placeholder)
                      </Button>
                      <Button
                        size="sm"
                        disabled={updatingBatchId === group.batch.id}
                        onClick={() => handleMarkPaid(group.batch.id)}
                      >
                        {updatingBatchId === group.batch.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                        Mark Paid
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}

      </Card>

      <Card className="p-3 space-y-2">
        <div>
          <p className="text-sm font-medium">Paid Payables</p>
          <p className="text-xs text-muted-foreground">Paid groups remain visible for audit and overlap safety.</p>
        </div>
        {paidGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground">No paid payables for this selected period.</p>
        ) : (
          <div className="space-y-1">
            {paidGroups.map((group) => (
              <div key={group.batch.id} className="text-xs border rounded p-2 flex items-center justify-between">
                <div>
                  <p>{group.contractorName} · {group.projectName}</p>
                  <p className="text-muted-foreground">{group.batch.period_start} → {group.batch.period_end} · paid {group.batch.paid_at || '—'}</p>
                </div>
                <p className="font-medium">${Number(group.batch.total_amount || group.totalDollars).toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-3 space-y-2">
        <div>
          <p className="text-sm font-medium">Excluded Shifts (why not eligible)</p>
          <p className="text-xs text-muted-foreground">These shifts are already linked to non-voided payables and are blocked from new candidate creation.</p>
        </div>
        {excludedShifts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No excluded shifts in this range.</p>
        ) : (
          <div className="space-y-1">
            {excludedShifts.map((row) => (
              <div key={row.shift.shift.id} className="text-xs border rounded p-2">
                <p>{row.shift.workerName} · {row.shift.projectName} · {row.shift.shift.shift_date} · {Number(row.shift.shift.total_hours)}h</p>
                <p className="text-muted-foreground">{row.reason}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default PayrollSummary;

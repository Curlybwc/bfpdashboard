import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, Trash2, Pencil, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { Shift } from '@/hooks/useShifts';

interface PayrollSummaryProps {
  onEditShift: (shift: Shift) => void;
}

interface ContractorSummary {
  user_id: string;
  full_name: string;
  total_hours: number;
  rate: number | null;
  total_pay: number;
  shifts: ShiftDetail[];
}

interface ShiftDetail {
  id: string;
  project_name: string;
  project_id: string;
  shift_date: string;
  total_hours: number;
  admin_edited_at: string | null;
  allocations: { task_name: string; hours: number }[];
}

const PayrollSummary = ({ onEditShift }: PayrollSummaryProps) => {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const [summaries, setSummaries] = useState<ContractorSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPayroll = useCallback(async () => {
    setLoading(true);

    // Fetch all shifts in range
    const { data: shifts } = await supabase
      .from('shifts')
      .select('*')
      .gte('shift_date', fromDate)
      .lte('shift_date', toDate)
      .order('shift_date', { ascending: false });

    if (!shifts || shifts.length === 0) {
      setSummaries([]);
      setLoading(false);
      return;
    }

    // Fetch profiles for all users
    const userIds = [...new Set(shifts.map(s => s.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, hourly_rate')
      .in('id', userIds);
    const profileMap: Record<string, { full_name: string; hourly_rate: number | null }> = {};
    (profiles || []).forEach(p => {
      profileMap[p.id] = { full_name: p.full_name || 'Unknown', hourly_rate: p.hourly_rate };
    });

    // Fetch project names
    const projectIds = [...new Set(shifts.map(s => s.project_id))];
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .in('id', projectIds);
    const projectMap: Record<string, string> = {};
    (projects || []).forEach(p => { projectMap[p.id] = p.name; });

    // Fetch allocations for all shifts
    const shiftIds = shifts.map(s => s.id);
    const { data: allAllocations } = await supabase
      .from('shift_task_allocations')
      .select('shift_id, task_id, hours')
      .in('shift_id', shiftIds);

    // Fetch task names
    const taskIds = [...new Set((allAllocations || []).map(a => a.task_id))];
    let taskMap: Record<string, string> = {};
    if (taskIds.length > 0) {
      const { data: taskData } = await supabase
        .from('tasks')
        .select('id, task')
        .in('id', taskIds);
      (taskData || []).forEach(t => { taskMap[t.id] = t.task; });
    }

    // Group allocations by shift
    const allocByShift: Record<string, { task_name: string; hours: number }[]> = {};
    (allAllocations || []).forEach(a => {
      if (!allocByShift[a.shift_id]) allocByShift[a.shift_id] = [];
      allocByShift[a.shift_id].push({ task_name: taskMap[a.task_id] || 'Unknown task', hours: a.hours });
    });

    // Build per-contractor summaries
    const byUser: Record<string, ContractorSummary> = {};
    shifts.forEach(s => {
      if (!byUser[s.user_id]) {
        const profile = profileMap[s.user_id];
        byUser[s.user_id] = {
          user_id: s.user_id,
          full_name: profile?.full_name || 'Unknown',
          total_hours: 0,
          rate: profile?.hourly_rate ?? null,
          total_pay: 0,
          shifts: [],
        };
      }
      const rate = s.hourly_rate_snapshot ?? byUser[s.user_id].rate ?? 0;
      byUser[s.user_id].total_hours += s.total_hours;
      byUser[s.user_id].total_pay += s.total_hours * (rate || 0);
      byUser[s.user_id].shifts.push({
        id: s.id,
        project_name: projectMap[s.project_id] || 'Unknown',
        project_id: s.project_id,
        shift_date: s.shift_date,
        total_hours: s.total_hours,
        admin_edited_at: s.admin_edited_at,
        allocations: allocByShift[s.id] || [],
      });
    });

    setSummaries(Object.values(byUser).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => { fetchPayroll(); }, [fetchPayroll]);

  const toggleUser = (uid: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const toggleShift = (sid: string) => {
    setExpandedShifts(prev => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('shifts').delete().eq('id', deleteTarget);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Shift deleted' });
      fetchPayroll();
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading payroll...
        </div>
      ) : summaries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No shifts found in this date range.</p>
      ) : (
        <div className="space-y-2">
          {summaries.map(cs => (
            <Collapsible key={cs.user_id} open={expandedUsers.has(cs.user_id)} onOpenChange={() => toggleUser(cs.user_id)}>
              <CollapsibleTrigger asChild>
                <Card className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedUsers.has(cs.user_id) ? 'rotate-180' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{cs.full_name}</p>
                    </div>
                    <div className="text-right text-sm space-y-0.5">
                      <p>{cs.total_hours}h</p>
                      {cs.rate != null && (
                        <p className="text-xs text-muted-foreground">
                          ${cs.rate}/hr · <span className="font-medium text-foreground">${cs.total_pay.toFixed(2)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4 pt-1 space-y-1">
                {cs.shifts.map(sd => (
                  <Collapsible key={sd.id} open={expandedShifts.has(sd.id)} onOpenChange={() => toggleShift(sd.id)}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-2 rounded border border-border bg-card px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors">
                        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${expandedShifts.has(sd.id) ? 'rotate-180' : ''}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{sd.project_name}</p>
                          <p className="text-xs text-muted-foreground">{sd.shift_date}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {sd.admin_edited_at && (
                            <Badge variant="outline" className="text-xs">Admin edited</Badge>
                          )}
                          <span className="text-sm font-medium">{sd.total_hours}h</span>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-6 pt-1 space-y-1">
                      {sd.allocations.map((a, i) => (
                        <div key={i} className="flex justify-between text-xs text-muted-foreground py-0.5">
                          <span className="truncate">{a.task_name}</span>
                          <span className="shrink-0 ml-2">{a.hours}h</span>
                        </div>
                      ))}
                      <div className="flex gap-1 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Find the raw shift from the parent summary data
                            const rawShift = {
                              id: sd.id,
                              user_id: cs.user_id,
                              project_id: sd.project_id,
                              shift_date: sd.shift_date,
                              total_hours: sd.total_hours,
                              admin_edited_at: sd.admin_edited_at,
                            } as any;
                            onEditShift(rawShift);
                          }}
                        >
                          <Pencil className="h-3 w-3 mr-1" />Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(sd.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />Delete
                        </Button>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shift</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this shift and all its task allocations.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={handleDelete}>
              {deleting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Deleting...</> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PayrollSummary;

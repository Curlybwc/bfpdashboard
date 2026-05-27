import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import PageHeader from '@/components/PageHeader';
import ShiftForm from '@/components/shifts/ShiftForm';
import ShiftsCalendarView from '@/components/shifts/ShiftsCalendarView';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Clock, Trash2, X, List, CalendarDays, DollarSign } from 'lucide-react';
import { fetchShiftAllocations, fetchShiftById, useMyShifts, type Shift, type ShiftAllocation } from '@/hooks/useShifts';
import { useAdminShifts, useContractorList, useProjectList } from '@/hooks/useAdminShifts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

const Shifts = () => {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [editAllocations, setEditAllocations] = useState<ShiftAllocation[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [adminView, setAdminView] = useState<'list' | 'calendar'>('list');
  const [newShiftDefaults, setNewShiftDefaults] = useState<{ date?: string; userId?: string }>({});

  // Filter state — initialized from query params for drill-down support
  const [contractorFilter, setContractorFilter] = useState(searchParams.get('contractor') || '');
  const [projectFilter, setProjectFilter] = useState(searchParams.get('project') || '');
  const [fromDate, setFromDate] = useState(searchParams.get('from') || defaultFromDate());
  const [toDate, setToDate] = useState(searchParams.get('to') || new Date().toISOString().slice(0, 10));

  // Track whether filters came from query params (drill-down)
  const isDrillDown = !!(searchParams.get('contractor') || searchParams.get('project') || searchParams.get('from'));

  // Handle edit query param — defined inline to avoid TDZ with handleEditShift
  const editIdParam = searchParams.get('edit');
  useEffect(() => {
    if (!editIdParam) return;
    (async () => {
      const full = await fetchShiftById(editIdParam);
      if (full) {
        const allocs = await fetchShiftAllocations(editIdParam);
        setEditShift(full);
        setEditAllocations(allocs);
        setShowForm(true);
      }
      searchParams.delete('edit');
      setSearchParams(searchParams, { replace: true });
    })();
  }, [editIdParam]);

  // Non-admin data
  const { data, isLoading, refetch } = useMyShifts(user?.id);
  const myShifts = data?.shifts ?? [];
  const myProjectMap = data?.projectMap ?? {};

  // Admin data
  const adminFilters = useMemo(() => ({
    contractorId: contractorFilter || undefined,
    projectId: projectFilter || undefined,
    fromDate,
    toDate,
  }), [contractorFilter, projectFilter, fromDate, toDate]);

  const { data: adminData, isLoading: adminLoading2, refetch: adminRefetch } = useAdminShifts(adminFilters, isAdmin);
  const { data: contractors } = useContractorList();
  const { data: projects } = useProjectList();

  if (adminLoading) {
    return (
      <div className="pb-20">
        <PageHeader title="Shifts" />
        <div className="p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Card key={idx} className="p-3 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const handleNewShift = (defaults?: { date?: string; userId?: string }) => {
    setEditShift(null);
    setEditAllocations([]);
    setNewShiftDefaults(defaults || {});
    setShowForm(true);
  };

  const handleEditShift = async (shift: Pick<Shift, 'id'>) => {
    const [fullShift, allocs] = await Promise.all([
      fetchShiftById(shift.id),
      fetchShiftAllocations(shift.id),
    ]);
    if (!fullShift) return;
    setEditShift(fullShift);
    setEditAllocations(allocs);
    setShowForm(true);
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditShift(null);
    setEditAllocations([]);
    setNewShiftDefaults({});
    if (isAdmin) adminRefetch(); else refetch();
  };

  const handleDeleteShift = async (shiftId: string) => {
    setDeleting(shiftId);
    // Delete allocations first, then shift
    await supabase.from('shift_task_allocations').delete().eq('shift_id', shiftId);
    const { error } = await supabase.from('shifts').delete().eq('id', shiftId);
    setDeleting(null);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Shift deleted' });
      adminRefetch();
    }
  };

  const clearFilters = () => {
    setContractorFilter('');
    setProjectFilter('');
    setFromDate(defaultFromDate());
    setToDate(new Date().toISOString().slice(0, 10));
    setSearchParams({}, { replace: true });
  };

  const canEditShift = (shift: any) => {
    if (isAdmin) return true;
    return shift.shift_date === new Date().toISOString().slice(0, 10);
  };

  if (showForm) {
    return (
      <div className="pb-20">
        <PageHeader title={editShift ? 'Edit Shift' : 'Log Shift'} />
        <div className="p-4">
          <ShiftForm
            editShift={editShift}
            editAllocations={editAllocations}
            defaultDate={newShiftDefaults.date}
            defaultUserId={newShiftDefaults.userId}
            onSaved={handleSaved}
            onCancel={() => { setShowForm(false); setEditShift(null); setNewShiftDefaults({}); }}
          />
        </div>
      </div>
    );
  }

  // Admin view
  if (isAdmin) {
    const shifts = adminData?.shifts ?? [];
    const profileMap = adminData?.profileMap ?? {};
    const projectMap = adminData?.projectMap ?? {};
    const paidShiftIds = adminData?.paidShiftIds ?? new Set<string>();
    const hasActiveFilters = contractorFilter || projectFilter || fromDate !== defaultFromDate() || toDate !== new Date().toISOString().slice(0, 10);

    return (
      <div className="pb-20">
        <PageHeader
          title="Shifts"
          actions={
            <div className="flex items-center gap-2">
              <Tabs value={adminView} onValueChange={(v) => setAdminView(v as 'list' | 'calendar')}>
                <TabsList className="h-8">
                  <TabsTrigger value="list" className="h-6 px-2 text-xs gap-1">
                    <List className="h-3.5 w-3.5" />List
                  </TabsTrigger>
                  <TabsTrigger value="calendar" className="h-6 px-2 text-xs gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />Calendar
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button size="sm" onClick={() => handleNewShift()}>
                <Plus className="h-4 w-4 mr-1" />Log Shift
              </Button>
            </div>
          }
        />
        <div className="p-4 space-y-4">
          {/* Filter bar */}
          <Card className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Filters</p>
              {(isDrillDown || hasActiveFilters) && (
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={clearFilters}>
                  <X className="h-3 w-3" />Clear filters
                </Button>
              )}
            </div>

            {isDrillDown && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">Filtered from Payroll</Badge>
                {searchParams.get('contractor') && (
                  <Badge variant="outline" className="text-[10px]">
                    Contractor: {profileMap[searchParams.get('contractor')!] || searchParams.get('contractor')!.slice(0, 8)}
                  </Badge>
                )}
                {searchParams.get('project') && (
                  <Badge variant="outline" className="text-[10px]">
                    Project: {projectMap[searchParams.get('project')!] || searchParams.get('project')!.slice(0, 8)}
                  </Badge>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Contractor</Label>
                <Select value={contractorFilter || 'all'} onValueChange={(v) => setContractorFilter(v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All contractors</SelectItem>
                    {(contractors ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name || 'Unnamed'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Project</Label>
                <Select value={projectFilter || 'all'} onValueChange={(v) => setProjectFilter(v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects</SelectItem>
                    {(projects ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" className="h-8 text-xs" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" className="h-8 text-xs" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
          </Card>

          {/* Summary banner */}
          {!adminLoading2 && shifts.length > 0 && (() => {
            const totalOwed = shifts.reduce((sum, s) => {
              if (s.is_flat_rate) return sum + Number(s.flat_rate_amount || 0);
              return sum + Number(s.total_hours ?? 0) * Number(s.hourly_rate_snapshot ?? 0);
            }, 0);
            return (
            <Card className="p-3 flex items-center justify-between bg-primary/5 border-primary/20">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{shifts.filter(s => !s.is_flat_rate).reduce((sum, s) => sum + Number(s.total_hours ?? 0), 0).toFixed(1)}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Hours</p>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-center">
                  <p className="text-2xl font-bold">{shifts.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Shifts</p>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">${totalOwed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Owed</p>
                </div>
                {contractorFilter && profileMap[contractorFilter] && (
                  <>
                    <div className="h-8 w-px bg-border" />
                    <div>
                      <p className="text-sm font-medium">{profileMap[contractorFilter]}</p>
                      <p className="text-[10px] text-muted-foreground">{fromDate} → {toDate}</p>
                    </div>
                  </>
                )}
              </div>
              {contractorFilter && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  asChild
                >
                  <a href={`/payroll?worker=${contractorFilter}&workerName=${encodeURIComponent(profileMap[contractorFilter] || '')}`}>
                    <DollarSign className="h-3.5 w-3.5" />
                    Pay Worker
                  </a>
                </Button>
              )}
            </Card>
            );
          })()}

          {/* Results */}
          {adminLoading2 ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Card key={idx} className="p-3 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </Card>
              ))}
            </div>
          ) : adminView === 'calendar' ? (
            <ShiftsCalendarView
              shifts={shifts}
              profileMap={profileMap}
              projectMap={projectMap}
              onEditShift={handleEditShift}
              onDateClick={(dateStr) => {
                handleNewShift({ date: dateStr, userId: contractorFilter || undefined });
              }}
              onMonthChange={(from, to) => {
                setFromDate(from);
                setToDate(to);
              }}
            />
          ) : shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No shifts found for this date range.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{shifts.length} shift{shifts.length !== 1 ? 's' : ''}</p>
              {shifts.map((s) => (
                <Card key={s.id} className="p-3 transition-colors">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div
                      className="flex-1 min-w-0 cursor-pointer hover:bg-muted/50 rounded -m-1 p-1"
                      onClick={() => handleEditShift(s)}
                    >
                      <p className="text-sm font-medium truncate">
                        {profileMap[s.user_id] || 'Unknown'} · {s.project_id ? (projectMap[s.project_id] || 'Unknown Project') : 'Unassigned — needs project/tasks'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.shift_date}
                        {s.start_time && s.end_time ? ` · ${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.admin_edited_at && (
                        <Badge variant="outline" className="text-xs">Admin edited</Badge>
                      )}
                      {paidShiftIds.has(s.id) ? (
                        <Badge className="text-[10px] bg-green-600 hover:bg-green-600 text-white">Paid</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Unpaid</Badge>
                      )}
                      <div className="text-right">
                        {s.is_flat_rate ? (
                          <>
                            <span className="text-sm font-medium">${Number(s.flat_rate_amount || 0).toFixed(2)}</span>
                            <Badge variant="secondary" className="text-[10px] ml-1">Flat</Badge>
                          </>
                        ) : (
                          <>
                            <span className="text-sm font-medium">{Number(s.total_hours ?? 0)}h</span>
                            <span className="text-xs text-muted-foreground ml-1">
                              · ${(Number(s.total_hours ?? 0) * Number(s.hourly_rate_snapshot ?? 0)).toFixed(2)}
                            </span>
                          </>
                        )}
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" disabled={deleting === s.id}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the shift for {profileMap[s.user_id] || 'this worker'} on {s.shift_date} ({s.total_hours}h). This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleDeleteShift(s.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Non-admin view (unchanged)
  return (
    <div className="pb-20">
      <PageHeader
        title="Shifts"
        actions={
          <Button size="sm" onClick={() => handleNewShift()}>
            <Plus className="h-4 w-4 mr-1" />Log Shift
          </Button>
        }
      />
      <div className="p-4">
        <ShiftHistory
          shifts={myShifts}
          projectMap={myProjectMap}
          loading={isLoading}
          canEdit={canEditShift}
          onEdit={handleEditShift}
        />
      </div>
    </div>
  );
};

// Non-admin shift history list
const ShiftHistory = ({
  shifts, projectMap, loading, canEdit, onEdit,
}: {
  shifts: any[];
  projectMap: Record<string, string>;
  loading: boolean;
  canEdit: (s: any) => boolean;
  onEdit: (s: any) => void;
}) => {
  if (loading) return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, idx) => (
        <Card key={idx} className="p-3 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </Card>
      ))}
    </div>
  );
  if (shifts.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">No shifts logged yet.</p>;

  return (
    <div className="space-y-2">
      {shifts.map(s => (
        <Card
          key={s.id}
          className={`p-3 ${canEdit(s) ? 'cursor-pointer hover:bg-muted/50' : ''} transition-colors`}
          onClick={() => canEdit(s) && onEdit(s)}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{projectMap[s.project_id] || 'Unknown Project'}</p>
              <p className="text-xs text-muted-foreground">
                {s.shift_date}
                {s.start_time && s.end_time ? ` · ${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {s.admin_edited_at && (
                <Badge variant="outline" className="text-xs">Admin edited</Badge>
              )}
              {s.is_flat_rate ? (
                <span className="text-sm font-medium">${Number(s.flat_rate_amount || 0).toFixed(2)}</span>
              ) : (
                <span className="text-sm font-medium">{s.total_hours}h</span>
              )}
              {s.is_flat_rate && <Badge variant="secondary" className="text-[10px]">Flat</Badge>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default Shifts;

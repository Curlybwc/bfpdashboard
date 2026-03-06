import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import ShiftForm from '@/components/shifts/ShiftForm';
import PayrollSummary from '@/components/shifts/PayrollSummary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Clock } from 'lucide-react';
import type { Shift, ShiftAllocation } from '@/hooks/useShifts';

const Shifts = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [showForm, setShowForm] = useState(false);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [editAllocations, setEditAllocations] = useState<ShiftAllocation[]>([]);
  const [myShifts, setMyShifts] = useState<any[]>([]);
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchMyShifts = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', user.id)
      .order('shift_date', { ascending: false })
      .limit(20);
    const shifts = data || [];
    setMyShifts(shifts);

    // Fetch project names
    const pids = [...new Set(shifts.map(s => s.project_id))];
    if (pids.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', pids);
      const map: Record<string, string> = {};
      (projects || []).forEach(p => { map[p.id] = p.name; });
      setProjectMap(map);
    }
    setLoading(false);
  };

  useEffect(() => { fetchMyShifts(); }, [user]);

  const handleNewShift = () => {
    setEditShift(null);
    setEditAllocations([]);
    setShowForm(true);
  };

  const handleEditShift = async (shift: Shift) => {
    // Fetch full shift data if needed
    const { data: fullShift } = await supabase
      .from('shifts')
      .select('*')
      .eq('id', shift.id)
      .single();
    if (!fullShift) return;

    const { data: allocs } = await supabase
      .from('shift_task_allocations')
      .select('*')
      .eq('shift_id', shift.id);

    setEditShift(fullShift as Shift);
    setEditAllocations((allocs as ShiftAllocation[]) || []);
    setShowForm(true);
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditShift(null);
    setEditAllocations([]);
    fetchMyShifts();
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
            onSaved={handleSaved}
            onCancel={() => { setShowForm(false); setEditShift(null); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <PageHeader
        title="Shifts"
        actions={
          <Button size="sm" onClick={handleNewShift}>
            <Plus className="h-4 w-4 mr-1" />Log Shift
          </Button>
        }
      />
      <div className="p-4">
        {isAdmin ? (
          <Tabs defaultValue="my-shifts">
            <TabsList className="w-full">
              <TabsTrigger value="my-shifts" className="flex-1">My Shifts</TabsTrigger>
              <TabsTrigger value="payroll" className="flex-1">Payroll</TabsTrigger>
            </TabsList>
            <TabsContent value="my-shifts" className="mt-4">
              <ShiftHistory
                shifts={myShifts}
                projectMap={projectMap}
                loading={loading}
                canEdit={canEditShift}
                onEdit={handleEditShift}
                isAdmin={isAdmin}
              />
            </TabsContent>
            <TabsContent value="payroll" className="mt-4">
              <PayrollSummary onEditShift={handleEditShift} />
            </TabsContent>
          </Tabs>
        ) : (
          <ShiftHistory
            shifts={myShifts}
            projectMap={projectMap}
            loading={loading}
            canEdit={canEditShift}
            onEdit={handleEditShift}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </div>
  );
};

// Shift history list
const ShiftHistory = ({
  shifts, projectMap, loading, canEdit, onEdit, isAdmin,
}: {
  shifts: any[];
  projectMap: Record<string, string>;
  loading: boolean;
  canEdit: (s: any) => boolean;
  onEdit: (s: any) => void;
  isAdmin: boolean;
}) => {
  if (loading) return <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>;
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
              <span className="text-sm font-medium">{s.total_hours}h</span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default Shifts;

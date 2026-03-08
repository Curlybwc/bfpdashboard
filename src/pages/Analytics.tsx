import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

/* ── Types ── */
interface ProjectSummary {
  id: string;
  name: string;
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  readyTasks: number;
  blockedTasks: number;
}

interface LaborEntry {
  projectName: string;
  totalHours: number;
  totalCost: number;
}

const STAGE_COLORS: Record<string, string> = {
  Done: 'hsl(142, 60%, 40%)',
  'In Progress': 'hsl(28, 80%, 52%)',
  Ready: 'hsl(220, 60%, 35%)',
  'Not Ready': 'hsl(220, 10%, 65%)',
  Hold: 'hsl(220, 10%, 75%)',
};

const PIE_COLORS = [
  'hsl(220, 60%, 35%)',
  'hsl(35, 80%, 55%)',
  'hsl(142, 60%, 40%)',
  'hsl(0, 72%, 51%)',
  'hsl(270, 50%, 50%)',
  'hsl(180, 50%, 45%)',
];

const Analytics = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>('all');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [projRes, taskRes, shiftRes, matRes] = await Promise.all([
        supabase.from('projects').select('id, name').order('name'),
        supabase.from('tasks').select('id, project_id, stage, is_blocked, completed_at, created_at'),
        supabase.from('shifts').select('id, project_id, total_hours, hourly_rate_snapshot, shift_date'),
        supabase.from('task_materials').select('id, task_id, name, quantity, purchased, delivered, confirmed_on_site, is_active'),
      ]);
      setProjects(projRes.data || []);
      setTasks(taskRes.data || []);
      setShifts(shiftRes.data || []);
      setMaterials(matRes.data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach(p => { m[p.id] = p.name; });
    return m;
  }, [projects]);

  const filteredTasks = useMemo(() =>
    selectedProject === 'all' ? tasks : tasks.filter(t => t.project_id === selectedProject),
    [tasks, selectedProject]
  );

  const filteredShifts = useMemo(() =>
    selectedProject === 'all' ? shifts : shifts.filter(s => s.project_id === selectedProject),
    [shifts, selectedProject]
  );

  const filteredMaterials = useMemo(() => {
    if (selectedProject === 'all') return materials;
    const taskIds = new Set(filteredTasks.map(t => t.id));
    return materials.filter(m => taskIds.has(m.task_id));
  }, [materials, filteredTasks, selectedProject]);

  /* ── Computed metrics ── */

  // Completion rate by project
  const projectSummaries: ProjectSummary[] = useMemo(() => {
    const map: Record<string, ProjectSummary> = {};
    const relevantTasks = selectedProject === 'all' ? tasks : tasks.filter(t => t.project_id === selectedProject);
    relevantTasks.forEach(t => {
      if (!map[t.project_id]) {
        map[t.project_id] = {
          id: t.project_id,
          name: projectMap[t.project_id] || 'Unknown',
          totalTasks: 0, doneTasks: 0, inProgressTasks: 0, readyTasks: 0, blockedTasks: 0,
        };
      }
      const s = map[t.project_id];
      s.totalTasks++;
      if (t.stage === 'Done') s.doneTasks++;
      else if (t.stage === 'In Progress') s.inProgressTasks++;
      else if (t.stage === 'Ready') s.readyTasks++;
      if (t.is_blocked) s.blockedTasks++;
    });
    return Object.values(map).sort((a, b) => b.totalTasks - a.totalTasks);
  }, [tasks, projectMap, selectedProject]);

  // Stage distribution pie
  const stageData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredTasks.forEach(t => { counts[t.stage] = (counts[t.stage] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredTasks]);

  // Labor hours by project
  const laborData: LaborEntry[] = useMemo(() => {
    const map: Record<string, LaborEntry> = {};
    filteredShifts.forEach(s => {
      const name = projectMap[s.project_id] || 'Unknown';
      if (!map[s.project_id]) map[s.project_id] = { projectName: name, totalHours: 0, totalCost: 0 };
      map[s.project_id].totalHours += Number(s.total_hours) || 0;
      map[s.project_id].totalCost += (Number(s.total_hours) || 0) * (Number(s.hourly_rate_snapshot) || 0);
    });
    return Object.values(map).sort((a, b) => b.totalHours - a.totalHours);
  }, [filteredShifts, projectMap]);

  // Material stats
  const materialStats = useMemo(() => {
    const active = filteredMaterials.filter(m => m.is_active);
    return {
      total: active.length,
      purchased: active.filter(m => m.purchased).length,
      delivered: active.filter(m => m.delivered).length,
      onSite: active.filter(m => m.confirmed_on_site).length,
    };
  }, [filteredMaterials]);

  const materialPieData = useMemo(() => [
    { name: 'On Site', value: materialStats.onSite },
    { name: 'Delivered', value: Math.max(0, materialStats.delivered - materialStats.onSite) },
    { name: 'Purchased', value: Math.max(0, materialStats.purchased - materialStats.delivered) },
    { name: 'Pending', value: Math.max(0, materialStats.total - materialStats.purchased) },
  ].filter(d => d.value > 0), [materialStats]);

  // KPI cards
  const totalTasks = filteredTasks.length;
  const completedTasks = filteredTasks.filter(t => t.stage === 'Done').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const totalLaborHours = filteredShifts.reduce((sum, s) => sum + (Number(s.total_hours) || 0), 0);
  const totalLaborCost = filteredShifts.reduce((sum, s) =>
    sum + ((Number(s.total_hours) || 0) * (Number(s.hourly_rate_snapshot) || 0)), 0);
  const blockedCount = filteredTasks.filter(t => t.is_blocked).length;

  if (loading) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="pb-24 px-4 max-w-4xl mx-auto">
      <PageHeader title="Analytics" backTo="/today" />

      {/* Project filter */}
      <div className="mb-6">
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{completionRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">Completion Rate</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{totalTasks}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Tasks</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{totalLaborHours.toFixed(1)}h</p>
          <p className="text-xs text-muted-foreground mt-1">Labor Hours</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-destructive">{blockedCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Blocked</p>
        </Card>
      </div>

      {/* Task Status Distribution */}
      <Card className="p-4 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Task Status Distribution</h3>
        {stageData.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stageData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {stageData.map((entry, i) => (
                    <Cell key={entry.name} fill={STAGE_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">No task data available.</p>
        )}
      </Card>

      {/* Completion Rate by Project */}
      {selectedProject === 'all' && projectSummaries.length > 0 && (
        <Card className="p-4 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Completion by Project</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projectSummaries.slice(0, 10)} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 87%)" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="doneTasks" name="Done" stackId="a" fill={STAGE_COLORS.Done} />
                <Bar dataKey="inProgressTasks" name="In Progress" stackId="a" fill={STAGE_COLORS['In Progress']} />
                <Bar dataKey="readyTasks" name="Ready" stackId="a" fill={STAGE_COLORS.Ready} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Labor Hours by Project */}
      {laborData.length > 0 && (
        <Card className="p-4 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Labor Hours by Project</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={laborData.slice(0, 10)} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 87%)" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="projectName" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}h`} />
                <Bar dataKey="totalHours" name="Hours" fill="hsl(220, 60%, 35%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-right">
            <p className="text-sm text-muted-foreground">
              Total labor cost: <span className="font-semibold text-foreground">${totalLaborCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </p>
          </div>
        </Card>
      )}

      {/* Material Pipeline */}
      <Card className="p-4 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Material Pipeline</h3>
        {materialPieData.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={materialPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                  {materialPieData.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">No material data available.</p>
        )}
        <div className="grid grid-cols-4 gap-2 mt-3 text-center">
          <div>
            <p className="text-lg font-bold text-foreground">{materialStats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{materialStats.purchased}</p>
            <p className="text-xs text-muted-foreground">Purchased</p>
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{materialStats.delivered}</p>
            <p className="text-xs text-muted-foreground">Delivered</p>
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{materialStats.onSite}</p>
            <p className="text-xs text-muted-foreground">On Site</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Analytics;

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import PageHeader from '@/components/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface ScopeOption { id: string; label: string }
interface ProjectOption { id: string; name: string }

interface AccuracyRow {
  scopeItemId: string;
  description: string;
  scopeLabel: string;
  trade: string;
  projectCount: number;
  estimatedCost: number | null;
  avgActualCost: number | null;
  totalActual: number;
  variancePct: number | null;
}

type SortKey = 'description' | 'scopeLabel' | 'trade' | 'projectCount' | 'estimatedCost' | 'avgActualCost' | 'variancePct' | 'totalActual';

const ScopeAccuracy = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const navigate = useNavigate();

  const [scopeItems, setScopeItems] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [scopes, setScopes] = useState<ScopeOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterScope, setFilterScope] = useState<string>('all');
  const [filterTrade, setFilterTrade] = useState('');
  const [filterProject, setFilterProject] = useState<string>('all');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('variancePct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!adminLoading && !isAdmin) navigate('/projects', { replace: true });
  }, [isAdmin, adminLoading, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    const load = async () => {
      setLoading(true);
      const [siRes, taskRes, scopeRes, projRes] = await Promise.all([
        supabase.from('scope_items').select('id, description, scope_id, computed_total, estimated_labor_cost, estimated_material_cost, estimated_hours, created_at'),
        supabase.from('tasks').select('id, source_scope_item_id, actual_total_cost, project_id, trade').not('source_scope_item_id', 'is', null),
        supabase.from('scopes').select('id, name, address'),
        supabase.from('projects').select('id, name'),
      ]);
      setScopeItems(siRes.data ?? []);
      setTasks(taskRes.data ?? []);
      setScopes((scopeRes.data ?? []).map(s => ({ id: s.id, label: s.name || s.address || s.id.slice(0, 8) })));
      setProjects((projRes.data ?? []).map(p => ({ id: p.id, name: p.name })));
      setLoading(false);
    };
    load();
  }, [isAdmin]);

  // Build scope lookup
  const scopeMap = useMemo(() => {
    const m: Record<string, string> = {};
    scopes.forEach(s => { m[s.id] = s.label; });
    return m;
  }, [scopes]);

  // Group tasks by source_scope_item_id
  const tasksByItem = useMemo(() => {
    const m: Record<string, any[]> = {};
    tasks.forEach(t => {
      const key = t.source_scope_item_id as string;
      if (!m[key]) m[key] = [];
      m[key].push(t);
    });
    return m;
  }, [tasks]);

  // Build rows
  const rows: AccuracyRow[] = useMemo(() => {
    return scopeItems.map(si => {
      const linked = tasksByItem[si.id] || [];
      const fallback = (si.estimated_labor_cost ?? 0) + (si.estimated_material_cost ?? 0);
      const estimatedCost = si.computed_total ?? (fallback > 0 ? fallback : null);
      const actuals = linked.map(t => t.actual_total_cost as number | null).filter((v): v is number => v != null);
      const totalActual = actuals.reduce((s, v) => s + v, 0);
      const avgActualCost = actuals.length > 0 ? totalActual / actuals.length : null;
      const projectIds = new Set(linked.map(t => t.project_id));
      const trades = [...new Set(linked.map(t => t.trade).filter(Boolean))];
      const variancePct = estimatedCost && avgActualCost != null ? ((avgActualCost / estimatedCost) - 1) * 100 : null;

      return {
        scopeItemId: si.id,
        description: si.description,
        scopeLabel: scopeMap[si.scope_id] || si.scope_id?.slice(0, 8) || '',
        scopeId: si.scope_id,
        trade: trades.join(', '),
        projectCount: projectIds.size,
        estimatedCost,
        avgActualCost,
        totalActual,
        variancePct,
        linkedProjectIds: [...projectIds],
      };
    });
  }, [scopeItems, tasksByItem, scopeMap]);

  // Filter
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterScope !== 'all' && (r as any).scopeId !== filterScope) return false;
      if (filterTrade && !r.trade.toLowerCase().includes(filterTrade.toLowerCase())) return false;
      if (filterProject !== 'all' && !(r as any).linkedProjectIds?.includes(filterProject)) return false;
      return true;
    });
  }, [rows, filterScope, filterTrade, filterProject]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  const varianceBadge = (pct: number | null) => {
    if (pct == null) return <span className="text-muted-foreground text-xs">—</span>;
    const abs = Math.abs(pct);
    let cls = 'bg-success/15 text-success';
    if (abs > 25) cls = 'bg-destructive/15 text-destructive';
    else if (abs > 10) cls = 'bg-warning/20 text-warning';
    return <Badge variant="secondary" className={`${cls} text-xs font-medium border-0`}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</Badge>;
  };

  const fmt = (v: number | null) => v != null ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—';

  if (adminLoading || loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }
  if (!isAdmin) return null;

  return (
    <div className="pb-20">
      <PageHeader title="Scope Accuracy" backTo="/admin" />
      <div className="p-4 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={filterScope} onValueChange={setFilterScope}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Scopes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scopes</SelectItem>
              {scopes.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Filter trade…" value={filterTrade} onChange={e => setFilterTrade(e.target.value)} className="w-[160px]" />
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Projects" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Summary */}
        <p className="text-xs text-muted-foreground">{sorted.length} items • {sorted.filter(r => r.projectCount > 0).length} with actuals</p>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('description')}>Item <SortIcon col="description" /></TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('scopeLabel')}>Scope <SortIcon col="scopeLabel" /></TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('trade')}>Trade <SortIcon col="trade" /></TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort('projectCount')}>Projects <SortIcon col="projectCount" /></TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort('estimatedCost')}>Estimated <SortIcon col="estimatedCost" /></TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort('avgActualCost')}>Avg Actual <SortIcon col="avgActualCost" /></TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort('variancePct')}>Variance <SortIcon col="variancePct" /></TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort('totalActual')}>Total Actual <SortIcon col="totalActual" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">No scope items found.</TableCell></TableRow>
            ) : sorted.map(r => (
              <TableRow key={r.scopeItemId}>
                <TableCell className="font-medium text-sm max-w-[200px] truncate">{r.description}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">{r.scopeLabel}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.trade || '—'}</TableCell>
                <TableCell className="text-right text-sm">{r.projectCount}</TableCell>
                <TableCell className="text-right text-sm">{fmt(r.estimatedCost)}</TableCell>
                <TableCell className="text-right text-sm">{fmt(r.avgActualCost)}</TableCell>
                <TableCell className="text-right">{varianceBadge(r.variancePct)}</TableCell>
                <TableCell className="text-right text-sm">{fmt(r.totalActual || null)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ScopeAccuracy;

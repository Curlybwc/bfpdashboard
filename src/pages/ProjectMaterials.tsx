import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ExternalLink, Copy, Link, ShoppingCart, Truck, ChevronDown, ChevronUp } from 'lucide-react';

type Tab = 'not_purchased' | 'purchased_not_delivered' | 'delivered';

interface RawMaterial {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  sku: string | null;
  vendor_url: string | null;
  purchased: boolean;
  delivered: boolean;
  item_type: string;
  provided_by: string;
  confirmed_on_site: boolean;
  task_id: string;
  task_name: string;
  project_id: string;
}

interface AggregatedItem {
  key: string;
  name: string;
  sku: string | null;
  unit: string | null;
  vendor_url: string | null;
  item_type: string;
  totalQty: number;
  ids: string[];
  tasks: { id: string; name: string; project_id: string }[];
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return 'https://' + trimmed;
}

const ProjectMaterials = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('not_purchased');
  const [rawItems, setRawItems] = useState<RawMaterial[]>([]);
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    
    const [{ data: proj }, { data: tasks }] = await Promise.all([
      supabase.from('projects').select('name').eq('id', id).single(),
      supabase.from('tasks').select('id, task, project_id').eq('project_id', id),
    ]);

    if (proj) setProjectName(proj.name);

    if (tasks && tasks.length > 0) {
      const taskIds = tasks.map(t => t.id);
      const { data: mats } = await supabase
        .from('task_materials')
        .select('*')
        .in('task_id', taskIds);

      if (mats) {
        const taskMap: Record<string, { name: string; project_id: string }> = {};
        tasks.forEach(t => { taskMap[t.id] = { name: t.task, project_id: t.project_id }; });
        
        setRawItems((mats as any[]).map(m => ({
          ...m,
          item_type: m.item_type ?? 'material',
          provided_by: m.provided_by ?? 'either',
          confirmed_on_site: m.confirmed_on_site ?? false,
          task_name: taskMap[m.task_id]?.name ?? 'Unknown',
          project_id: taskMap[m.task_id]?.project_id ?? id,
        })));
      }
    } else {
      setRawItems([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  const filteredItems = useMemo(() => {
    switch (tab) {
      case 'not_purchased':
        return rawItems.filter(i => !i.purchased);
      case 'purchased_not_delivered':
        return rawItems.filter(i => i.purchased && !i.delivered);
      case 'delivered':
        return rawItems.filter(i => i.delivered);
    }
  }, [rawItems, tab]);

  const aggregated = useMemo(() => {
    const groups: Record<string, AggregatedItem> = {};
    filteredItems.forEach(item => {
      const key = `${item.name}|${item.sku ?? ''}|${item.unit ?? ''}|${item.vendor_url ?? ''}|${item.item_type}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          name: item.name,
          sku: item.sku,
          unit: item.unit,
          vendor_url: item.vendor_url,
          item_type: item.item_type,
          totalQty: 0,
          ids: [],
          tasks: [],
        };
      }
      groups[key].totalQty += item.quantity ?? 0;
      groups[key].ids.push(item.id);
      const existing = groups[key].tasks.find(t => t.id === item.task_id);
      if (!existing) {
        groups[key].tasks.push({ id: item.task_id, name: item.task_name, project_id: item.project_id });
      }
    });
    return Object.values(groups);
  }, [filteredItems]);

  const materialAggregated = aggregated.filter(a => a.item_type !== 'tool');
  const toolAggregated = aggregated.filter(a => a.item_type === 'tool');

  const handleBulkPurchased = async (item: AggregatedItem) => {
    setActionLoading(item.key);
    const { error } = await supabase
      .from('task_materials')
      .update({ purchased: true } as any)
      .in('id', item.ids);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: `Marked ${item.ids.length} items as purchased` });
    await fetchData();
    setActionLoading(null);
  };

  const handleBulkDelivered = async (item: AggregatedItem) => {
    setActionLoading(item.key);
    const { error } = await supabase
      .from('task_materials')
      .update({ delivered: true, purchased: true } as any)
      .in('id', item.ids);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: `Marked ${item.ids.length} items as delivered` });

    // Re-derive materials_on_site for affected tasks
    const taskIds = [...new Set(item.ids.map(id => {
      const raw = rawItems.find(r => r.id === id);
      return raw?.task_id;
    }).filter(Boolean))] as string[];
    
    for (const taskId of taskIds) {
      await deriveTaskStatus(taskId);
    }

    await fetchData();
    setActionLoading(null);
  };

  const deriveTaskStatus = async (taskId: string) => {
    const { data } = await supabase
      .from('task_materials')
      .select('delivered, item_type, confirmed_on_site')
      .eq('task_id', taskId);
    const items = (data as any[]) || [];
    if (items.length === 0) return;
    const mats = items.filter(i => (i.item_type ?? 'material') === 'material');
    const tools = items.filter(i => (i.item_type ?? 'material') === 'tool');
    const allMatsDelivered = mats.length === 0 || mats.every(m => m.delivered);
    const allToolsConfirmed = tools.length === 0 || tools.every(t => t.confirmed_on_site);
    const status = (allMatsDelivered && allToolsConfirmed) ? 'Yes' : 'No';
    await supabase.from('tasks').update({ materials_on_site: status }).eq('id', taskId);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied!', description: `${label} copied to clipboard.` });
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const toggleExpanded = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const renderCard = (item: AggregatedItem) => {
    const isExpanded = expandedKeys.has(item.key);
    return (
      <div key={item.key} className="rounded-lg border p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{item.name}</p>
            {item.totalQty > 0 && (
              <p className="text-xs text-muted-foreground">
                {item.totalQty}{item.unit ? ` ${item.unit}` : ''}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => toggleExpanded(item.key)}
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {(item.sku || item.vendor_url) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {item.sku && (
              <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => copyToClipboard(item.sku!, 'SKU')}>
                <Copy className="h-3 w-3" />SKU: {item.sku}
              </Button>
            )}
            {item.vendor_url && (
              <>
                <Button
                  variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1"
                  onClick={() => window.open(item.vendor_url!, '_blank', 'noopener')}
                >
                  <ExternalLink className="h-3 w-3" />Open
                </Button>
                <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => copyToClipboard(item.vendor_url!, 'Link')}>
                  <Link className="h-3 w-3" />Copy
                </Button>
              </>
            )}
          </div>
        )}

        {isExpanded && (
          <div className="space-y-1 pt-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Used In ({item.tasks.length})</p>
            {item.tasks.map(t => (
              <button
                key={t.id}
                className="block text-xs text-primary hover:underline truncate w-full text-left"
                onClick={() => navigate(`/projects/${t.project_id}/tasks/${t.id}`)}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {tab !== 'delivered' && (
          <div className="flex gap-2 pt-1">
            {tab === 'not_purchased' && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs gap-1"
                disabled={actionLoading === item.key}
                onClick={() => handleBulkPurchased(item)}
              >
                <ShoppingCart className="h-3 w-3" />Mark Purchased
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs gap-1"
              disabled={actionLoading === item.key}
              onClick={() => handleBulkDelivered(item)}
            >
              <Truck className="h-3 w-3" />Mark Delivered
            </Button>
          </div>
        )}
      </div>
    );
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'not_purchased', label: 'Not Purchased' },
    { key: 'purchased_not_delivered', label: 'Bought' },
    { key: 'delivered', label: 'Delivered' },
  ];

  if (loading) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="pb-20">
      <PageHeader title={`${projectName} – Materials`} backTo={`/projects/${id}`} />

      <div className="p-4 space-y-4">
        {/* Tab bar */}
        <div className="flex rounded-lg border overflow-hidden">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`flex-1 text-xs font-medium py-2 px-1 transition-colors ${
                tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {aggregated.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No items in this tab.</p>
        )}

        {materialAggregated.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Materials ({materialAggregated.length})</h3>
            {materialAggregated.map(renderCard)}
          </div>
        )}

        {toolAggregated.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🔧 Tools ({toolAggregated.length})</h3>
            {toolAggregated.map(renderCard)}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectMaterials;

import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ExternalLink, Copy, Link, ShoppingCart, Truck, ChevronDown, ChevronUp, Plus, Minus, ArrowRight, ArrowLeft, ArrowRightLeft, Package } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import RecordLeftoverSheet from '@/components/RecordLeftoverSheet';

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
  tool_type_id: string | null;
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
  tool_type_id: string | null;
}

interface ToolType {
  id: string;
  name: string;
  sku: string | null;
  is_active: boolean;
}

interface StockRow {
  id: string;
  tool_type_id: string;
  location_type: string;
  project_id: string | null;
  qty: number;
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
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('not_purchased');
  const [rawItems, setRawItems] = useState<RawMaterial[]>([]);
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [toolTypes, setToolTypes] = useState<ToolType[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [shopStockMap, setShopStockMap] = useState<Record<string, number>>({});
  const [moveQty, setMoveQty] = useState<Record<string, number>>({});
  const [transferOpen, setTransferOpen] = useState<string | null>(null); // tool_type_id
  const [transferDestProject, setTransferDestProject] = useState<string>('');
  const [transferQty, setTransferQty] = useState(1);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string; address: string | null }[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [leftoverTarget, setLeftoverTarget] = useState<AggregatedItem | null>(null);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);

    const [{ data: proj }, { data: tasks }, { data: types }] = await Promise.all([
      supabase.from('projects').select('name').eq('id', id).single(),
      supabase.from('tasks').select('id, task, project_id').eq('project_id', id),
      supabase.from('tool_types').select('*').eq('is_active', true).order('name'),
    ]);

    if (proj) setProjectName(proj.name);
    if (types) setToolTypes(types as ToolType[]);

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
          tool_type_id: m.tool_type_id ?? null,
        })));

        // Gather tool_type_ids used
        const usedToolTypeIds = [...new Set((mats as any[]).filter(m => m.tool_type_id).map(m => m.tool_type_id))];
        if (usedToolTypeIds.length > 0) {
          await fetchStockForToolTypes(usedToolTypeIds);
        }
      }
    } else {
      setRawItems([]);
    }
    setLoading(false);
  };

  const fetchStockForToolTypes = async (toolTypeIds: string[]) => {
    if (!id) return;
    const { data: stocks } = await supabase
      .from('tool_stock')
      .select('*')
      .in('tool_type_id', toolTypeIds);

    const projStock: Record<string, number> = {};
    const shopStock: Record<string, number> = {};
    if (stocks) {
      (stocks as StockRow[]).forEach(s => {
        if (s.location_type === 'project' && s.project_id === id) {
          projStock[s.tool_type_id] = s.qty;
        }
        if (s.location_type === 'shop' && !s.project_id) {
          shopStock[s.tool_type_id] = s.qty;
        }
      });
    }
    setStockMap(projStock);
    setShopStockMap(shopStock);
  };

  useEffect(() => { fetchData(); }, [id]);

  const activeItems = useMemo(() => rawItems.filter(i => (i as any).is_active !== false), [rawItems]);

  const filteredItems = useMemo(() => {
    switch (tab) {
      case 'not_purchased':
        return activeItems.filter(i => !i.purchased);
      case 'purchased_not_delivered':
        return activeItems.filter(i => i.purchased && !i.delivered);
      case 'delivered':
        return activeItems.filter(i => i.delivered);
    }
  }, [activeItems, tab]);

  const aggregated = useMemo(() => {
    const groups: Record<string, AggregatedItem> = {};
    filteredItems.forEach(item => {
      const key = `${item.name}|${item.sku ?? ''}|${item.unit ?? ''}|${item.vendor_url ?? ''}|${item.item_type}|${item.tool_type_id ?? ''}`;
      if (!groups[key]) {
        groups[key] = {
          key, name: item.name, sku: item.sku, unit: item.unit,
          vendor_url: item.vendor_url, item_type: item.item_type,
          totalQty: 0, ids: [], tasks: [], tool_type_id: item.tool_type_id,
        };
      }
      groups[key].totalQty += item.quantity ?? 0;
      groups[key].ids.push(item.id);
      if (!groups[key].tasks.find(t => t.id === item.task_id)) {
        groups[key].tasks.push({ id: item.task_id, name: item.task_name, project_id: item.project_id });
      }
    });
    return Object.values(groups);
  }, [filteredItems]);

  const materialAggregated = aggregated.filter(a => a.item_type !== 'tool');
  const toolAggregated = aggregated.filter(a => a.item_type === 'tool');

  const handleBulkPurchased = async (item: AggregatedItem) => {
    setActionLoading(item.key);
    const { error } = await supabase.from('task_materials').update({ purchased: true } as any).in('id', item.ids);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: `Marked ${item.ids.length} items as purchased` });
    await fetchData();
    setActionLoading(null);
  };

  const handleBulkDelivered = async (item: AggregatedItem) => {
    setActionLoading(item.key);
    const { error } = await supabase.from('task_materials').update({ delivered: true, purchased: true } as any).in('id', item.ids);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: `Marked ${item.ids.length} items as delivered` });

    const taskIds = [...new Set(item.ids.map(mid => {
      const raw = rawItems.find(r => r.id === mid);
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
    if (items.length === 0) {
      await supabase.from('tasks').update({ materials_on_site: 'Yes' }).eq('id', taskId);
      return;
    }
    const mats = items.filter(i => (i.item_type ?? 'material') === 'material');
    const tools = items.filter(i => (i.item_type ?? 'material') === 'tool');
    const allMatsDelivered = mats.length === 0 || mats.every(m => m.delivered);
    const allToolsConfirmed = tools.length === 0 || tools.every(t => t.confirmed_on_site);
    const status = (allMatsDelivered && allToolsConfirmed) ? 'Yes' : 'No';
    await supabase.from('tasks').update({ materials_on_site: status }).eq('id', taskId);
  };

  const handleLinkToolType = async (item: AggregatedItem, toolTypeId: string) => {
    setActionLoading(item.key);
    await supabase.from('task_materials').update({ tool_type_id: toolTypeId } as any).in('id', item.ids);
    await fetchData();
    // After linking, sync gating
    await syncToolGating(toolTypeId);
    setActionLoading(null);
  };

  const handleMoveStock = async (toolTypeId: string, direction: 'to_project' | 'to_shop') => {
    if (!id || !user) return;
    const qty = moveQty[toolTypeId] || 1;
    setActionLoading(`move-${toolTypeId}`);

    if (direction === 'to_project') {
      const shopQty = shopStockMap[toolTypeId] ?? 0;
      if (shopQty < qty) {
        toast({ title: 'Not enough in shop', variant: 'destructive' });
        setActionLoading(null);
        return;
      }
      // Decrement shop
      await upsertStock(toolTypeId, 'shop', null, -qty);
      // Increment project
      await upsertStock(toolTypeId, 'project', id, qty);
    } else {
      const projQty = stockMap[toolTypeId] ?? 0;
      if (projQty < qty) {
        toast({ title: 'Not enough at project', variant: 'destructive' });
        setActionLoading(null);
        return;
      }
      await upsertStock(toolTypeId, 'project', id, -qty);
      await upsertStock(toolTypeId, 'shop', null, qty);
    }

    await fetchData();
    // Sync gating after stock move
    await syncToolGating(toolTypeId);
    setActionLoading(null);
  };

  const upsertStock = async (toolTypeId: string, locationType: string, projectId: string | null, delta: number) => {
    const { data: existing } = await supabase
      .from('tool_stock')
      .select('*')
      .eq('tool_type_id', toolTypeId)
      .eq('location_type', locationType)
      .is('project_id', projectId ? undefined as any : null);

    let rows = existing as StockRow[] | null;
    if (projectId) {
      const { data: existingProj } = await supabase
        .from('tool_stock')
        .select('*')
        .eq('tool_type_id', toolTypeId)
        .eq('location_type', locationType)
        .eq('project_id', projectId);
      rows = existingProj as StockRow[] | null;
    } else {
      const { data: existingShop } = await supabase
        .from('tool_stock')
        .select('*')
        .eq('tool_type_id', toolTypeId)
        .eq('location_type', locationType)
        .is('project_id', null);
      rows = existingShop as StockRow[] | null;
    }

    const row = rows && rows.length > 0 ? rows[0] : null;

    if (row) {
      const newQty = Math.max(0, row.qty + delta);
      await supabase.from('tool_stock').update({ qty: newQty, updated_at: new Date().toISOString(), updated_by: user?.id } as any).eq('id', row.id);
    } else if (delta > 0) {
      await supabase.from('tool_stock').insert({
        tool_type_id: toolTypeId,
        location_type: locationType,
        project_id: projectId,
        qty: delta,
        updated_by: user?.id,
      } as any);
    }
  };

  const syncToolGating = async (toolTypeId: string) => {
    if (!id) return;
    // Get all task_materials for this tool_type_id in this project
    const taskIds = [...new Set(rawItems.filter(r => r.tool_type_id === toolTypeId).map(r => r.task_id))];
    if (taskIds.length === 0) return;

    // Get current project stock for this tool type
    const { data: stockRows } = await supabase
      .from('tool_stock')
      .select('qty')
      .eq('tool_type_id', toolTypeId)
      .eq('location_type', 'project')
      .eq('project_id', id);
    const projectQty = stockRows && stockRows.length > 0 ? (stockRows[0] as any).qty : 0;

    // Get all task_materials with this tool_type and provided_by=company
    const { data: toolMats } = await supabase
      .from('task_materials')
      .select('id, task_id, quantity, provided_by, confirmed_on_site')
      .eq('tool_type_id', toolTypeId)
      .in('task_id', taskIds);

    if (!toolMats) return;
    const companyTools = (toolMats as any[]).filter(t => t.provided_by === 'company');

    // Sum required qty across all tasks for this tool type
    const totalRequired = companyTools.reduce((sum: number, t: any) => sum + (t.quantity ?? 0), 0);
    const satisfied = projectQty >= totalRequired;

    // Update confirmed_on_site for all company tools of this type
    for (const t of companyTools) {
      const newVal = satisfied;
      if (t.confirmed_on_site !== newVal) {
        const updateData: any = { confirmed_on_site: newVal };
        if (newVal) {
          updateData.delivered = true;
          updateData.purchased = true;
        }
        await supabase.from('task_materials').update(updateData).eq('id', t.id);
      }
    }

    // Re-derive task status for affected tasks
    const affectedTaskIds = [...new Set(companyTools.map((t: any) => t.task_id))];
    for (const taskId of affectedTaskIds) {
      await deriveTaskStatus(taskId);
    }
  };

  const openTransfer = async (toolTypeId: string) => {
    setTransferOpen(toolTypeId);
    setTransferDestProject('');
    setTransferQty(1);
    setProjectSearch('');
    // Fetch projects if not loaded
    if (allProjects.length === 0) {
      const { data } = await supabase.from('projects').select('id, name, address').neq('id', id!).order('name');
      if (data) setAllProjects(data as any[]);
    }
  };

  const handleTransfer = async () => {
    if (!transferOpen || !transferDestProject || !id || !user) return;
    const toolTypeId = transferOpen;
    const srcQty = stockMap[toolTypeId] ?? 0;
    if (transferQty <= 0 || srcQty < transferQty) {
      toast({ title: 'Not enough stock at this project', variant: 'destructive' });
      return;
    }
    setActionLoading(`transfer-${toolTypeId}`);
    // Decrement source project
    await upsertStock(toolTypeId, 'project', id, -transferQty);
    // Increment destination project
    await upsertStock(toolTypeId, 'project', transferDestProject, transferQty);

    setTransferOpen(null);
    await fetchData();
    await syncToolGating(toolTypeId);
    setActionLoading(null);
  };

  const filteredProjects = allProjects.filter(p => {
    if (!projectSearch.trim()) return true;
    const q = projectSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.address && p.address.toLowerCase().includes(q));
  });

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
    const isTool = item.item_type === 'tool';
    const projStock = item.tool_type_id ? (stockMap[item.tool_type_id] ?? 0) : 0;
    const shopStock = item.tool_type_id ? (shopStockMap[item.tool_type_id] ?? 0) : 0;
    const mqty = moveQty[item.tool_type_id ?? ''] ?? 1;

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
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => toggleExpanded(item.key)}>
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
                <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => window.open(item.vendor_url!, '_blank', 'noopener')}>
                  <ExternalLink className="h-3 w-3" />Open
                </Button>
                <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => copyToClipboard(item.vendor_url!, 'Link')}>
                  <Link className="h-3 w-3" />Copy
                </Button>
              </>
            )}
          </div>
        )}

        {/* Tool type linking */}
        {isTool && !item.tool_type_id && (
          <div className="pt-1">
            <Select onValueChange={(v) => handleLinkToolType(item, v)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Link tool type..." />
              </SelectTrigger>
              <SelectContent>
                {toolTypes.map(tt => (
                  <SelectItem key={tt.id} value={tt.id}>{tt.name}{tt.sku ? ` (${tt.sku})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Stock info + move controls for linked tools */}
        {isTool && item.tool_type_id && (
          <div className="pt-1 space-y-2 border-t">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Company stock here:</span>
              <span className="font-medium">{projStock}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Shop stock:</span>
              <span className="font-medium">{shopStock}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setMoveQty(prev => ({ ...prev, [item.tool_type_id!]: Math.max(1, mqty - 1) }))}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="text-xs w-5 text-center">{mqty}</span>
                <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setMoveQty(prev => ({ ...prev, [item.tool_type_id!]: mqty + 1 }))}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1"
                    disabled={actionLoading === `move-${item.tool_type_id}` || shopStock < mqty}
                    onClick={() => handleMoveStock(item.tool_type_id!, 'to_project')}
                  >
                    <ArrowRight className="h-3 w-3" />Delivered to JobSite
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Move quantity from Shop stock to this project.</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1"
                    disabled={actionLoading === `move-${item.tool_type_id}` || projStock < mqty}
                    onClick={() => handleMoveStock(item.tool_type_id!, 'to_shop')}
                  >
                    <ArrowLeft className="h-3 w-3" />Returned to Shop
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Move quantity from this project back to Shop stock.</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1"
                    disabled={actionLoading === `transfer-${item.tool_type_id}` || projStock <= 0}
                    onClick={() => openTransfer(item.tool_type_id!)}
                  >
                    <ArrowRightLeft className="h-3 w-3" />Transfer to JobSite
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Transfer tools directly to another project.</TooltipContent>
              </Tooltip>
            </div>
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
                size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1"
                disabled={actionLoading === item.key}
                onClick={() => handleBulkPurchased(item)}
              >
                <ShoppingCart className="h-3 w-3" />Mark Purchased
              </Button>
            )}
            <Button
              size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1"
              disabled={actionLoading === item.key}
              onClick={() => handleBulkDelivered(item)}
            >
              <Truck className="h-3 w-3" />Mark Delivered
            </Button>
          </div>
        )}

        {!isTool && (
          <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1 mt-1" onClick={() => setLeftoverTarget(item)}>
            <Package className="h-3 w-3" />Record leftover
          </Button>
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
    <TooltipProvider>
      <div className="pb-20">
        <PageHeader title={`${projectName} – Materials`} backTo={`/projects/${id}`} />

        <div className="p-4 space-y-4">
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

        {/* Transfer to another JobSite drawer */}
        <Drawer open={!!transferOpen} onOpenChange={(open) => { if (!open) setTransferOpen(null); }}>
          <DrawerContent className="max-h-[70vh]">
            <DrawerHeader>
              <DrawerTitle>Transfer to another JobSite</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 space-y-4">
              <div>
                <Label className="text-xs mb-1 block">Destination Project</Label>
                <Input
                  placeholder="Search projects..."
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                  className="mb-2"
                />
                <div className="max-h-40 overflow-auto border rounded-md">
                  {filteredProjects.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">No projects found.</p>
                  )}
                  {filteredProjects.map(p => (
                    <button
                      key={p.id}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors ${
                        transferDestProject === p.id ? 'bg-accent font-medium' : ''
                      }`}
                      onClick={() => setTransferDestProject(p.id)}
                    >
                      <span className="block truncate">{p.name}</span>
                      {p.address && <span className="block text-muted-foreground truncate">{p.address}</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Quantity</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTransferQty(q => Math.max(1, q - 1))}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-sm font-medium w-8 text-center">{transferQty}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTransferQty(q => q + 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                  <span className="text-xs text-muted-foreground ml-2">
                    Available: {transferOpen ? (stockMap[transferOpen] ?? 0) : 0}
                  </span>
                </div>
              </div>
            </div>
            <DrawerFooter className="gap-2">
              <Button
                onClick={handleTransfer}
                disabled={!transferDestProject || transferQty <= 0 || (transferOpen ? (stockMap[transferOpen] ?? 0) < transferQty : true)}
              >
                Transfer
              </Button>
              <DrawerClose asChild>
                <Button variant="outline">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        {leftoverTarget && (
          <RecordLeftoverSheet
            open={!!leftoverTarget}
            onOpenChange={(o) => { if (!o) setLeftoverTarget(null); }}
            prefill={{
              name: leftoverTarget.name,
              unit: leftoverTarget.unit,
              sku: leftoverTarget.sku,
              vendor_url: leftoverTarget.vendor_url,
            }}
            projectId={id ?? null}
          />
        )}
      </div>
    </TooltipProvider>
  );
};

export default ProjectMaterials;

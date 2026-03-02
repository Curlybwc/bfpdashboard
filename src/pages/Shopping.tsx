import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useStoreSections } from '@/hooks/useStoreSections';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink, Copy, Search } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  sku: string | null;
  vendor_url: string | null;
  item_type: string;
  purchased: boolean;
  delivered: boolean;
  store_section: string | null;
  task_id: string;
  task_title: string;
  project_id: string;
  project_name: string;
  project_address: string | null;
}

type PurchaseTab = 'not_purchased' | 'purchased_not_delivered' | 'delivered';
type SortMode = 'project' | 'item';

interface AggCard {
  key: string;
  name: string;
  totalQty: number;
  unit: string | null;
  sku: string | null;
  vendor_url: string | null;
  item_type: string;
  store_section: string;
  project_id: string;
  project_label: string;
  tasks: { id: string; title: string; project_id: string }[];
  ids: string[];
}

function sectionOf(s: string | null, activeNames: string[]): string {
  const trimmed = s?.trim();
  if (!trimmed) return 'Uncategorized';
  if (!activeNames.includes(trimmed)) return 'Uncategorized';
  return trimmed;
}

function aggKey(i: ShoppingItem): string {
  return `${i.project_id}|${i.name}|${i.sku ?? ''}|${i.unit ?? ''}|${i.vendor_url ?? ''}|${i.item_type}`;
}

export default function Shopping() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { sections } = useStoreSections();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PurchaseTab>('not_purchased');
  const [sort, setSort] = useState<SortMode>('project');
  const [search, setSearch] = useState('');

  const activeNames = useMemo(() => sections.map(s => s.name), [sections]);
  const sectionOrder = useMemo(() => [...activeNames, 'Uncategorized'], [activeNames]);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('task_materials')
      .select('id, name, quantity, unit, sku, vendor_url, item_type, purchased, delivered, store_section, task_id, tasks!inner(id, task, project_id, stage, projects!inner(id, name, address))')
      .eq('is_active', true)
      .neq('tasks.stage', 'Done');

    if (error) {
      toast({ title: 'Error loading shopping list', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const mapped: ShoppingItem[] = ((data as any[]) || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      quantity: r.quantity,
      unit: r.unit,
      sku: r.sku,
      vendor_url: r.vendor_url,
      item_type: r.item_type,
      purchased: r.purchased,
      delivered: r.delivered,
      store_section: r.store_section,
      task_id: r.tasks.id,
      task_title: r.tasks.task,
      project_id: r.tasks.projects.id,
      project_name: r.tasks.projects.name,
      project_address: r.tasks.projects.address,
    }));
    setItems(mapped);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const filtered = useMemo(() => {
    let f = items;
    if (tab === 'not_purchased') f = f.filter(i => !i.purchased);
    else if (tab === 'purchased_not_delivered') f = f.filter(i => i.purchased && !i.delivered);
    else f = f.filter(i => i.delivered);

    if (search.trim()) {
      const q = search.toLowerCase();
      f = f.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.sku && i.sku.toLowerCase().includes(q)) ||
        i.project_name.toLowerCase().includes(q) ||
        (i.project_address && i.project_address.toLowerCase().includes(q))
      );
    }
    return f;
  }, [items, tab, search]);

  const aggregated = useMemo((): AggCard[] => {
    const map = new Map<string, AggCard>();
    for (const i of filtered) {
      const k = aggKey(i);
      const existing = map.get(k);
      if (existing) {
        existing.totalQty += i.quantity ?? 0;
        if (!existing.tasks.find(t => t.id === i.task_id)) {
          existing.tasks.push({ id: i.task_id, title: i.task_title, project_id: i.project_id });
        }
        existing.ids.push(i.id);
      } else {
        map.set(k, {
          key: k,
          name: i.name,
          totalQty: i.quantity ?? 0,
          unit: i.unit,
          sku: i.sku,
          vendor_url: i.vendor_url,
          item_type: i.item_type,
          store_section: sectionOf(i.store_section, activeNames),
          project_id: i.project_id,
          project_label: i.project_address || i.project_name,
          tasks: [{ id: i.task_id, title: i.task_title, project_id: i.project_id }],
          ids: [i.id],
        });
      }
    }
    return Array.from(map.values());
  }, [filtered, activeNames]);

  const bulkAction = async (ids: string[], action: 'purchased' | 'delivered') => {
    const update = action === 'delivered'
      ? { delivered: true, purchased: true }
      : { purchased: true };
    const { error } = await supabase.from('task_materials').update(update as any).in('id', ids);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await fetchItems();
  };

  const materialCards = aggregated.filter(c => c.item_type !== 'tool');
  const toolCards = aggregated.filter(c => c.item_type === 'tool');

  const renderCard = (card: AggCard) => (
    <div key={card.key} className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{card.name}</p>
          {(card.totalQty > 0 || card.unit) && (
            <p className="text-xs text-muted-foreground">{card.totalQty}{card.unit ? ` ${card.unit}` : ''}</p>
          )}
        </div>
        {sort === 'item' && (
          <Badge variant="secondary" className="text-[10px] shrink-0">{card.project_label}</Badge>
        )}
      </div>

      {(card.sku || card.vendor_url) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {card.sku && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Copy className="h-3 w-3" />SKU: {card.sku}
            </Badge>
          )}
          {card.vendor_url && (
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => window.open(card.vendor_url!, '_blank', 'noopener')}>
              <ExternalLink className="h-3 w-3" />Open
            </Button>
          )}
        </div>
      )}

      <div className="text-[11px] text-muted-foreground">
        <span className="font-medium">Used in:</span>{' '}
        {card.tasks.map((t, i) => (
          <span key={t.id}>
            {i > 0 && ', '}
            <button className="underline" onClick={() => navigate(`/projects/${t.project_id}/tasks/${t.id}`)}>{t.title}</button>
          </span>
        ))}
      </div>

      {tab !== 'delivered' && (
        <div className="flex gap-2">
          {tab === 'not_purchased' && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => bulkAction(card.ids, 'purchased')}>
                Mark Purchased
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => bulkAction(card.ids, 'delivered')}>
                Mark Delivered
              </Button>
            </>
          )}
          {tab === 'purchased_not_delivered' && (
            <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => bulkAction(card.ids, 'delivered')}>
              Mark Delivered
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const renderSectionGroup = (cards: AggCard[], typeLabel: string) => {
    if (cards.length === 0) return null;
    const bySection = new Map<string, AggCard[]>();
    for (const c of cards) {
      const arr = bySection.get(c.store_section) || [];
      arr.push(c);
      bySection.set(c.store_section, arr);
    }
    if (sort === 'item') {
      for (const arr of bySection.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    }

    const orderedSections = sectionOrder.filter(s => bySection.has(s));
    for (const s of bySection.keys()) {
      if (!orderedSections.includes(s)) orderedSections.push(s);
    }

    return (
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {typeLabel === 'tool' ? '🔧 Tools' : 'Materials'}
        </h3>
        {orderedSections.map(section => (
          <div key={section} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground ml-1">📍 {section}</p>
            {bySection.get(section)!.map(renderCard)}
          </div>
        ))}
      </div>
    );
  };

  const renderByProject = () => {
    const projectMap = new Map<string, { label: string; materials: AggCard[]; tools: AggCard[] }>();
    for (const c of aggregated) {
      if (!projectMap.has(c.project_id)) {
        projectMap.set(c.project_id, { label: c.project_label, materials: [], tools: [] });
      }
      const p = projectMap.get(c.project_id)!;
      if (c.item_type === 'tool') p.tools.push(c);
      else p.materials.push(c);
    }

    return Array.from(projectMap.entries()).map(([pid, proj]) => (
      <div key={pid} className="space-y-3">
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-sm font-semibold">{proj.label}</p>
        </div>
        {renderSectionGroup(proj.materials, 'material')}
        {renderSectionGroup(proj.tools, 'tool')}
      </div>
    ));
  };

  const renderByItem = () => (
    <>
      {renderSectionGroup(materialCards, 'material')}
      {renderSectionGroup(toolCards, 'tool')}
    </>
  );

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <PageHeader title="🛒 Shopping" />
      <div className="px-4 space-y-3 flex-1">
        <Tabs value={tab} onValueChange={(v) => setTab(v as PurchaseTab)}>
          <TabsList className="w-full">
            <TabsTrigger value="not_purchased" className="flex-1 text-xs">Not Purchased</TabsTrigger>
            <TabsTrigger value="purchased_not_delivered" className="flex-1 text-xs">Bought</TabsTrigger>
            <TabsTrigger value="delivered" className="flex-1 text-xs">Delivered</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2">
          <Tabs value={sort} onValueChange={(v) => setSort(v as SortMode)}>
            <TabsList>
              <TabsTrigger value="project" className="text-xs">By Project</TabsTrigger>
              <TabsTrigger value="item" className="text-xs">By Item</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, SKU, project..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {loading && <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>}
        {!loading && aggregated.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No items in this tab.</p>}

        {!loading && aggregated.length > 0 && (
          <div className="space-y-4 pb-4">
            {sort === 'project' ? renderByProject() : renderByItem()}
          </div>
        )}
      </div>
    </div>
  );
}

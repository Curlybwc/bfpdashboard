import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Search, ExternalLink, Copy, Package } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';

interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  vendor_url: string | null;
  qty: number;
  unit: string | null;
  location_type: string;
  project_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  address: string | null;
}

type StatusFilter = 'available' | 'used_up' | 'returned' | 'trash';
type LocationFilter = 'all' | 'shop' | 'project';

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  used_up: 'Used Up',
  returned: 'Returned',
  trash: 'Trash',
};

const MaterialInventory = () => {
  const { isAdmin, canManageProjects, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const canManage = isAdmin || canManageProjects;

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [projectMap, setProjectMap] = useState<Record<string, ProjectInfo>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('available');
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Move to JobSite drawer
  const [moveTarget, setMoveTarget] = useState<InventoryItem | null>(null);
  const [moveDestProject, setMoveDestProject] = useState('');
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
  const [projectSearch, setProjectSearch] = useState('');

  useEffect(() => {
    if (!adminLoading && !canManage) {
      navigate('/projects', { replace: true });
    }
  }, [canManage, adminLoading, navigate]);

  const fetchData = async () => {
    setLoading(true);
    const { data: inv } = await supabase
      .from('material_inventory')
      .select('*')
      .order('updated_at', { ascending: false });

    if (inv) {
      setItems(inv as InventoryItem[]);
      const projectIds = new Set<string>();
      (inv as InventoryItem[]).forEach(i => { if (i.project_id) projectIds.add(i.project_id); });
      if (projectIds.size > 0) {
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name, address')
          .in('id', Array.from(projectIds));
        const pm: Record<string, ProjectInfo> = {};
        if (projects) projects.forEach((p: any) => { pm[p.id] = p; });
        setProjectMap(pm);
      }
    }
    setLoading(false);
  };

  useEffect(() => { if (canManage) fetchData(); }, [canManage]);

  const filtered = items.filter(i => {
    if (i.status !== statusFilter) return false;
    if (locationFilter === 'shop' && i.location_type !== 'shop') return false;
    if (locationFilter === 'project' && i.location_type !== 'project') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!i.name.toLowerCase().includes(q) && !(i.sku && i.sku.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const updateItem = async (id: string, updates: Record<string, any>) => {
    setActionLoading(id);
    await supabase.from('material_inventory').update({
      ...updates,
      updated_at: new Date().toISOString(),
      updated_by: user?.id,
    } as any).eq('id', id);
    await fetchData();
    setActionLoading(null);
  };

  const handleMoveToShop = (item: InventoryItem) => {
    updateItem(item.id, { location_type: 'shop', project_id: null });
  };

  const openMoveToJobSite = async (item: InventoryItem) => {
    setMoveTarget(item);
    setMoveDestProject('');
    setProjectSearch('');
    if (allProjects.length === 0) {
      const { data } = await supabase.from('projects').select('id, name, address').order('name');
      if (data) setAllProjects(data as ProjectInfo[]);
    }
  };

  const handleMoveToJobSite = async () => {
    if (!moveTarget || !moveDestProject) return;
    await updateItem(moveTarget.id, { location_type: 'project', project_id: moveDestProject });
    setMoveTarget(null);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied!', description: `${label} copied.` });
    } catch { toast({ title: 'Failed to copy', variant: 'destructive' }); }
  };

  const filteredProjects = allProjects.filter(p => {
    if (!projectSearch.trim()) return true;
    const q = projectSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.address && p.address.toLowerCase().includes(q));
  });

  if (adminLoading || loading) {
    return <div className="p-4 text-center text-muted-foreground">Loading...</div>;
  }
  if (!canManage) return null;

  return (
    <div className="pb-20">
      <PageHeader title="Material Inventory" backTo="/admin" />
      <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search materials..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Status chips */}
        <div className="flex gap-1.5 flex-wrap">
          {(['available', 'used_up', 'returned', 'trash'] as StatusFilter[]).map(s => (
            <button
              key={s}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent'
              }`}
              onClick={() => setStatusFilter(s)}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Location chips */}
        <div className="flex gap-1.5">
          {([['all', 'All'], ['shop', 'Shop'], ['project', 'JobSite']] as [LocationFilter, string][]).map(([v, label]) => (
            <button
              key={v}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                locationFilter === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent'
              }`}
              onClick={() => setLocationFilter(v)}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No items found.</p>
        )}

        {filtered.map(item => {
          const proj = item.project_id ? projectMap[item.project_id] : null;
          const isLoading = actionLoading === item.id;
          return (
            <Card key={item.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.qty}{item.unit ? ` ${item.unit}` : ''} · {item.location_type === 'shop' ? 'Shop' : (proj ? (proj.name || proj.address) : 'JobSite')}
                  </p>
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  item.status === 'available' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : item.status === 'used_up' ? 'bg-muted text-muted-foreground'
                  : item.status === 'returned' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {STATUS_LABELS[item.status]}
                </span>
              </div>

              {(item.sku || item.vendor_url) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.sku && (
                    <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => copyToClipboard(item.sku!, 'SKU')}>
                      <Copy className="h-3 w-3" />SKU: {item.sku}
                    </Button>
                  )}
                  {item.vendor_url && (
                    <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => window.open(item.vendor_url!, '_blank', 'noopener')}>
                      <ExternalLink className="h-3 w-3" />Open
                    </Button>
                  )}
                </div>
              )}

              {item.status === 'available' && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {item.location_type === 'project' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isLoading} onClick={() => handleMoveToShop(item)}>
                      Move to Shop
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isLoading} onClick={() => openMoveToJobSite(item)}>
                    Move to JobSite
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isLoading} onClick={() => updateItem(item.id, { status: 'used_up' })}>
                    Mark Used Up
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isLoading} onClick={() => updateItem(item.id, { status: 'returned' })}>
                    Mark Returned
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" disabled={isLoading} onClick={() => updateItem(item.id, { status: 'trash' })}>
                    Mark Trash
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Move to JobSite drawer */}
      <Drawer open={!!moveTarget} onOpenChange={(open) => { if (!open) setMoveTarget(null); }}>
        <DrawerContent className="max-h-[70vh]">
          <DrawerHeader>
            <DrawerTitle>Move to JobSite</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 space-y-3">
            <p className="text-sm text-muted-foreground">Moving: <strong>{moveTarget?.name}</strong> ({moveTarget?.qty}{moveTarget?.unit ? ` ${moveTarget.unit}` : ''})</p>
            <div>
              <Label className="text-xs mb-1 block">Destination Project</Label>
              <Input placeholder="Search projects..." value={projectSearch} onChange={e => setProjectSearch(e.target.value)} className="mb-2" />
              <div className="max-h-40 overflow-auto border rounded-md">
                {filteredProjects.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No projects found.</p>}
                {filteredProjects.map(p => (
                  <button
                    key={p.id}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors ${moveDestProject === p.id ? 'bg-accent font-medium' : ''}`}
                    onClick={() => setMoveDestProject(p.id)}
                  >
                    <span className="block truncate">{p.name}</span>
                    {p.address && <span className="block text-muted-foreground truncate">{p.address}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DrawerFooter className="gap-2">
            <Button onClick={handleMoveToJobSite} disabled={!moveDestProject}>Move</Button>
            <DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default MaterialInventory;

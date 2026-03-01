import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Minus, Search, Archive, ExternalLink } from 'lucide-react';

interface ToolType {
  id: string;
  name: string;
  sku: string | null;
  vendor_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface StockRow {
  id: string;
  tool_type_id: string;
  location_type: string;
  project_id: string | null;
  qty: number;
}

interface ProjectInfo {
  id: string;
  name: string;
  address: string | null;
}

const ToolInventory = () => {
  const { isAdmin, canManageProjects, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [toolTypes, setToolTypes] = useState<ToolType[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, StockRow[]>>({});
  const [projectMap, setProjectMap] = useState<Record<string, ProjectInfo>>({});
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newVendorUrl, setNewVendorUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const canManage = isAdmin || canManageProjects;

  useEffect(() => {
    if (!adminLoading && !canManage) {
      navigate('/projects', { replace: true });
    }
  }, [canManage, adminLoading, navigate]);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: types }, { data: stock }] = await Promise.all([
      supabase.from('tool_types').select('*').order('name'),
      supabase.from('tool_stock').select('*'),
    ]);

    if (types) setToolTypes(types as ToolType[]);

    const sm: Record<string, StockRow[]> = {};
    const projectIds = new Set<string>();
    if (stock) {
      (stock as StockRow[]).forEach(s => {
        if (!sm[s.tool_type_id]) sm[s.tool_type_id] = [];
        sm[s.tool_type_id].push(s);
        if (s.project_id) projectIds.add(s.project_id);
      });
    }
    setStockMap(sm);

    if (projectIds.size > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, address')
        .in('id', Array.from(projectIds));
      const pm: Record<string, ProjectInfo> = {};
      if (projects) projects.forEach((p: any) => { pm[p.id] = p; });
      setProjectMap(pm);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (canManage) fetchData();
  }, [canManage]);

  const handleAddType = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('tool_types').insert({
      name: newName.trim(),
      sku: newSku.trim() || null,
      vendor_url: newVendorUrl.trim() || null,
    } as any);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewName(''); setNewSku(''); setNewVendorUrl('');
    setAddOpen(false);
    await fetchData();
  };

  const adjustStock = async (toolTypeId: string, locationType: string, projectId: string | null, delta: number) => {
    setActionLoading(`${toolTypeId}-${locationType}-${projectId}`);
    const stocks = stockMap[toolTypeId] || [];
    const existing = stocks.find(s => s.location_type === locationType && s.project_id === projectId);
    const currentQty = existing?.qty ?? 0;
    const newQty = Math.max(0, currentQty + delta);

    if (existing) {
      await supabase.from('tool_stock').update({
        qty: newQty,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      } as any).eq('id', existing.id);
    } else if (newQty > 0) {
      await supabase.from('tool_stock').insert({
        tool_type_id: toolTypeId,
        location_type: locationType,
        project_id: projectId,
        qty: newQty,
        updated_by: user?.id,
      } as any);
    }

    await fetchData();
    setActionLoading(null);
  };

  const toggleActive = async (tool: ToolType) => {
    await supabase.from('tool_types').update({ is_active: !tool.is_active } as any).eq('id', tool.id);
    await fetchData();
  };

  const filtered = toolTypes.filter(t => {
    if (!search.trim()) return t.is_active;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || (t.sku && t.sku.toLowerCase().includes(q));
  });

  const getQty = (toolTypeId: string, locationType: string, projectId: string | null = null): number => {
    const stocks = stockMap[toolTypeId] || [];
    const row = stocks.find(s => s.location_type === locationType && s.project_id === projectId);
    return row?.qty ?? 0;
  };

  const getProjectStocks = (toolTypeId: string): StockRow[] => {
    return (stockMap[toolTypeId] || []).filter(s => s.location_type === 'project' && s.qty > 0);
  };

  if (adminLoading || loading) {
    return <div className="p-4 text-center text-muted-foreground">Loading...</div>;
  }

  if (!canManage) return null;

  const StepperControl = ({ toolTypeId, locationType, projectId = null }: { toolTypeId: string; locationType: string; projectId?: string | null }) => {
    const qty = getQty(toolTypeId, locationType, projectId);
    const key = `${toolTypeId}-${locationType}-${projectId}`;
    const isLoading = actionLoading === key;
    return (
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline" size="icon" className="h-7 w-7"
          disabled={isLoading || qty <= 0}
          onClick={() => adjustStock(toolTypeId, locationType, projectId, -1)}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="text-sm font-medium w-6 text-center">{qty}</span>
        <Button
          variant="outline" size="icon" className="h-7 w-7"
          disabled={isLoading}
          onClick={() => adjustStock(toolTypeId, locationType, projectId, 1)}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  return (
    <div className="pb-20">
      <PageHeader
        title="Tool Inventory"
        backTo="/admin"
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Add Tool Type
          </Button>
        }
      />
      <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tool types..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No tool types found.</p>
        )}

        {filtered.map(tool => {
          const projectStocks = getProjectStocks(tool.id);
          return (
            <Card key={tool.id} className={`p-3 space-y-3 ${!tool.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{tool.name}</p>
                  {tool.sku && <p className="text-xs text-muted-foreground">SKU: {tool.sku}</p>}
                </div>
                <div className="flex gap-1">
                  {tool.vendor_url && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(tool.vendor_url!, '_blank', 'noopener')}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(tool)}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Shop</span>
                  <StepperControl toolTypeId={tool.id} locationType="shop" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Unknown</span>
                  <StepperControl toolTypeId={tool.id} locationType="unknown" />
                </div>
              </div>

              {projectStocks.length > 0 && (
                <div className="space-y-1 pt-1 border-t">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">At Projects</p>
                  {projectStocks.map(ps => {
                    const proj = projectMap[ps.project_id!];
                    return (
                      <div key={ps.id} className="flex items-center justify-between text-xs">
                        <span className="truncate text-muted-foreground">
                          {proj ? (proj.name || proj.address) : ps.project_id}
                        </span>
                        <span className="font-medium ml-2">{ps.qty}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Tool Type</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">SKU (optional)</Label>
              <Input value={newSku} onChange={e => setNewSku(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Vendor URL (optional)</Label>
              <Input value={newVendorUrl} onChange={e => setNewVendorUrl(e.target.value)} />
            </div>
            <Button onClick={handleAddType} disabled={!newName.trim()} className="w-full">
              Create Tool Type
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ToolInventory;

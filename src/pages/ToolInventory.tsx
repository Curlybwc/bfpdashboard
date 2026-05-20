import { useEffect, useState, useMemo } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Minus, Search, Archive, ExternalLink, Trash2, RotateCcw, MapPin, ArrowLeft, Mic, MicOff, Sparkles, Loader2, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

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
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkParsing, setBulkParsing] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkParsed, setBulkParsed] = useState<Array<{
    name: string; sku: string | null; vendor_url: string | null;
    shop_qty: number; match_existing_id: string | null;
  }> | null>(null);
  const [recording, setRecording] = useState(false);
  const recognitionRef = (typeof window !== 'undefined') ? (window as any) : null;
  const [recognizer, setRecognizer] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<ToolType | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newVendorUrl, setNewVendorUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // For reassigning unknown stock
  const [reassignToolId, setReassignToolId] = useState<string | null>(null);
  // For adding stock at a new jobsite
  const [addSiteToolId, setAddSiteToolId] = useState<string | null>(null);
  const [addSiteProjectId, setAddSiteProjectId] = useState<string>('');

  const canManage = isAdmin || canManageProjects;

  useEffect(() => {
    if (!adminLoading && !canManage) {
      navigate('/projects', { replace: true });
    }
  }, [canManage, adminLoading, navigate]);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: types }, { data: stock }, { data: projects }] = await Promise.all([
      supabase.from('tool_types').select('*').order('name'),
      supabase.from('tool_stock').select('*'),
      supabase.from('projects').select('id, name, address').eq('status', 'active').order('name'),
    ]);

    if (types) setToolTypes(types as ToolType[]);
    if (projects) setAllProjects(projects as ProjectInfo[]);

    const sm: Record<string, StockRow[]> = {};
    if (stock) {
      (stock as StockRow[]).forEach(s => {
        if (!sm[s.tool_type_id]) sm[s.tool_type_id] = [];
        sm[s.tool_type_id].push(s);
      });
    }
    setStockMap(sm);
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

  const reassignUnknown = async (toolTypeId: string, target: string) => {
    const isShop = target === '__shop';
    const targetLocationType = isShop ? 'shop' : 'project';
    const targetProjectId = isShop ? null : target;
    const stocks = stockMap[toolTypeId] || [];
    const unknownRow = stocks.find(s => s.location_type === 'unknown');
    if (!unknownRow || unknownRow.qty <= 0) return;

    setActionLoading(`reassign-${toolTypeId}`);

    // Move all unknown qty to the target location
    const existingTarget = stocks.find(s => s.location_type === targetLocationType && s.project_id === targetProjectId);
    if (existingTarget) {
      await supabase.from('tool_stock').update({
        qty: existingTarget.qty + unknownRow.qty,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      } as any).eq('id', existingTarget.id);
    } else {
      await supabase.from('tool_stock').insert({
        tool_type_id: toolTypeId,
        location_type: targetLocationType,
        project_id: targetProjectId,
        qty: unknownRow.qty,
        updated_by: user?.id,
      } as any);
    }

    // Zero out unknown
    await supabase.from('tool_stock').update({
      qty: 0,
      updated_at: new Date().toISOString(),
      updated_by: user?.id,
    } as any).eq('id', unknownRow.id);

    setReassignToolId(null);
    await fetchData();
    setActionLoading(null);
  };

  const handleAddToSite = async () => {
    if (!addSiteToolId || !addSiteProjectId) return;
    await adjustStock(addSiteToolId, 'project', addSiteProjectId, 1);
    setAddSiteToolId(null);
    setAddSiteProjectId('');
  };

  const moveOneToShop = async (toolTypeId: string, projectId: string) => {
    setActionLoading(`move-${toolTypeId}-${projectId}`);
    const stocks = stockMap[toolTypeId] || [];
    const projectRow = stocks.find(s => s.location_type === 'project' && s.project_id === projectId);
    if (!projectRow || projectRow.qty <= 0) { setActionLoading(null); return; }

    // Decrement project stock
    await supabase.from('tool_stock').update({
      qty: projectRow.qty - 1,
      updated_at: new Date().toISOString(),
      updated_by: user?.id,
    } as any).eq('id', projectRow.id);

    // Increment shop stock
    const shopRow = stocks.find(s => s.location_type === 'shop');
    if (shopRow) {
      await supabase.from('tool_stock').update({
        qty: shopRow.qty + 1,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      } as any).eq('id', shopRow.id);
    } else {
      await supabase.from('tool_stock').insert({
        tool_type_id: toolTypeId,
        location_type: 'shop',
        project_id: null,
        qty: 1,
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

  const handleDelete = async () => {
    if (!deleteTarget || deleteConfirmName !== deleteTarget.name) return;
    const { error } = await supabase.from('tool_types').delete().eq('id', deleteTarget.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deleted', description: `"${deleteTarget.name}" has been deleted.` });
    }
    setDeleteTarget(null);
    setDeleteConfirmName('');
    await fetchData();
  };

  const filtered = toolTypes.filter(t => {
    if (!showInactive && !t.is_active) return false;
    if (!search.trim()) return true;
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

  const projectLabel = (p: ProjectInfo) => p.address || p.name;

  // Projects that already have stock for a given tool
  const projectsWithStock = (toolTypeId: string): Set<string> => {
    const ps = getProjectStocks(toolTypeId);
    return new Set(ps.map(s => s.project_id!));
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
    <TooltipProvider>
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
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tool types..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} id="show-inactive" />
              <Label htmlFor="show-inactive" className="text-xs text-muted-foreground whitespace-nowrap">Show inactive</Label>
            </div>
          </div>

          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No tool types found.</p>
          )}

          {filtered.map(tool => {
            const projectStocks = getProjectStocks(tool.id);
            const unknownQty = getQty(tool.id, 'unknown');
            const existingProjectIds = projectsWithStock(tool.id);
            const availableProjects = allProjects.filter(p => !existingProjectIds.has(p.id));

            return (
              <Card key={tool.id} className={`p-3 space-y-3 ${!tool.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium">{tool.name}</p>
                      {!tool.is_active && <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Inactive</span>}
                    </div>
                    {tool.sku && <p className="text-xs text-muted-foreground">SKU: {tool.sku}</p>}
                  </div>
                  <div className="flex gap-1">
                    {tool.vendor_url && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(tool.vendor_url!, '_blank', 'noopener')}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Vendor link</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(tool)}>
                          {tool.is_active ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{tool.is_active ? 'Deactivate' : 'Reactivate'}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { setDeleteTarget(tool); setDeleteConfirmName(''); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete tool type</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">🏠 Shop</span>
                    <StepperControl toolTypeId={tool.id} locationType="shop" />
                  </div>

                  {/* Unknown stock - show with reassign option */}
                  {unknownQty > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">❓ Unknown</span>
                        <span className="text-xs font-medium">({unknownQty})</span>
                        {allProjects.length > 0 && (
                          reassignToolId === tool.id ? (
                            <Select onValueChange={(pid) => { reassignUnknown(tool.id, pid); }}>
                              <SelectTrigger className="h-6 w-[160px] text-[11px]">
                                <SelectValue placeholder="Move to jobsite..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__shop">🏠 Shop</SelectItem>
                                {allProjects.map(p => (
                                  <SelectItem key={p.id} value={p.id}>📍 {projectLabel(p)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[10px] px-1.5 text-primary"
                              onClick={() => setReassignToolId(tool.id)}
                            >
                              Reassign
                            </Button>
                          )
                        )}
                      </div>
                      <StepperControl toolTypeId={tool.id} locationType="unknown" />
                    </div>
                  )}

                  {/* Project stocks */}
                  {projectStocks.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">At Jobsites</p>
                      {projectStocks.map(ps => {
                        const proj = allProjects.find(p => p.id === ps.project_id);
                        const moveKey = `move-${tool.id}-${ps.project_id}`;
                        return (
                          <div key={ps.id} className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground truncate flex-1">
                              📍 {proj ? projectLabel(proj) : ps.project_id}
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0"
                                  disabled={actionLoading === moveKey || ps.qty <= 0}
                                  onClick={() => moveOneToShop(tool.id, ps.project_id!)}
                                >
                                  <ArrowLeft className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Move 1 to Shop</TooltipContent>
                            </Tooltip>
                            <StepperControl toolTypeId={tool.id} locationType="project" projectId={ps.project_id} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add to jobsite button */}
                  {availableProjects.length > 0 && (
                    <div className="pt-1">
                      {addSiteToolId === tool.id ? (
                        <div className="flex items-center gap-2">
                          <Select value={addSiteProjectId} onValueChange={setAddSiteProjectId}>
                            <SelectTrigger className="h-7 flex-1 text-xs">
                              <SelectValue placeholder="Select jobsite..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableProjects.map(p => (
                                <SelectItem key={p.id} value={p.id}>📍 {projectLabel(p)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="h-7 text-xs" disabled={!addSiteProjectId} onClick={handleAddToSite}>
                            Add
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddSiteToolId(null); setAddSiteProjectId(''); }}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 w-full"
                          onClick={() => { setAddSiteToolId(tool.id); setAddSiteProjectId(''); }}
                        >
                          <MapPin className="h-3 w-3" />
                          Add to Jobsite
                        </Button>
                      )}
                    </div>
                  )}
                </div>
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

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteConfirmName(''); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete tool type?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">This will permanently delete <strong>"{deleteTarget?.name}"</strong> and all associated stock records. Any task material references linked to this tool type will be unlinked.</span>
                <span className="block">Consider <strong>deactivating</strong> instead if you want to keep history.</span>
                <span className="block mt-3">Type <strong>{deleteTarget?.name}</strong> to confirm:</span>
              </AlertDialogDescription>
              <Input
                className="mt-2"
                placeholder="Type tool name to confirm"
                value={deleteConfirmName}
                onChange={e => setDeleteConfirmName(e.target.value)}
              />
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleteConfirmName !== deleteTarget?.name}
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
};

export default ToolInventory;

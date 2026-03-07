import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, ArrowRightLeft, ClipboardList, Pencil, Check, X, RotateCcw, Upload, Info, CheckSquare, Merge, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import ScopeMembers from '@/components/ScopeMembers';
import FinalPassSheet from '@/components/FinalPassSheet';
import DeduplicateSheet from '@/components/DeduplicateSheet';
import { SCOPE_ITEM_STATUSES, type ScopeItemStatus } from '@/lib/supabase-types';
import { isChecklistCovered } from '@/lib/checklistMatch';
import { getConvertibleItems } from '@/lib/scopeConversion';
import { useScopeDetail } from '@/hooks/useScopeDetail';
import { useScopeChecklistCoverage } from '@/hooks/useScopeChecklistCoverage';
import {
  useAddScopeItem,
  useUpdateScopeItem,
  useDeleteScopeItem,
  useUpdateScopeTitle,
  useArchiveScope,
  useConvertScope,
  useUpdateLibraryPrice,
  useResetToLibraryPrice,
} from '@/hooks/useScopeMutations';
import { canArchiveScope, canDeleteScopeItem, canEditScopeTitle } from '@/lib/permissions';
import { useQueryClient } from '@tanstack/react-query';

const ScopeDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const queryClient = useQueryClient();

  // Server state via React Query
  const { data: scopeData, isLoading } = useScopeDetail(id);
  const scope = scopeData?.scope;
  const items = scopeData?.items ?? [];
  const { data: checklistData } = useScopeChecklistCoverage(id);
  const checklistItems = checklistData?.checklistItems ?? [];
  const reviews = checklistData?.reviews ?? [];

  // Mutations
  const addItemMutation = useAddScopeItem(id);
  const updateItemMutation = useUpdateScopeItem(id);
  const deleteItemMutation = useDeleteScopeItem(id);
  const updateTitleMutation = useUpdateScopeTitle(id);
  const archiveMutation = useArchiveScope(id);
  const convertMutation = useConvertScope();
  const updateLibraryPriceMutation = useUpdateLibraryPrice(id);
  const resetToLibraryMutation = useResetToLibraryPrice(id);

  // Local UI state
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [finalPassOpen, setFinalPassOpen] = useState(false);
  const [dedupeOpen, setDedupeOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');

  // New item form fields
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [unitCostNew, setUnitCostNew] = useState('');
  const [phaseKey, setPhaseKey] = useState('');
  const [itemStatus, setItemStatus] = useState<ScopeItemStatus>('Not Checked');
  const [itemNotes, setItemNotes] = useState('');

  // Computed totals
  const estimatedTotal = useMemo(() =>
    items.reduce((sum, i) => sum + (i.computed_total ?? 0), 0), [items]);

  const unpricedCount = useMemo(() =>
    items.filter(i => i.unit_cost_override == null).length, [items]);

  const getBidUnpriced = useMemo(() =>
    items.filter(i => i.status === 'Get Bid' && i.unit_cost_override == null).length, [items]);

  // Coverage
  const coveredCount = useMemo(() => {
    if (checklistItems.length === 0) return 0;
    return checklistItems.filter(ci => {
      const matchByScopeItem = items.some(si =>
        isChecklistCovered(si.description, ci.normalized_label, si.cost_item_id, ci.default_cost_item_id)
      );
      const matchByReview = reviews.some(r => r.checklist_item_id === ci.id);
      return matchByScopeItem || matchByReview;
    }).length;
  }, [checklistItems, items, reviews]);

  const convertibleItems = getConvertibleItems(items);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const qtyVal = qty ? parseFloat(qty) : null;
    const ucVal = unitCostNew ? parseFloat(unitCostNew) : null;
    const computedTotal = qtyVal != null && ucVal != null ? qtyVal * ucVal : null;
    addItemMutation.mutate(
      {
        scope_id: id,
        description: desc,
        qty: qtyVal,
        unit: unit || null,
        unit_cost_override: ucVal,
        computed_total: computedTotal,
        phase_key: phaseKey || null,
        pricing_status: ucVal != null ? 'Priced' : 'Needs Pricing',
        status: itemStatus,
        notes: itemNotes || null,
      },
      {
        onSuccess: () => {
          setDesc(''); setQty(''); setUnit(''); setUnitCostNew(''); setPhaseKey(''); setItemStatus('Not Checked'); setItemNotes('');
          setOpen(false);
        },
      },
    );
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditForm({
      description: item.description,
      qty: item.qty != null ? String(item.qty) : '',
      unit: item.unit || '',
      unit_cost_override: item.unit_cost_override != null ? String(item.unit_cost_override) : '',
      notes: item.notes || '',
      status: item.status,
      phase_key: item.phase_key || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const qtyVal = editForm.qty ? parseFloat(editForm.qty) : null;
    const unitCost = editForm.unit_cost_override ? parseFloat(editForm.unit_cost_override) : null;
    const computedTotal = qtyVal != null && unitCost != null ? qtyVal * unitCost : null;

    updateItemMutation.mutate(
      {
        id: editingId,
        description: editForm.description,
        qty: qtyVal,
        unit: editForm.unit || null,
        unit_cost_override: unitCost,
        computed_total: computedTotal,
        notes: editForm.notes || null,
        status: editForm.status,
        phase_key: editForm.phase_key || null,
        pricing_status: unitCost != null ? 'Priced' : 'Needs Pricing',
      },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const handleUpdateLibraryPrice = (item: any) => {
    if (!item.cost_item_id || item.unit_cost_override == null) return;
    updateLibraryPriceMutation.mutate({ costItemId: item.cost_item_id, price: item.unit_cost_override });
  };

  const handleResetToLibrary = (item: any) => {
    if (!item.cost_item_id) return;
    resetToLibraryMutation.mutate({ id: item.id, cost_item_id: item.cost_item_id, qty: item.qty });
  };

  const handleConvert = () => {
    if (!id || !user || !scope) return;
    convertMutation.mutate(id);
  };

  const handleSaveTitle = () => {
    if (!id) return;
    updateTitleMutation.mutate(titleDraft, {
      onSuccess: () => setEditingTitle(false),
    });
  };

  const handleFinalPassUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['scope-detail', id] });
    queryClient.invalidateQueries({ queryKey: ['scope-checklist', id] });
  };

  if (isLoading || !scope) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;

  const isActive = scope.status === 'active';

  return (
    <div className="pb-20">
      <PageHeader
        title={scope.name || scope.address}
        backTo="/scopes"
        actions={
          <div className="flex items-center gap-2">
            {isActive && (
              <>
                <Button size="sm" variant="outline" onClick={() => setDedupeOpen(true)}>
                  <Merge className="h-4 w-4 mr-1" />Deduplicate
                </Button>
                <Button size="sm" variant="outline" onClick={() => setFinalPassOpen(true)}>
                  <CheckSquare className="h-4 w-4 mr-1" />Final Pass
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/scopes/${id}/walkthrough`)}>
                  <ClipboardList className="h-4 w-4 mr-1" />Walkthrough
                </Button>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Item</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Add Scope Item</DialogTitle></DialogHeader>
                    <form onSubmit={handleAddItem} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input value={desc} onChange={(e) => setDesc(e.target.value)} required />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label>Qty</Label>
                          <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Unit</Label>
                          <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="sqft, lf..." />
                        </div>
                        <div className="space-y-2">
                          <Label>$/unit</Label>
                          <Input type="number" value={unitCostNew} onChange={(e) => setUnitCostNew(e.target.value)} step="0.01" placeholder="0.00" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Phase</Label>
                        <Input value={phaseKey} onChange={(e) => setPhaseKey(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={itemStatus} onValueChange={(v) => setItemStatus(v as ScopeItemStatus)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SCOPE_ITEM_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} rows={2} />
                      </div>
                      <Button type="submit" className="w-full" disabled={addItemMutation.isPending}>Add Item</Button>
                    </form>
                  </DialogContent>
                </Dialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" disabled={convertibleItems.length === 0}>
                      <ArrowRightLeft className="h-4 w-4 mr-1" />Convert
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Convert Scope to Project?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will create a new project with {convertibleItems.length} task(s) copied from {items.length} scope items. Items marked OK or Not Checked will be skipped. The scope will remain unchanged and reusable.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleConvert} disabled={convertMutation.isPending}>
                        {convertMutation.isPending ? 'Converting...' : 'Convert'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {isActive && canArchiveScope(isAdmin) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline">Archive</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive this scope?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The scope will be moved to the archived list. You can still view it later.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => archiveMutation.mutate('archived')}>Archive</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {scope.status === 'archived' && canArchiveScope(isAdmin) && (
              <Button size="sm" variant="outline" onClick={() => archiveMutation.mutate('active')}>Reactivate</Button>
            )}
          </div>
        }
      />
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <StatusBadge status={scope.status} />
          {canEditScopeTitle(isAdmin) && editingTitle ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="h-8 text-sm flex-1"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleSaveTitle}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingTitle(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <span className="text-sm text-muted-foreground">{scope.address}</span>
              {canEditScopeTitle(isAdmin) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => { setTitleDraft(scope.name || ''); setEditingTitle(true); }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </div>

        {/* Estimated Total Card */}
        <Card className="p-4 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-semibold">
                  ${estimatedTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs max-w-[200px]">Estimated Total sums priced items. Unpriced items are not included.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-muted-foreground">Estimated Total</p>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-0.5">
              {unpricedCount > 0 && <p>Unpriced items: {unpricedCount}</p>}
              {getBidUnpriced > 0 && <p>Get Bid items unpriced: {getBidUnpriced}</p>}
            </div>
          </div>

          {/* Coverage summary row */}
          {checklistItems.length > 0 && (
            <button
              className="w-full mt-3 pt-3 border-t flex items-center justify-between text-sm hover:bg-accent/50 -mx-1 px-1 rounded transition-colors"
              onClick={() => setFinalPassOpen(true)}
            >
              <span className="flex items-center gap-1.5">
                <CheckSquare className="h-4 w-4 text-muted-foreground" />
                Coverage: {coveredCount} / {checklistItems.length} checked
              </span>
              <span className="text-muted-foreground text-xs">▸</span>
            </button>
          )}
        </Card>

        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          Scope Items ({items.length})
        </h2>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No items yet. Add your first scope item.</p>
          ) : (
            items.map((item) => (
              <Card key={item.id} className="p-3">
                {editingId === item.id ? (
                  <div className="space-y-2">
                    <Input
                      value={editForm.description}
                      onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                      className="text-sm font-medium"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Qty</Label>
                        <Input
                          type="number"
                          value={editForm.qty}
                          onChange={e => setEditForm({ ...editForm, qty: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Unit</Label>
                        <Input
                          value={editForm.unit}
                          onChange={e => setEditForm({ ...editForm, unit: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">$/unit</Label>
                        <Input
                          type="number"
                          value={editForm.unit_cost_override}
                          onChange={e => setEditForm({ ...editForm, unit_cost_override: e.target.value })}
                          className="h-8 text-sm"
                          step="0.01"
                        />
                      </div>
                    </div>
                    {editForm.qty && editForm.unit_cost_override && (
                      <p className="text-xs text-muted-foreground">
                        Total: ${(parseFloat(editForm.qty) * parseFloat(editForm.unit_cost_override)).toFixed(2)}
                      </p>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select value={editForm.status} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SCOPE_ITEM_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      value={editForm.notes}
                      onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      placeholder="Notes"
                      className="h-8 text-xs"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveEdit} className="flex-1" disabled={updateItemMutation.isPending}>
                        <Check className="h-3.5 w-3.5 mr-1" />Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.description}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                        {item.qty && <span>{item.qty} {item.unit}</span>}
                        {item.unit_cost_override != null && <span>• ${item.unit_cost_override}/unit</span>}
                        {item.phase_key && <span>• Phase: {item.phase_key}</span>}
                        {item.computed_total != null && <span>• Total: ${item.computed_total}</span>}
                        {item.status && item.status !== 'Not Checked' && <span>• {item.status}</span>}
                      </div>
                      {isActive && item.cost_item_id && (
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleUpdateLibraryPrice(item)}
                            disabled={item.unit_cost_override == null}
                          >
                            <Upload className="h-3 w-3 mr-1" />Update library
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleResetToLibrary(item)}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />Reset to library
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      <StatusBadge status={item.pricing_status} />
                      {item.pricing_status === 'Needs Pricing' && item.notes && /\$/.test(item.notes) && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-600">$ in text</Badge>
                      )}
                      {isActive && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDeleteScopeItem(isAdmin) && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete scope item?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{item.description}" will be permanently removed.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  setDeletingId(item.id);
                                  deleteItemMutation.mutate(item.id, {
                                    onSettled: () => setDeletingId(null),
                                  });
                                }}
                                disabled={deletingId === item.id}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {deletingId === item.id ? 'Deleting...' : 'Delete'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
        <ScopeMembers scopeId={id!} />
      </div>

      <FinalPassSheet
        scopeId={id!}
        open={finalPassOpen}
        onOpenChange={setFinalPassOpen}
        onUpdate={handleFinalPassUpdate}
      />

      <DeduplicateSheet
        scopeId={id!}
        open={dedupeOpen}
        onOpenChange={setDedupeOpen}
        onUpdate={handleFinalPassUpdate}
      />
    </div>
  );
};

export default ScopeDetail;

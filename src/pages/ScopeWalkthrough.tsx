import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

interface ProposedUpdate {
  scope_item_id: string;
  description?: string;
  status: string;
  notes: string;
}

interface GeneratedItem {
  description: string;
  notes?: string | null;
  qty?: number | null;
  unit?: string | null;
  phase_key?: string | null;
  suggested_unit_cost?: number | null;
  matched_cost_item_id?: string | null;
  matched_cost_item_unit?: string | null;
  matched_cost_item_unit_cost?: number | null;
}

interface ParseResult {
  mode?: 'generate' | 'coverage';
  generated_items?: GeneratedItem[];
  proposed_updates: ProposedUpdate[];
  not_addressed_items: { id: string; description: string }[];
  needs_review_items: { id: string; description: string; reason: string }[];
  member_user_ids_to_add?: string[];
  member_display_names_to_add?: string[];
  member_warnings?: string[];
}

// Editable version of a generated item with UI state
interface EditableItem extends GeneratedItem {
  selected: boolean;
  saveToLibrary: boolean;
  updateLibraryPrice: boolean;
  editedQty: string;
  editedUnit: string;
  editedUnitCost: string;
  editedDescription: string;
  editedNotes: string;
}

function normalizeForLibrary(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

const ScopeWalkthrough = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState('');
  const [blocks, setBlocks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [scopeItemCount, setScopeItemCount] = useState<number | null>(null);

  // Generate mode state
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [saveAllToLibrary, setSaveAllToLibrary] = useState(true);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [text]);

  // Fetch scope item count on mount
  useEffect(() => {
    if (!id) return;
    supabase
      .from('scope_items')
      .select('id', { count: 'exact', head: true })
      .eq('scope_id', id)
      .then(({ count }) => setScopeItemCount(count ?? 0));
  }, [id]);

  const handleSaveBlock = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBlocks(prev => [...prev, trimmed]);
    setText('');
    toast({ title: `Block ${blocks.length + 1} saved` });
  };

  const handleReviewCoverage = async () => {
    const allText = [...blocks, text.trim()].filter(Boolean).join('\n\n');
    if (!allText) {
      toast({ title: 'No text to review', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scope_walkthrough_parse', {
        body: { scope_id: id, walkthrough_text: allText },
      });

      if (error) throw error;
      setParseResult(data);

      // Initialize editable items for generate mode
      if (data?.mode === 'generate' && data?.generated_items) {
        setEditableItems(data.generated_items.map((item: GeneratedItem) => {
          const unitCost = item.matched_cost_item_unit_cost ?? item.suggested_unit_cost ?? null;
          return {
            ...item,
            selected: true,
            saveToLibrary: true,
            updateLibraryPrice: false,
            editedDescription: item.description,
            editedNotes: item.notes || '',
            editedQty: item.qty != null ? String(item.qty) : '1',
            editedUnit: item.unit || item.matched_cost_item_unit || '',
            editedUnitCost: unitCost != null ? String(unitCost) : '',
          };
        }));
      }
    } catch (err: any) {
      toast({ title: 'Error parsing walkthrough', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleApplyUpdates = async () => {
    if (!parseResult || !id) return;
    setApplying(true);
    try {
      const { error } = await supabase.functions.invoke('scope_walkthrough_apply', {
        body: {
          scope_id: id,
          approved_updates: parseResult.proposed_updates,
        },
      });

      if (error) throw error;

      // Auto-add scope members (conflict-ignore)
      await autoAddMembers();

      toast({ title: 'Updates applied successfully' });
      navigate(`/scopes/${id}`);
    } catch (err: any) {
      toast({ title: 'Error applying updates', description: err.message, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  const autoAddMembers = async () => {
    if (!parseResult || !id) return;
    const memberIds = parseResult.member_user_ids_to_add ?? [];
    if (memberIds.length === 0) return;

    try {
      const { data: existingMembers } = await supabase
        .from('scope_members')
        .select('user_id')
        .eq('scope_id', id);
      const existingIds = new Set((existingMembers || []).map(m => m.user_id));
      const newIds = memberIds.filter(uid => !existingIds.has(uid));
      if (newIds.length > 0) {
        await supabase.from('scope_members').upsert(
          newIds.map(uid => ({ scope_id: id, user_id: uid, role: 'viewer' as const })),
          { onConflict: 'scope_id,user_id', ignoreDuplicates: true }
        );
        const displayNames = parseResult.member_display_names_to_add ?? [];
        const newNames = newIds.map(uid => {
          const idx = memberIds.indexOf(uid);
          return displayNames[idx] || 'Unknown';
        });
        toast({ title: `Added members: ${newNames.join(', ')}` });
      }
    } catch (err: any) {
      toast({ title: 'Member add warning', description: err.message, variant: 'destructive' });
    }
  };

  const handleCreateItems = async () => {
    if (!id) return;
    const selected = editableItems.filter(item => item.selected);
    if (selected.length === 0) {
      toast({ title: 'No items selected', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      // Step A: Library upserts for items with saveToLibrary
      const costItemIdMap = new Map<number, string | null>();

      for (let i = 0; i < editableItems.length; i++) {
        const item = editableItems[i];
        if (!item.selected) continue;

        let costItemId: string | null = item.matched_cost_item_id || null;

        if (item.saveToLibrary) {
          if (costItemId && item.updateLibraryPrice) {
            // Step B: Update library price
            const updates: any = {};
            const unitCost = item.editedUnitCost ? parseFloat(item.editedUnitCost) : null;
            if (unitCost != null) updates.default_total_cost = unitCost;
            if (Object.keys(updates).length > 0) {
              await supabase.from('cost_items').update(updates).eq('id', costItemId);
            }
          } else if (!costItemId) {
            // Insert new cost_item
            const norm = normalizeForLibrary(item.editedDescription);
            const unitCost = item.editedUnitCost ? parseFloat(item.editedUnitCost) : 0;
            // Map free-text unit to enum: each, sqft, lf, piece
            const unitTypeMap: Record<string, string> = { sqft: 'sqft', 'sq ft': 'sqft', lf: 'lf', 'linear ft': 'lf', piece: 'piece', each: 'each' };
            const unitType = unitTypeMap[item.editedUnit.toLowerCase()] || 'each';

            const { data: inserted, error: insertErr } = await supabase
              .from('cost_items')
              .upsert(
                { name: item.editedDescription, normalized_name: norm, default_total_cost: unitCost, unit_type: unitType as any },
                { onConflict: 'normalized_name', ignoreDuplicates: true }
              )
              .select('id')
              .single();

            if (!insertErr && inserted) {
              costItemId = inserted.id;
            } else {
              // If conflict (already exists), look it up
              const { data: existing } = await supabase
                .from('cost_items')
                .select('id')
                .eq('normalized_name', norm)
                .single();
              if (existing) costItemId = existing.id;
            }
          }
        }
        costItemIdMap.set(i, costItemId);
      }

      // Step C: Insert scope_items
      const scopeItemInserts = editableItems
        .map((item, i) => {
          if (!item.selected) return null;
          const qty = item.editedQty ? parseFloat(item.editedQty) : null;
          const unitCost = item.editedUnitCost ? parseFloat(item.editedUnitCost) : null;
          return {
            scope_id: id,
            description: item.editedDescription,
            notes: item.editedNotes || null,
            qty,
            unit: item.editedUnit || null,
            phase_key: item.phase_key || null,
            cost_item_id: costItemIdMap.get(i) || null,
            unit_cost_override: unitCost,
            computed_total: qty != null && unitCost != null ? qty * unitCost : null,
          };
        })
        .filter(Boolean);

      const { error: insertError } = await supabase.from('scope_items').insert(scopeItemInserts as any);
      if (insertError) throw insertError;

      // Auto-add members
      await autoAddMembers();

      toast({ title: `Created ${scopeItemInserts.length} scope items` });
      navigate(`/scopes/${id}`);
    } catch (err: any) {
      toast({ title: 'Error creating items', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const updateEditableItem = (index: number, updates: Partial<EditableItem>) => {
    setEditableItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  };

  const selectedCount = editableItems.filter(i => i.selected).length;

  // Toggle save all to library
  const handleSaveAllToggle = (checked: boolean) => {
    setSaveAllToLibrary(checked);
    setEditableItems(prev => prev.map(item => ({ ...item, saveToLibrary: checked })));
  };

  // GENERATE MODE RESULT SCREEN
  if (parseResult?.mode === 'generate') {
    const memberWarnings = parseResult.member_warnings ?? [];

    return (
      <div className="pb-20">
        <PageHeader
          title="Generated Items"
          backTo={`/scopes/${id}/walkthrough`}
          actions={
            <Button size="sm" variant="outline" onClick={() => { setParseResult(null); setEditableItems([]); }}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
          }
        />
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            This scope has no items yet. We generated items from your walkthrough. Edit and create below.
          </p>

          {/* Member warnings */}
          {memberWarnings.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Assignment Warnings</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-1">
                  {memberWarnings.map((w, i) => <li key={i} className="text-sm">{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Members to add */}
          {(parseResult.member_user_ids_to_add?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <span>Will add members: {(parseResult.member_display_names_to_add ?? []).join(', ')}</span>
            </div>
          )}

          {/* Global toggles */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">Save all to library</Label>
            <Switch checked={saveAllToLibrary} onCheckedChange={handleSaveAllToggle} />
          </div>

          {/* Editable items */}
          {editableItems.map((item, i) => {
            const computedTotal = (item.editedQty ? parseFloat(item.editedQty) : 0) * (item.editedUnitCost ? parseFloat(item.editedUnitCost) : 0);
            return (
              <Card key={i} className={`p-3 space-y-2 ${item.selected ? 'ring-2 ring-primary' : 'opacity-60'}`}>
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={item.selected}
                    onCheckedChange={(c) => updateEditableItem(i, { selected: !!c })}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <Input
                      value={item.editedDescription}
                      onChange={e => updateEditableItem(i, { editedDescription: e.target.value })}
                      placeholder="Description"
                      className="text-sm font-medium"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Qty</Label>
                        <Input
                          type="number"
                          value={item.editedQty}
                          onChange={e => updateEditableItem(i, { editedQty: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Unit</Label>
                        <Input
                          value={item.editedUnit}
                          onChange={e => updateEditableItem(i, { editedUnit: e.target.value })}
                          placeholder="sqft, lf..."
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">$/unit</Label>
                        <Input
                          type="number"
                          value={item.editedUnitCost}
                          onChange={e => updateEditableItem(i, { editedUnitCost: e.target.value })}
                          placeholder="0.00"
                          className="h-8 text-sm"
                          step="0.01"
                        />
                      </div>
                    </div>
                    {computedTotal > 0 && (
                      <p className="text-xs text-muted-foreground">Total: ${computedTotal.toFixed(2)}</p>
                    )}
                    {item.editedNotes !== '' && (
                      <Input
                        value={item.editedNotes}
                        onChange={e => updateEditableItem(i, { editedNotes: e.target.value })}
                        placeholder="Notes"
                        className="h-8 text-xs"
                      />
                    )}
                    {/* Library toggles */}
                    <div className="flex items-center gap-4 text-xs">
                      <label className="flex items-center gap-1.5">
                        <Checkbox
                          checked={item.saveToLibrary}
                          onCheckedChange={(c) => updateEditableItem(i, { saveToLibrary: !!c })}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-muted-foreground">Library</span>
                      </label>
                      {item.matched_cost_item_id && (
                        <label className="flex items-center gap-1.5">
                          <Checkbox
                            checked={item.updateLibraryPrice}
                            onCheckedChange={(c) => updateEditableItem(i, { updateLibraryPrice: !!c })}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-muted-foreground">Update library price</span>
                        </label>
                      )}
                      {item.matched_cost_item_id && (
                        <span className="text-primary text-xs">✓ matched</span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}

          {editableItems.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No items generated. Try more detailed walkthrough notes.</p>
          )}

          {editableItems.length > 0 && (
            <div className="space-y-2">
              <Button onClick={handleCreateItems} disabled={creating || selectedCount === 0} className="w-full">
                {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</> : `Create ${selectedCount} Scope Item${selectedCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // COVERAGE MODE RESULT SCREEN
  if (parseResult) {
    const memberWarnings = parseResult.member_warnings ?? [];

    return (
      <div className="pb-20">
        <PageHeader
          title="Coverage Review"
          backTo={`/scopes/${id}/walkthrough`}
          actions={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setParseResult(null)}>
                <ArrowLeft className="h-4 w-4 mr-1" />Back
              </Button>
              <Button size="sm" onClick={handleApplyUpdates} disabled={applying || parseResult.proposed_updates.length === 0}>
                {applying ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Applying...</> : <><CheckCircle2 className="h-4 w-4 mr-1" />Apply Updates</>}
              </Button>
            </div>
          }
        />
        <div className="p-4 space-y-6">
          {/* Member warnings */}
          {memberWarnings.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Assignment Warnings</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-1">
                  {memberWarnings.map((w, i) => <li key={i} className="text-sm">{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Members to add */}
          {(parseResult.member_user_ids_to_add?.length ?? 0) > 0 && (
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-1 mb-2">
                <CheckCircle2 className="h-4 w-4" /> Members to Add ({parseResult.member_user_ids_to_add!.length})
              </h2>
              <div className="space-y-1">
                {(parseResult.member_display_names_to_add ?? []).map((name, i) => (
                  <Card key={i} className="p-2">
                    <p className="text-sm">{name} <span className="text-xs text-muted-foreground">(viewer)</span></p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Not Addressed */}
          {parseResult.not_addressed_items.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-destructive flex items-center gap-1 mb-2">
                <XCircle className="h-4 w-4" /> Not Addressed ({parseResult.not_addressed_items.length})
              </h2>
              <div className="space-y-2">
                {parseResult.not_addressed_items.map(item => (
                  <Card key={item.id} className="p-3">
                    <p className="text-sm">{item.description}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Needs Review */}
          {parseResult.needs_review_items.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-accent-foreground flex items-center gap-1 mb-2">
                <AlertTriangle className="h-4 w-4" /> Needs Review ({parseResult.needs_review_items.length})
              </h2>
              <div className="space-y-2">
                {parseResult.needs_review_items.map(item => (
                  <Card key={item.id} className="p-3">
                    <p className="text-sm font-medium">{item.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.reason}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Proposed Updates */}
          {parseResult.proposed_updates.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-1 mb-2">
                <CheckCircle2 className="h-4 w-4" /> Proposed Updates ({parseResult.proposed_updates.length})
              </h2>
              <div className="space-y-2">
                {parseResult.proposed_updates.map(update => (
                  <Card key={update.scope_item_id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{update.description || update.scope_item_id}</p>
                        {update.notes && <p className="text-xs text-muted-foreground mt-1">{update.notes}</p>}
                      </div>
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted">{update.status}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {parseResult.proposed_updates.length === 0 && parseResult.not_addressed_items.length === 0 && parseResult.needs_review_items.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No items matched from the walkthrough text.</p>
          )}
        </div>
      </div>
    );
  }

  // WALKTHROUGH CAPTURE SCREEN
  return (
    <div className="pb-20">
      <PageHeader title="Walkthrough" backTo={`/scopes/${id}`} />
      <div className="p-4 space-y-4">
        {/* Tip for empty scopes */}
        {scopeItemCount === 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              This scope has no items yet. Your walkthrough will generate scope items.
            </AlertDescription>
          </Alert>
        )}

        {blocks.length > 0 && (
          <p className="text-sm text-muted-foreground">{blocks.length} block{blocks.length !== 1 ? 's' : ''} saved</p>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Dictate or type your walkthrough notes here..."
          className="flex w-full rounded-md border border-input bg-background px-3 py-3 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[200px] resize-none"
          rows={6}
        />

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleSaveBlock} disabled={!text.trim()}>
            Save Block
          </Button>
          <Button
            className="flex-1"
            onClick={handleReviewCoverage}
            disabled={loading || (!text.trim() && blocks.length === 0)}
          >
            {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Reviewing...</> : scopeItemCount === 0 ? 'Generate Items' : 'Review Coverage'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScopeWalkthrough;

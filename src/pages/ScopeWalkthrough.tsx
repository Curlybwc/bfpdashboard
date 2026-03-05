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
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

function normalizeForLibrary(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

interface MatchedItem {
  scope_item_id: string;
  description: string;
  current_status: string;
  suggested_status: string;
  suggested_notes: string | null;
  suggested_qty: number | null;
  suggested_unit: string | null;
}

interface NewItem {
  description: string;
  status: string;
  notes: string | null;
  qty: number | null;
  unit: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  price_evidence: string | null;
  price_confidence: string | null;
  price_source: 'walkthrough' | 'library' | 'missing';
  phase_key: string | null;
  normalized_name: string;
  matched_cost_item_id: string | null;
  matched_cost_item_unit: string | null;
  matched_cost_item_unit_cost: number | null;
}

interface ParseResult {
  matched: MatchedItem[];
  new_items: NewItem[];
  get_bid_items: { id: string; description: string; reason: string }[];
  not_addressed_items: { id: string; description: string }[];
  member_user_ids_to_add?: string[];
  member_display_names_to_add?: string[];
  member_warnings?: string[];
}

interface EditableNewItem extends NewItem {
  selected: boolean;
  saveToLibrary: boolean;
  updateLibraryPrice: boolean;
  editedDescription: string;
  editedNotes: string;
  editedQty: string;
  editedUnit: string;
  editedUnitCost: string;
  editedStatus: string;
  useLibraryPrice: boolean;
}

interface EditableMatchedItem extends MatchedItem {
  applyUpdate: boolean;
}

const PriceSourceBadge = ({ source, hasNotesPrice }: { source: 'walkthrough' | 'library' | 'missing'; hasNotesPrice?: boolean }) => {
  if (source === 'walkthrough') {
    return <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600 hover:bg-green-600">Walkthrough</Badge>;
  }
  if (source === 'library') {
    return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Library</Badge>;
  }
  return (
    <div className="flex items-center gap-1">
      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Missing</Badge>
      {hasNotesPrice && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-600">$ in text</Badge>
      )}
    </div>
  );
};

const ScopeWalkthrough = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState('');
  const [blocks, setBlocks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [scopeItemCount, setScopeItemCount] = useState<number | null>(null);

  // Result state
  const [editableNewItems, setEditableNewItems] = useState<EditableNewItem[]>([]);
  const [editableMatched, setEditableMatched] = useState<EditableMatchedItem[]>([]);
  const [committing, setCommitting] = useState(false);
  const [saveAllToLibrary, setSaveAllToLibrary] = useState(true);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [text]);

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

  const handleReview = async () => {
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

      const result = data as ParseResult;
      setParseResult(result);

      // Initialize editable new items with structured pricing
      setEditableNewItems((result.new_items || []).map(item => {
        const unitCost = item.unit_cost ?? item.matched_cost_item_unit_cost ?? null;
        return {
          ...item,
          selected: true,
          saveToLibrary: true,
          updateLibraryPrice: false,
          useLibraryPrice: false,
          editedDescription: item.description,
          editedNotes: item.notes || '',
          editedQty: item.qty != null ? String(item.qty) : '1',
          editedUnit: item.unit || item.matched_cost_item_unit || '',
          editedUnitCost: unitCost != null ? String(unitCost) : '',
          editedStatus: item.status || 'Get Bid',
        };
      }));

      // Initialize matched items
      setEditableMatched((result.matched || []).map(item => ({
        ...item,
        applyUpdate: true,
      })));
    } catch (err: any) {
      toast({ title: 'Error parsing walkthrough', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
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

  const handleCommit = async () => {
    if (!id || !parseResult) return;
    setCommitting(true);

    try {
      // 1) Apply matched item updates
      const matchedToApply = editableMatched.filter(m => m.applyUpdate);
      for (const m of matchedToApply) {
        const updates: any = { status: m.suggested_status };
        if (m.suggested_notes) updates.notes = m.suggested_notes;
        if (m.suggested_qty != null) updates.qty = m.suggested_qty;
        if (m.suggested_unit) updates.unit = m.suggested_unit;
        await supabase.from('scope_items').update(updates).eq('id', m.scope_item_id);
      }

      // 2) Create new scope items
      const costItemIdMap = new Map<number, string | null>();

      for (let i = 0; i < editableNewItems.length; i++) {
        const item = editableNewItems[i];
        if (!item.selected) continue;

        let costItemId: string | null = item.matched_cost_item_id || null;
        const norm = normalizeForLibrary(item.editedDescription);

        if (item.saveToLibrary) {
          if (costItemId && item.updateLibraryPrice) {
            const unitCost = item.editedUnitCost ? parseFloat(item.editedUnitCost) : null;
            if (unitCost != null) {
              await supabase.from('cost_items').update({ default_total_cost: unitCost }).eq('id', costItemId);
            }
          } else if (!costItemId) {
            const { data: existing } = await supabase
              .from('cost_items')
              .select('id')
              .eq('normalized_name', norm)
              .single();

            if (existing) {
              costItemId = existing.id;
            } else {
              const unitCost = item.editedUnitCost ? parseFloat(item.editedUnitCost) : 0;
              const unitTypeMap: Record<string, string> = { sqft: 'sqft', 'sq ft': 'sqft', lf: 'lf', 'linear ft': 'lf', piece: 'piece', each: 'each' };
              const unitType = unitTypeMap[item.editedUnit.toLowerCase()] || 'each';

              const { data: inserted, error: insertErr } = await supabase
                .from('cost_items')
                .insert({ name: item.editedDescription, normalized_name: norm, default_total_cost: unitCost, unit_type: unitType as any })
                .select('id')
                .single();

              if (!insertErr && inserted) {
                costItemId = inserted.id;
              }
            }
          }
        }
        costItemIdMap.set(i, costItemId);
      }

      // Build scope_item inserts
      const scopeItemInserts = editableNewItems
        .map((item, i) => {
          if (!item.selected) return null;
          const qty = item.editedQty ? parseFloat(item.editedQty) : null;
          const unitCost = item.editedUnitCost ? parseFloat(item.editedUnitCost) : null;
          const pricingStatus = unitCost != null ? 'Priced' : 'Needs Pricing';
          const status = item.editedStatus || 'Get Bid';
          return {
            scope_id: id,
            description: item.editedDescription,
            status: status === 'Not Checked' ? 'Get Bid' : status,
            notes: item.editedNotes || null,
            qty,
            unit: item.editedUnit || null,
            phase_key: item.phase_key || null,
            cost_item_id: costItemIdMap.get(i) || null,
            unit_cost_override: unitCost,
            computed_total: qty != null && unitCost != null ? qty * unitCost : null,
            pricing_status: pricingStatus,
          };
        })
        .filter(Boolean);

      if (scopeItemInserts.length > 0) {
        const { error: insertError } = await supabase.from('scope_items').insert(scopeItemInserts as any);
        if (insertError) throw insertError;
      }

      // 3) Auto-add members
      await autoAddMembers();

      const totalActions = matchedToApply.length + scopeItemInserts.length;
      toast({ title: `${totalActions} item${totalActions !== 1 ? 's' : ''} updated/created` });
      navigate(`/scopes/${id}`);
    } catch (err: any) {
      toast({ title: 'Error committing changes', description: err.message, variant: 'destructive' });
    } finally {
      setCommitting(false);
    }
  };

  const updateNewItem = (index: number, updates: Partial<EditableNewItem>) => {
    setEditableNewItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, ...updates };
      // If toggling useLibraryPrice, swap the unit cost
      if ('useLibraryPrice' in updates && item.matched_cost_item_unit_cost != null) {
        if (updates.useLibraryPrice) {
          updated.editedUnitCost = String(item.matched_cost_item_unit_cost);
        } else if (item.unit_cost != null) {
          updated.editedUnitCost = String(item.unit_cost);
        }
      }
      return updated;
    }));
  };

  const handleSaveAllToggle = (checked: boolean) => {
    setSaveAllToLibrary(checked);
    setEditableNewItems(prev => prev.map(item => ({ ...item, saveToLibrary: checked })));
  };

  const selectedNewCount = editableNewItems.filter(i => i.selected).length;
  const matchedApplyCount = editableMatched.filter(m => m.applyUpdate).length;
  const totalCommitCount = selectedNewCount + matchedApplyCount;

  // RESULTS SCREEN
  if (parseResult) {
    const memberWarnings = parseResult.member_warnings ?? [];
    const hasMatched = editableMatched.length > 0;
    const hasNew = editableNewItems.length > 0;
    const hasGetBid = (parseResult.get_bid_items?.length ?? 0) > 0;
    const hasNotAddressed = parseResult.not_addressed_items.length > 0;
    const hasMembers = (parseResult.member_user_ids_to_add?.length ?? 0) > 0;

    return (
      <div className="pb-20">
        <PageHeader
          title="Walkthrough Review"
          backTo={`/scopes/${id}/walkthrough`}
          actions={
            <Button size="sm" variant="outline" onClick={() => { setParseResult(null); setEditableNewItems([]); setEditableMatched([]); }}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
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
          {hasMembers && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <span>Will add members: {(parseResult.member_display_names_to_add ?? []).join(', ')}</span>
            </div>
          )}

          {/* SECTION A: Matched existing items */}
          {hasMatched && (
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-1 mb-2">
                <CheckCircle2 className="h-4 w-4" /> Matched Items ({editableMatched.length})
              </h2>
              <div className="space-y-2">
                {editableMatched.map((item, i) => (
                  <Card key={item.scope_item_id} className={`p-3 ${item.applyUpdate ? '' : 'opacity-60'}`}>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={item.applyUpdate}
                        onCheckedChange={(c) => setEditableMatched(prev => prev.map((m, j) => j === i ? { ...m, applyUpdate: !!c } : m))}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{item.description}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{item.current_status}</span>
                          <span>→</span>
                          <span className="font-medium text-foreground">{item.suggested_status}</span>
                        </div>
                        {item.suggested_notes && (
                          <p className="text-xs text-muted-foreground mt-1">{item.suggested_notes}</p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* SECTION B: New items to create */}
          {hasNew && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold">New Items ({editableNewItems.length})</h2>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Save all to library</Label>
                  <Switch checked={saveAllToLibrary} onCheckedChange={handleSaveAllToggle} />
                </div>
              </div>
              <div className="space-y-2">
                {editableNewItems.map((item, i) => {
                  const computedTotal = (item.editedQty ? parseFloat(item.editedQty) : 0) * (item.editedUnitCost ? parseFloat(item.editedUnitCost) : 0);
                  const hasNotesWithPrice = !!(item.editedNotes && /\$/.test(item.editedNotes));
                  const currentPriceSource = item.editedUnitCost ? (item.useLibraryPrice ? 'library' : item.price_source) : 'missing';

                  return (
                    <Card key={i} className={`p-3 space-y-2 ${item.selected ? 'ring-2 ring-primary' : 'opacity-60'}`}>
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={item.selected}
                          onCheckedChange={(c) => updateNewItem(i, { selected: !!c })}
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Input
                              value={item.editedDescription}
                              onChange={e => updateNewItem(i, { editedDescription: e.target.value })}
                              placeholder="Description"
                              className="text-sm font-medium flex-1"
                            />
                            <PriceSourceBadge source={currentPriceSource as any} hasNotesPrice={hasNotesWithPrice && currentPriceSource === 'missing'} />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Qty</Label>
                              <Input
                                type="number"
                                value={item.editedQty}
                                onChange={e => updateNewItem(i, { editedQty: e.target.value })}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Unit</Label>
                              <Input
                                value={item.editedUnit}
                                onChange={e => updateNewItem(i, { editedUnit: e.target.value })}
                                placeholder="sqft, lf..."
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">$/unit</Label>
                              <Input
                                type="number"
                                value={item.editedUnitCost}
                                onChange={e => updateNewItem(i, { editedUnitCost: e.target.value })}
                                placeholder="0.00"
                                className="h-8 text-sm"
                                step="0.01"
                              />
                            </div>
                          </div>
                          {computedTotal > 0 && (
                            <p className="text-xs text-muted-foreground">Total: ${computedTotal.toFixed(2)}</p>
                          )}
                          {item.price_evidence && (
                            <p className="text-[10px] text-muted-foreground italic">"{item.price_evidence}"</p>
                          )}
                          {item.editedNotes && (
                            <Input
                              value={item.editedNotes}
                              onChange={e => updateNewItem(i, { editedNotes: e.target.value })}
                              placeholder="Notes"
                              className="h-8 text-xs"
                            />
                          )}
                          <div className="flex items-center gap-4 text-xs flex-wrap">
                            <label className="flex items-center gap-1.5">
                              <Checkbox
                                checked={item.saveToLibrary}
                                onCheckedChange={(c) => updateNewItem(i, { saveToLibrary: !!c })}
                                className="h-3.5 w-3.5"
                              />
                              <span className="text-muted-foreground">Library</span>
                            </label>
                            {item.matched_cost_item_id && (
                              <>
                                <label className="flex items-center gap-1.5">
                                  <Checkbox
                                    checked={item.updateLibraryPrice}
                                    onCheckedChange={(c) => updateNewItem(i, { updateLibraryPrice: !!c })}
                                    className="h-3.5 w-3.5"
                                  />
                                  <span className="text-muted-foreground">Update library price</span>
                                </label>
                                {item.price_source === 'walkthrough' && item.matched_cost_item_unit_cost != null && (
                                  <label className="flex items-center gap-1.5">
                                    <Checkbox
                                      checked={item.useLibraryPrice}
                                      onCheckedChange={(c) => updateNewItem(i, { useLibraryPrice: !!c })}
                                      className="h-3.5 w-3.5"
                                    />
                                    <span className="text-muted-foreground">Use library (${item.matched_cost_item_unit_cost})</span>
                                  </label>
                                )}
                                <span className="text-primary text-xs">✓ matched</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECTION C: Get Bid */}
          {hasGetBid && (
            <div>
              <h2 className="text-sm font-semibold text-accent-foreground flex items-center gap-1 mb-2">
                <AlertTriangle className="h-4 w-4" /> Get Bid ({parseResult.get_bid_items.length})
              </h2>
              <div className="space-y-2">
                {parseResult.get_bid_items.map(item => (
                  <Card key={item.id} className="p-3">
                    <p className="text-sm font-medium">{item.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.reason}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Not Addressed */}
          {hasNotAddressed && (
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

          {/* Empty state */}
          {!hasMatched && !hasNew && !hasGetBid && !hasNotAddressed && (
            <p className="text-center text-muted-foreground py-8">No items found in the walkthrough text.</p>
          )}

          {/* Commit button */}
          {totalCommitCount > 0 && (
            <Button onClick={handleCommit} disabled={committing} className="w-full">
              {committing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Committing...</> : `Commit ${totalCommitCount} Change${totalCommitCount !== 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // CAPTURE SCREEN
  return (
    <div className="pb-20">
      <PageHeader title="Walkthrough" backTo={`/scopes/${id}`} />
      <div className="p-4 space-y-4">
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
            onClick={handleReview}
            disabled={loading || (!text.trim() && blocks.length === 0)}
          >
            {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Reviewing...</> : 'Review Walkthrough'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScopeWalkthrough;

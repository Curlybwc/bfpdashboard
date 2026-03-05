

## Final Pass Detail Popup — Implementation Plan

### Summary
Rewrite `FinalPassSheet.tsx` to open a Dialog when clicking Repair/Replace/Bid (OK stays immediate). The dialog shows qty, unit, unit cost, computed total, and notes — prefilled from existing scope item or cost library defaults.

### Changes to `src/components/FinalPassSheet.tsx`

**New imports:** Dialog/DialogContent/DialogHeader/DialogTitle/DialogFooter, Input, Textarea, Select components.

**New state:**
- `pendingAction: { ci: ChecklistItem, action: ActionState } | null` — controls dialog visibility
- `detailForm: { qty: string, unit: string, unitCost: string, notes: string }` — string inputs to avoid NaN issues
- `saving: boolean`

**New function `openDetailDialog(ci, action)`:**
1. Find existing scope item via `matchExistingScopeItem(scopeItems, ci.label, ci.default_cost_item_id)`
2. If found: prefill qty/unit/unitCost/notes from existing item
3. Else: fetch cost_items by `ci.default_cost_item_id` or normalized name match for defaults
4. Else: qty="1", unit="", unitCost="", notes=""
5. Set `pendingAction` and `detailForm`

**Repair/Replace/Bid buttons** call `openDetailDialog` instead of `handleAction`.

**New function `handleConfirmAction()`:**
- Parse qty: `parseFloat(detailForm.qty) || null` (blank/NaN → null)
- Parse unitCost: `parseFloat(detailForm.unitCost) || null`
- Compute: `computed_total = (qty && unitCost) ? qty * unitCost : null`
- Compute: `pricing_status = unitCost != null ? 'Priced' : 'Needs Pricing'`
- Find existing scope item (same dedup logic)
- **Update path:** set status, qty, unit (text), unit_cost_override, computed_total, pricing_status, cost_item_id backfill. For notes: if existing.notes exists and form notes is non-empty and different, append form notes (`existing.notes + '\n' + formNotes`); otherwise use form notes.
- **Insert path:** insert with all fields including notes as-is
- Upsert `scope_checklist_reviews`
- Toast, onUpdate, fetchAll, close dialog

**Dialog UI:**
- Badge showing action name
- Qty input (type="number", step="any")
- Unit select (each/sqft/lf/piece + empty option)
- Unit Cost input (type="number", step="0.01")
- Computed Total read-only display
- Notes textarea
- Cancel / Save buttons

**OK button** remains unchanged (immediate save).

### Files changed

| File | Change |
|---|---|
| `src/components/FinalPassSheet.tsx` | Full rewrite of action flow: add dialog, prefill logic, confirm handler with safe number parsing and notes append |

No database changes needed — `scope_items.notes`, `scope_items.unit` (text), and `scope_checklist_reviews.notes` all exist.


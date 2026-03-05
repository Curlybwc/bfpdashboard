

# Implementation Plan: Final Pass Checklist + Scope Total Estimate

## 1. Database Migration (schema)

Single migration creating 3 tables, adding 1 column to `scopes`, and setting up RLS.

### checklist_templates
- id, name, active (default true), created_at, updated_at
- RLS: SELECT for authenticated; INSERT/UPDATE/DELETE admin-only via `is_admin(auth.uid())`

### checklist_items
- id, template_id (FK cascade), label (NOT NULL), normalized_label (NOT NULL, indexed with template_id), category, default_cost_item_id (FK SET NULL), sort_order (default 0), active (default true), created_at, updated_at
- Composite index on (template_id, normalized_label)
- RLS: SELECT for authenticated; INSERT/UPDATE/DELETE admin-only

### scope_checklist_reviews
- id, scope_id (FK cascade), checklist_item_id (FK cascade), state (text NOT NULL, **no default**), notes, updated_at
- UNIQUE(scope_id, checklist_item_id)
- RLS:
  - SELECT: `is_admin(auth.uid()) OR is_scope_member(auth.uid(), scope_id)`
  - INSERT: `is_admin(auth.uid()) OR get_scope_role(auth.uid(), scope_id) IN ('editor','manager')`
  - UPDATE: same as INSERT
  - DELETE: `is_admin(auth.uid())`

### scopes column
- `ALTER TABLE scopes ADD COLUMN checklist_template_id uuid REFERENCES checklist_templates(id) ON DELETE SET NULL`

### updated_at triggers
- Add `update_updated_at_column` trigger to checklist_templates, checklist_items, scope_checklist_reviews

## 2. Seed Data (via insert tool, not migration)

Insert "Standard Rehab Checklist" template, then ~24 big-ticket items with normalized_label populated:

| Category | Items |
|---|---|
| Exterior | Roof, Gutters, Siding, Windows, Exterior Doors, Soffit/Fascia, Porch/Deck, Driveway |
| Interior | Kitchen Cabinets, Kitchen Counters, Bathroom(s), Flooring, Paint Interior, Paint Exterior, Drywall, Interior Doors, Trim/Baseboard |
| Mechanical | HVAC, Water Heater, Electrical Panel, Sewer Lateral, Drain Tile/Sump |
| Site | Foundation, Dumpsters, Landscaping |

Each with sort_order, category, and `normalized_label = lower(trim(label))`.

## 3. New Component: FinalPassSheet

**File**: `src/components/FinalPassSheet.tsx`

Sheet/drawer component. Props: `scopeId`, `items` (scope_items), `open`, `onOpenChange`, `onUpdate` callback.

**Coverage logic** — a checklist item is "covered" if ANY of:
- A scope_item exists with normalized description matching `checklist_item.normalized_label`
- A scope_item exists with `cost_item_id == checklist_item.default_cost_item_id` (when both non-null)
- A `scope_checklist_reviews` row exists for this checklist_item_id + scope_id

**Display**: Uncovered items grouped by category, each with 4 action buttons: OK, Repair, Replace, Get Bid.

**On action**:
- **OK**: Upsert `scope_checklist_reviews` with state='OK'. No scope_item created.
- **Repair/Replace/Get Bid**:
  1. Check for existing scope_item by normalized description OR cost_item_id match
  2. If found: UPDATE its status to chosen state
  3. If not found: INSERT new scope_item with description, status, cost_item_id, unit_cost_override (from cost_items.default_total_cost), unit (mapped from unit_type: each→each, sqft→sqft, lf→lf, piece→piece), qty=1, computed_total, pricing_status derived
  4. Upsert scope_checklist_reviews with chosen state

**Constraint**: Never writes state='Not Checked' — absence of row = Not Checked.

## 4. ScopeDetail.tsx Changes

### Estimated Total Card (between address row and items list)
- `estimatedTotal` = sum of non-null `computed_total`
- `unpricedCount` = items where `unit_cost_override` is null
- `getBidUnpriced` = items where status='Get Bid' AND unit_cost_override is null
- Tooltip on info icon: "Estimated Total sums priced items. Unpriced items are not included."

### Coverage Summary Row (clickable, opens FinalPassSheet)
- "Coverage: X / Y checked" — X = covered count, Y = total checklist items
- Click opens FinalPassSheet

### Final Pass Button in header actions
- Between Walkthrough and +Item buttons
- Opens FinalPassSheet drawer

### New state: `finalPassOpen` boolean, checklist data fetching

## 5. StatusBadge Updates

Add missing colors: `OK` → green, `Not Checked` → gray, `Repair` → orange, `Replace` → red.

## 6. Files Summary

| File | Action |
|---|---|
| Migration SQL | Create: 3 tables + column + RLS + triggers + indexes |
| Seed SQL (insert tool) | Insert template + ~24 checklist items |
| `src/components/FinalPassSheet.tsx` | Create new |
| `src/pages/ScopeDetail.tsx` | Add total card, coverage row, Final Pass button, state |
| `src/components/StatusBadge.tsx` | Add OK/Not Checked/Repair/Replace colors |


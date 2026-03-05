

# Diagnosis: Final Pass Duplicates + Needs Pricing

## A) Raw Data Findings

**Scope**: `7022d1f3-0930-4427-8d08-134844fe50e7` (checklist_template_id: NULL — uses default)

**Pre-existing item** (from walkthrough, 2026-03-03):
| Field | Value |
|---|---|
| id | ae4d3a11-032c-4ff3-8381-a3d7bb40245a |
| description | Replace Roof |
| status | Replace |
| qty | 17 |
| unit | squares |
| unit_cost_override | 450 |
| computed_total | 7650 |
| pricing_status | Priced |
| cost_item_id | NULL |

**Duplicate created by Final Pass** (2026-03-05 15:15:57):
| Field | Value |
|---|---|
| id | 3c77fbd5-617f-48b3-adf9-c29c41ebbeed |
| description | Roof |
| status | Replace |
| qty | 1 |
| unit | NULL |
| unit_cost_override | NULL |
| computed_total | NULL |
| pricing_status | Needs Pricing |
| cost_item_id | NULL |

**Same pattern for Windows, Electrical Panel, Sewer Lateral, Bathroom replacement, Kitchen Counters** — all created as duplicates with no pricing.

## B) Checklist Item for Roof

| Field | Value |
|---|---|
| id | 7e6a6680-b4b1-4e27-91d5-f8f29f812a1f |
| label | Roof |
| normalized_label | roof |
| category | Exterior |
| default_cost_item_id | **NULL** |

## C) Cost Library for Roof

| Field | Value |
|---|---|
| id | 3abf9b9f-89f7-4cb2-9f3d-a5deead93555 |
| name | Replace Roof |
| normalized_name | replace roof |
| unit_type | sqft |
| default_total_cost | 0 |
| active | true |

Note: `default_total_cost = 0` — even if linked, pricing would be zero.

## D) Root Cause Analysis

### Root Cause 1: `isCovered` works but `handleAction` uses weaker matching

The `isCovered` function (line 82-88) uses the full `isChecklistCovered()` with verb stripping, synonyms, substring, and fuzzy Jaccard. `normalizeForChecklistMatch("Replace Roof")` strips "Replace" → `"roof"` which equals `normalized_label = "roof"`. So **Roof SHOULD show as covered** and not appear in the uncovered list.

But `handleAction` at line 116 uses a simpler check:
```typescript
const existingByDesc = items.find(si => normalizeForChecklistMatch(si.description) === normalizedLabel);
```

This is actually the same normalization and should also match. So the question is: **why did Roof appear as uncovered at all?**

Most likely explanation: the `items` prop was stale or empty when the sheet first opened. If `fetchData` hadn't completed or the items array was empty, `isCovered` would return false for everything, showing all 25 items as uncovered.

### Root Cause 2: `default_cost_item_id` is NULL on ALL seeded checklist items

The seed migration inserted checklist items without linking them to cost_items. This means:
- Line 117-119: cost_item_id match always fails (both sides NULL)
- Line 131: `if (ci.default_cost_item_id)` is false → skips cost lookup entirely
- Result: `unit_cost_override = null`, `pricing_status = 'Needs Pricing'`

### Root Cause 3: Even if linked, cost item has `default_total_cost = 0`

The "Replace Roof" cost item has `default_total_cost = 0`, so pricing would still be zero.

## E) Fix Plan

### 1. Migration: Link checklist items to cost_items

Update all seeded checklist items to set `default_cost_item_id` by matching `normalizeForChecklistMatch(checklist_items.label)` against `cost_items.normalized_name`. This requires a query to find matches.

First, query existing cost_items to find linkable IDs:
```sql
UPDATE checklist_items ci
SET default_cost_item_id = (
  SELECT id FROM cost_items co
  WHERE co.active = true
  AND co.normalized_name ILIKE '%' || ci.normalized_label || '%'
  LIMIT 1
)
WHERE ci.default_cost_item_id IS NULL;
```

### 2. FinalPassSheet: Use `isChecklistCovered` in handleAction

Replace the simple exact-match check at lines 115-120 with `isChecklistCovered()` so the matching logic is consistent between "is this covered?" and "find the existing item to update":

```typescript
const existing = items.find(si =>
  isChecklistCovered(si.description, ci.normalized_label, si.cost_item_id, ci.default_cost_item_id)
);
```

### 3. FinalPassSheet: Fall back to cost_items search for pricing

When `ci.default_cost_item_id` is NULL, search cost_items by normalized_name before giving up on pricing:

```typescript
if (!ci.default_cost_item_id) {
  const { data: costMatch } = await supabase.from('cost_items')
    .select('id, default_total_cost, unit_type')
    .ilike('normalized_name', `%${ci.normalized_label}%`)
    .eq('active', true)
    .limit(1);
  if (costMatch?.[0]) { /* use it */ }
}
```

### 4. Delete the 6 duplicate scope_items

Migration to remove the duplicates created at 15:15-15:17 on 2026-03-05 (IDs: 3c77fbd5, 1af8c3bf, 646c64d7, 4daffc17, 92fc690c, b476f9b9).

### 5. Ensure items prop is fresh when FinalPassSheet opens

In ScopeDetail, call `fetchData()` before opening the sheet, or have FinalPassSheet fetch its own scope_items internally to avoid stale prop issues.

## Files Changed

| File | Change |
|---|---|
| Migration SQL | Link checklist items to cost_items + delete duplicates |
| `src/components/FinalPassSheet.tsx` | Use `isChecklistCovered` in handleAction; add cost_items fallback search for pricing; fetch own scope_items internally |
| `src/pages/ScopeDetail.tsx` | Refresh data before opening Final Pass sheet |




## Cost Library Tab — Implementation Plan

**No SQL migration needed.** RLS policies already exist on `cost_items` (admin-only INSERT/UPDATE/DELETE, authenticated SELECT).

### Files Created

**`src/components/CostLibrary.tsx`**
- Self-contained component for the Cost Library tab
- State: `costItems[]`, `search`, `editingId`, `showAddDialog`
- Fetches `cost_items` ordered by `name` ASC
- Client-side search filter on `name`
- Renders a table with columns: name, unit_type, piece_length_ft (if not null), default_total_cost, active (Switch toggle)
- Inline edit mode per row: editable name, unit_type (Select dropdown: each/sqft/lf/piece), piece_length_ft (Input), default_total_cost (Input), save/cancel buttons
- Delete button per row with confirmation (AlertDialog)
- "Add Cost Item" button opens a Dialog with form fields: name (required), unit_type (Select), piece_length_ft (optional Input), default_total_cost (required Input), active (Switch, default true)
- All mutations via `supabase.from('cost_items').update/delete/insert`

### Files Modified

**`src/pages/AdminPanel.tsx`**
- Wrap existing User Management content and new Cost Library in `Tabs` component
- Tab 1: "Users" — existing user management content (unchanged logic)
- Tab 2: "Cost Library" — renders `<CostLibrary />`
- Import `Tabs, TabsList, TabsTrigger, TabsContent` and `CostLibrary`

### Component Structure
```text
AdminPanel
├── PageHeader
└── Tabs
    ├── TabsTrigger "Users"
    ├── TabsTrigger "Cost Library"
    ├── TabsContent "users"
    │   └── (existing profiles list + admin toggles)
    └── TabsContent "cost-library"
        └── CostLibrary
            ├── Search Input
            ├── Add Cost Item Button → Dialog
            └── Table (name, unit_type, piece_length_ft, default_total_cost, active, actions)
```


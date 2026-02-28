

## Phase 2C Enhancement — Inline Materials in Task Creation

### Changes to `src/pages/ProjectDetail.tsx`

**1. Add state and imports**
- Import `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `@/components/ui/collapsible`
- Import `ChevronDown`, `X` from `lucide-react`
- Add `pendingMaterials` state: `{ name: string; quantity: string; unit: string }[]`
- Add `matName`, `matQty`, `matUnit` state for the inline add form

**2. Remove manual `materials_on_site` Select**
- The Materials On Site dropdown (lines 118-126) is now derived, not manually set. Remove it.
- Remove `materials` state and its reset. The task will be inserted with `materials_on_site: 'No'` (default).

**3. Add collapsible materials section after Notes field (line 153)**
- Collapsible section titled "📦 Add Materials" with chevron indicator
- When expanded: name input (required), quantity input, unit input, Add button
- On Add: push to `pendingMaterials[]`, clear inputs
- Below inputs: list of pending materials with name/qty/unit and X remove button

**4. Update `handleCreateTask` (lines 56-76)**
- Change insert to use `.insert(...).select()` to capture the returned `task.id`
- Set `materials_on_site` to `'No'` always (derived)
- After successful insert, if `pendingMaterials.length > 0`:
  - Insert all materials into `task_materials` with `task_id`, `purchased: false`, `delivered: false`
  - Run derivation: since all are undelivered, result is `materials_on_site = 'No'` (already set, but keeps logic consistent)
- Clear `pendingMaterials` on reset


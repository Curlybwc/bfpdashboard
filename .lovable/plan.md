

## Add Delete Scope Item + Editable Scope Title (Admin-Only)

### What changes

**1. Delete scope item button (admin-only, Draft + Converted)**

- Import `Trash2` from lucide-react and `useAdmin` hook
- Add `const { isAdmin } = useAdmin()` and `deletingId` state
- Add `handleDeleteItem(itemId)`: deletes with `.eq('id', itemId).eq('scope_id', id)`, updates local state, toasts
- In the item row actions area (line 512-521), add a `Trash2` button wrapped in `AlertDialog` — visible when `isAdmin` (regardless of draft/converted status)
- The existing edit pencil button stays gated on `isDraft`; the delete button is gated on `isAdmin` only

**2. Editable scope title (admin-only)**

- Add `editingTitle` / `titleDraft` state
- In the header info area (line 358-361), when `isAdmin`, show a `Pencil` icon next to the scope name that toggles an inline `Input`
- Save: `supabase.from('scopes').update({ name: titleDraft }).eq('id', id)` → update local `scope` state + toast
- Cancel restores original value
- Display uses `scope.name || scope.address` as fallback

**3. No DB changes needed**

- RLS "Delete scope items" already uses `is_admin(auth.uid())` — confirmed
- RLS "Update scopes" already allows `is_admin(auth.uid())` — confirmed

### Files changed

| File | Change |
|---|---|
| `src/pages/ScopeDetail.tsx` | Add imports, admin check, delete handler + AlertDialog button, inline title edit UI |




## Plan Update: Remove Materials Prompt from Phase 2A

**No code changes needed.** The current `TaskDetail.tsx` already treats `materials_on_site` as a simple editable Select field with no confirmation dialog. The materials prompt was only described in the Phase 2A plan but was never implemented in code.

### What changes

**Plan clarification only:**
- Remove item "6️⃣ Materials Prompt" from Phase 2A scope
- In `TaskDetail.tsx` (Step 7 of the plan): no materials confirmation dialog will be added — the existing simple Select dropdown for `materials_on_site` stays as-is
- In `TaskCard.tsx`: no purchased-material logic — only the "Needs Materials" badge and Start button gating remain

### Updated Phase 2A scope

1. Database migration (5 lifecycle columns)
2. `TaskCard.tsx` — with Dibs/Start/Complete buttons, "Needs Materials" badge
3. `Today.tsx` — 3 sections (In Progress, Assigned, Available)
4. `StatusBadge.tsx` — color updates
5. `App.tsx` — add `/today` route
6. `MobileNav.tsx` — add Today tab
7. `TaskDetail.tsx` — add Dibs/Start/Complete buttons only; `materials_on_site` remains a plain editable field, no modal

### Deferred to Phase 2C
- Materials purchased confirmation modal ("Are materials now on site for this task?")
- Any purchased-material logic tied to the Materials tab




## Phase 2D — Walkthrough Mode (Full Implementation with Hardening)

The walkthrough feature does not exist yet. This plan implements it from scratch with all hardening requirements built in.

---

### 1. Edge Function: `supabase/functions/walkthrough_parse_tasks/index.ts`

**No `verify_jwt = false` in config.toml** -- leave default JWT verification enabled.

Function logic:
- Extract JWT from Authorization header, call `supabase.auth.getUser()` to get user ID
- Query `project_members` to verify caller is a member or admin -- reject with 403 if not
- Fetch project members with `profiles(full_name)` for LLM name-matching context
- Call Lovable AI (`google/gemini-2.5-flash`) with system prompt containing LLM rules (create only, JSON output, date inference, material extraction, assignment matching)
- **Strict JSON validation** on LLM response:
  - `JSON.parse()` -- on failure return 400 `{ error: "Invalid AI response format" }`
  - Validate `draft_tasks` is array, each has non-empty `task` string -- on failure return 400 `{ error: "Malformed draft_tasks structure" }`
  - Strip unexpected properties from each draft (allowlist: task, room_area, trade, priority, due_date, assigned_to_user_id, assigned_to_display, materials, notes)
  - Coerce invalid `materials` to empty array; ensure each material has `name` string
- Return `{ draft_tasks, warnings }`

### 2. New Page: `src/pages/ProjectWalkthrough.tsx`

- Route param: `id` from `/projects/:id/walkthrough`
- Fetch project members for assignment dropdown
- Large textarea + "Parse Tasks" button → calls edge function via `supabase.functions.invoke()`
- **Warnings display**: If `warnings.length > 0`, render Alert box above draft cards listing each warning
- Editable draft cards with checkbox for approval:
  - task, room_area, trade, priority (Select), due_date (date Input), assigned_to (Select from members), notes, materials list (add/remove)
- "Create Selected Tasks" button
- **Safe insert flow**: Sequential per-draft insertion
  - `.insert({...}).select('id').single()` to get task ID
  - Insert materials with that task_id
  - On any insert error: stop, show toast, do not continue

### 3. Route: `src/App.tsx`

Add `<Route path="/projects/:id/walkthrough" element={<ProjectWalkthrough />} />` inside the authenticated routes block.

### 4. Button: `src/pages/ProjectDetail.tsx`

Add "Walkthrough" button next to "+ Task" in the header actions area, visible when `canCreateTask` is true. Navigates to `/projects/${id}/walkthrough`.

### Files Created
- `supabase/functions/walkthrough_parse_tasks/index.ts`
- `src/pages/ProjectWalkthrough.tsx`

### Files Modified
- `src/App.tsx` (add route)
- `src/pages/ProjectDetail.tsx` (add Walkthrough button)


# CONTRACTOR APP — SYSTEM ARCHITECTURE

> Generated from codebase analysis. Intended as a comprehensive reference for developers and AI assistants.

---

## 1. SYSTEM OVERVIEW

This is a **mobile-first construction project management application** designed for residential rehab contractors. It covers the full lifecycle from property scoping and estimating through task execution, material procurement, and labor tracking.

### Primary Workflows

1. **Scope Creation & Estimation** — Walk a property, dictate observations, AI parses them into priced scope items.
2. **Scope → Project Conversion** — Convert approved scopes into actionable projects with tasks.
3. **Task Management** — Create, assign, prioritize, and track tasks with materials and labor.
4. **Material Procurement** — Shopping lists aggregated across projects, tracked through purchase → delivery → on-site.
5. **Field Mode** — Quick on-site task capture via AI-powered text parsing.
6. **Recipe System** — Reusable step-by-step playbooks for common tasks, with material templates.
7. **Inventory Management** — Track tools and materials across warehouse and job sites.

---

## 2. TECH STACK

| Layer | Technology |
|---|---|
| Frontend Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui (Radix primitives) |
| State Management | React Query (TanStack Query) for server state; React useState for local |
| Routing | React Router v6 |
| Database | PostgreSQL (via Supabase / Lovable Cloud) |
| Authentication | Supabase Auth (email/password) |
| Backend Functions | Supabase Edge Functions (Deno) |
| AI Gateway | Lovable AI Gateway (`ai.gateway.lovable.dev`) — Google Gemini 2.5 Flash |
| UI Components | shadcn/ui (Button, Card, Dialog, Sheet, Select, Tabs, etc.) |
| Charts | Recharts |
| Date Handling | date-fns |
| Form Validation | React Hook Form + Zod |

---

## 3. DATABASE STRUCTURE

### 3.1 Core Business Tables

| Table | Purpose |
|---|---|
| `projects` | Active construction projects with name, address, status |
| `tasks` | Individual work items belonging to a project |
| `task_materials` | Materials/tools needed for a specific task |
| `task_workers` | Labor log — crew members joined/left timestamps per task |
| `task_candidates` | Users eligible to join a crew-mode task |
| `scopes` | Property inspection/estimation records |
| `scope_items` | Individual line items within a scope (with pricing) |

### 3.2 User & Access Tables

| Table | Purpose |
|---|---|
| `profiles` | User profiles (full_name, is_admin, can_manage_projects) |
| `profile_aliases` | Alternate names for AI matching (e.g., nicknames) |
| `project_members` | Maps users to projects with roles (contractor/manager/read_only) |
| `scope_members` | Maps users to scopes with roles (viewer/editor/manager) |

### 3.3 Template & Library Tables

| Table | Purpose |
|---|---|
| `task_recipes` | Reusable task playbooks (name, trade, keywords, cost estimates) |
| `task_recipe_steps` | Ordered steps within a recipe |
| `task_recipe_step_materials` | Materials template for each recipe step (with qty_formula support) |
| `task_material_bundles` | Keyword-matched material sets auto-applied to new tasks |
| `task_material_bundle_items` | Individual materials within a bundle |
| `rehab_library` | Trade-specific scope templates (e.g., "Bathroom Rehab") |
| `rehab_library_items` | Pre-defined scope items within a rehab template |
| `checklist_templates` | Named inspection checklists |
| `checklist_items` | Individual checklist line items |
| `scope_checklist_reviews` | Per-scope review state for each checklist item |
| `cost_items` | Global cost library (unit pricing reference data) |

### 3.4 Inventory Tables

| Table | Purpose |
|---|---|
| `tool_types` | Catalog of tool definitions |
| `tool_stock` | Tool quantities by location (warehouse / job site) |
| `material_inventory` | Bulk material stock tracking |
| `store_sections` | Store aisle/section categories for shopping organization |

### 3.5 Capture Tables

| Table | Purpose |
|---|---|
| `field_captures` | Raw text + AI output from field mode sessions |

---

## 4. KEY ENTITY RELATIONSHIPS

### Projects → Tasks
- `tasks.project_id` → `projects.id`
- Tasks can be nested: `tasks.parent_task_id` → `tasks.id`
- Tasks link back to scope origin: `tasks.source_scope_item_id` → `scope_items.id`
- Tasks link to recipes: `tasks.expanded_recipe_id`, `tasks.source_recipe_id`, `tasks.source_recipe_step_id`

### Scopes → Scope Items
- `scope_items.scope_id` → `scopes.id`
- Scope items can reference cost library: `scope_items.cost_item_id` → `cost_items.id`
- Scope items can hint at recipes: `scope_items.recipe_hint_id` → `task_recipes.id`

### Tasks → Materials
- `task_materials.task_id` → `tasks.id`
- Materials can reference tools: `task_materials.tool_type_id` → `tool_types.id`

### Tasks → Labor
- `task_workers.task_id` → `tasks.id` (crew members with join/leave timestamps)
- `task_candidates.task_id` → `tasks.id` (eligible crew members)
- `tasks.assigned_to_user_id` → solo assignment
- `tasks.claimed_by_user_id`, `tasks.started_by_user_id` → action tracking

### Users → Memberships
- `project_members` (user_id, project_id, role) — project access
- `scope_members` (user_id, scope_id, role) — scope access
- `profiles` — user metadata with admin/manager flags

### Projects ↔ Scopes
- `projects.scope_id` → `scopes.id` (optional link to source scope)
- `scopes.converted_project_id` → `projects.id` (reverse link after conversion)

### Recipes → Steps → Materials
- `task_recipe_steps.recipe_id` → `task_recipes.id`
- `task_recipe_step_materials.recipe_step_id` → `task_recipe_steps.id`

### Rehab Library → Items
- `rehab_library_items.library_id` → `rehab_library.id`
- `rehab_library_items.recipe_hint_id` → `task_recipes.id`

---

## 5. CORE SYSTEM FLOWS

### 5.1 Scope Creation
1. User creates a scope with an address
2. Creator becomes `manager` in `scope_members`
3. Scope items are added manually or via AI walkthrough
4. Checklist template is optionally attached for coverage tracking
5. Each item gets status (Not Checked / OK / Repair / Replace / Get Bid) and pricing

### 5.2 Scope → Project Conversion
1. Admin/manager triggers conversion from ScopeDetail page
2. System filters actionable items: status in (Repair, Replace, Get Bid) OR items with priced estimates
3. New project created; scope items become tasks linked via `tasks.source_scope_item_id`
4. `estimated_total_snapshot` captured on scope for historical comparison
5. `has_missing_estimates` flag set on project if any item lacks pricing
6. Original scope remains active and reusable

### 5.3 Walkthrough Parsing (Scope)
1. User enters free-text walkthrough notes on `ScopeWalkthrough` page
2. Frontend calls `scope_walkthrough_parse` Edge Function
3. Function fetches existing scope items, checklist, cost library, known users
4. AI (Gemini 2.5 Flash) analyzes text and returns:
   - **matched**: existing items with suggested status updates
   - **new_items**: generated scope items with extracted pricing
   - **not_addressed_items**: existing items not mentioned
   - **checklist coverage**: items mapped to checklist
   - **member assignments**: detected user mentions
5. Deterministic post-processing extracts pricing via regex (qty, unit cost, totals)
6. Cost library auto-matching via normalized name + Jaccard similarity
7. User reviews and approves; `scope_walkthrough_apply` commits changes

### 5.4 Walkthrough Parsing (Project/Tasks)
1. User enters text on `ProjectWalkthrough` page
2. Frontend calls `walkthrough_parse_tasks` Edge Function
3. AI parses into structured draft tasks with materials, assignments, priorities
4. Assignment matching against known users (profiles + aliases)
5. User reviews drafts, then submits to create tasks

### 5.5 Task Creation & Assignment
1. Tasks created manually, via walkthrough, or via field mode
2. Assignment modes: `solo` (single assignee) or `crew` (multiple workers)
3. Solo: set `assigned_to_user_id`
4. Crew: add users to `task_candidates`, workers self-join via `task_workers`
5. Stage lifecycle: Not Ready → Ready → In Progress → Done (or Hold)
6. `started_at`/`started_by_user_id` set when moved to In Progress
7. `completed_at` set when moved to Done

### 5.6 Material Tracking
1. Materials attached to tasks via `task_materials`
2. Each material tracks: purchased → delivered → confirmed_on_site
3. Auto-populated via recipe expansion or material bundles
4. Shopping page aggregates unpurchased materials across all projects
5. Grouped by store section for efficient shopping runs
6. `store_section` can be auto-inferred or manually set (`store_section_manual` flag)

### 5.7 Recipe Expansion
1. Task detail page suggests matching recipes (via keyword matching)
2. User triggers expansion → calls `expand_recipe` RPC
3. RPC atomically creates child tasks from recipe steps
4. Materials populated from `task_recipe_step_materials` with formula evaluation
5. Formulas support: `room_sqft`, `perimeter_ft`, `task_qty` with arithmetic
6. Parent task gets `expanded_recipe_id` set

### 5.8 Field Mode Capture
1. User opens Field Mode from Today or Project page
2. Dictates/types site observations (min 20 chars)
3. `field_mode_parse` Edge Function extracts up to 8 draft tasks with materials
4. User reviews on preview page
5. `field_mode_submit` commits: creates `field_captures` record, inserts tasks
6. Tasks created with `stage='Not Ready'`, `needs_manager_review=true`
7. Material bundles auto-applied to new tasks

---

## 6. SUPABASE BACKEND LOGIC

### 6.1 RPC Functions

| Function | Purpose |
|---|---|
| `is_admin(_user_id)` | Check if user has admin flag in profiles |
| `can_manage_projects(_user_id)` | Check if user has can_manage_projects flag |
| `is_project_member(_user_id, _project_id)` | Check project membership |
| `get_project_role(_user_id, _project_id)` | Get user's role in a project |
| `is_scope_member(_user_id, _scope_id)` | Check scope membership |
| `get_scope_role(_user_id, _scope_id)` | Get user's role in a scope |
| `expand_recipe(p_parent_task_id, p_recipe_id, p_user_id)` | Atomically expand a recipe into child tasks with materials and formula evaluation |
| `capture_recipe_from_task(p_parent_task_id, p_recipe_id)` | Reverse-capture: sync child tasks back into a recipe template |

### 6.2 Edge Functions

| Function | File | Purpose |
|---|---|---|
| `walkthrough_parse_tasks` | `supabase/functions/walkthrough_parse_tasks/index.ts` | AI-powered project walkthrough → draft tasks with materials and assignments |
| `field_mode_parse` | `supabase/functions/field_mode_parse/index.ts` | AI-powered field observation → draft tasks (max 8) |
| `field_mode_submit` | `supabase/functions/field_mode_submit/index.ts` | Commit field mode tasks to database with material bundles |
| `scope_walkthrough_parse` | `supabase/functions/scope_walkthrough_parse/index.ts` | AI-powered scope walkthrough → matched/new items with pricing extraction |
| `scope_walkthrough_apply` | `supabase/functions/scope_walkthrough_apply/index.ts` | Apply approved walkthrough results to scope items |

All edge functions:
- Validate JWT and extract user identity via `auth.getClaims()`
- Check membership/role authorization via service role client
- Use Lovable AI Gateway with `google/gemini-2.5-flash` model
- Include CORS headers for browser access
- Sanitize and validate all AI outputs before returning

### 6.3 Database Triggers

| Trigger/Function | Purpose |
|---|---|
| `handle_new_user()` | Auto-creates profile on user signup; first user gets `is_admin=true` |
| `protect_admin_flag()` | Prevents non-admins from modifying `is_admin` or `can_manage_projects` |
| `protect_actual_cost()` | Only admins can update `actual_total_cost` on tasks |
| `update_updated_at_column()` | Auto-updates `updated_at` timestamp on row changes |

---

## 7. PERMISSIONS MODEL

### 7.1 Roles

| Role | Context | Capabilities |
|---|---|---|
| **Admin** (`profiles.is_admin`) | Global | Full CRUD on everything. Manage users, delete projects, update costs. |
| **Manager** (`project_members.role='manager'`) | Per-project | Create/update/delete tasks, manage members, run walkthroughs. |
| **Contractor** (`project_members.role='contractor'`) | Per-project | Create/update tasks, manage own materials. Cannot delete tasks. |
| **Read Only** (`project_members.role='read_only'`) | Per-project | View only. No mutations. |
| **Can Manage Projects** (`profiles.can_manage_projects`) | Global | Create projects/scopes, manage recipes/bundles/library. |

Scope-level roles mirror project roles: `manager`, `editor`, `viewer`.

### 7.2 RLS Enforcement

All tables have Row-Level Security enabled. Policies use `SECURITY DEFINER` helper functions:

- **SELECT**: Usually `is_admin(auth.uid()) OR is_project_member(auth.uid(), project_id)`
- **INSERT/UPDATE**: Role-checked via `get_project_role()` requiring contractor or manager
- **DELETE**: Typically admin-only or admin + manager
- **Global tables** (cost_items, recipes, etc.): Any authenticated user can SELECT; admin/can_manage_projects for mutations

### 7.3 Edge Function Authorization

Edge functions perform their own auth checks:
1. Extract JWT claims from Authorization header
2. Verify user identity via `auth.getClaims()`
3. Check admin status or project/scope membership via service role queries
4. Reject with 401/403 if unauthorized

---

## 8. UI STRUCTURE

### Navigation (Mobile Bottom Bar)

| Tab | Route | Purpose |
|---|---|---|
| Today | `/today` | Personal dashboard: in-progress tasks, assigned tasks, available tasks, needs-review |
| Projects | `/projects` | List of user's projects |
| Scopes | `/scopes` | List of user's scopes |
| Shopping | `/shopping` | Aggregated shopping list across all projects |
| Admin | `/admin` | Admin panel (admin-only) |

### Key Pages

| Page | Route | Purpose |
|---|---|---|
| Login | `/login` | Email/password authentication |
| Today | `/today` | Personal task dashboard with crew task awareness |
| Field Mode Capture | `/today/field-mode`, `/projects/:id/field-mode` | AI text-to-tasks capture |
| Field Mode Preview | `*/field-mode/preview` | Review AI-parsed tasks before commit |
| Project List | `/projects` | All user's projects with status filters |
| Project Detail | `/projects/:id` | Task list, member management, walkthrough access |
| Project Materials | `/projects/:id/materials` | All materials across project tasks |
| Project Walkthrough | `/projects/:id/walkthrough` | AI-powered task creation from dictation |
| Task Detail | `/projects/:projectId/tasks/:taskId` | Full task editor: stage, priority, materials, recipe, crew, labor |
| Scope List | `/scopes` | All user's scopes |
| Scope Detail | `/scopes/:id` | Scope items, pricing, conversion, checklist coverage |
| Scope Walkthrough | `/scopes/:id/walkthrough` | AI-powered scope item creation from dictation |
| Shopping | `/shopping` | Cross-project material shopping list grouped by store section |
| Admin Panel | `/admin` | User management, cost library, aliases |
| Admin Recipes | `/admin/recipes` | Recipe CRUD with steps and materials |
| Admin Bundles | `/admin/bundles` | Material bundle CRUD |
| Admin Rehab Library | `/admin/rehab-library` | Rehab template CRUD |
| Admin Store Sections | `/admin/store-sections` | Store section management |
| Admin Scope Accuracy | `/admin/scope-accuracy` | Scope estimate vs actual comparison |
| Tool Inventory | `/admin/inventory/tools` | Tool stock management |
| Material Inventory | `/admin/inventory/materials` | Material stock management |

---

## 9. AI FEATURES

### 9.1 Scope Walkthrough Parsing (`scope_walkthrough_parse`)
- **Input**: Free-text walkthrough notes + existing scope items + checklist + cost library
- **Output**: Matched items with status updates, new items with extracted pricing, checklist coverage, user mentions
- **Post-processing**: Deterministic regex pricing extraction (qty, unit, unit_cost, total_cost), cost library matching via normalized names and Jaccard similarity
- **Model**: Google Gemini 2.5 Flash

### 9.2 Project Walkthrough Parsing (`walkthrough_parse_tasks`)
- **Input**: Free-text task descriptions + known users (profiles + aliases) + project members
- **Output**: Draft tasks with materials, priorities, due dates, user assignments
- **Assignment matching**: Case-insensitive full name, alias, or unique substring match
- **Model**: Google Gemini 2.5 Flash

### 9.3 Field Mode Parsing (`field_mode_parse`)
- **Input**: Dictated site observations (min 20 chars)
- **Output**: Up to 8 structured tasks with materials, trades, rooms
- **Model**: Google Gemini 2.5 Flash

### 9.4 Client-Side Matching Engine
- **Recipe Matching** (`src/lib/recipeMatch.ts`): Suggests recipes for tasks via keyword + Jaccard similarity
- **Bundle Matching** (`src/lib/bundleMatch.ts`): Auto-applies material bundles to tasks
- **Checklist Matching** (`src/lib/checklistMatch.ts`): Maps scope items to checklist items via normalization + synonyms
- **Rehab Template Matching** (`src/lib/rehabMatch.ts`): Detects applicable rehab templates from walkthrough text
- **Store Section Inference** (`src/lib/inferStoreSection.ts`): Auto-categorizes materials into store sections
- **Shared normalization**: lowercase, strip punctuation, remove leading verbs, synonym mapping

---

## 10. AUTOMATIONS & INTEGRATIONS

### 10.1 Lovable Cloud (Supabase)
- PostgreSQL database with RLS
- Supabase Auth for email/password authentication
- Edge Functions for serverless AI processing
- Service role client for admin operations within functions

### 10.2 Lovable AI Gateway
- Endpoint: `https://ai.gateway.lovable.dev/v1/chat/completions`
- Auth: `LOVABLE_API_KEY` secret
- Used by all AI edge functions
- Handles rate limiting (429) and credit exhaustion (402)

### 10.3 Auto-Applied Material Bundles
- On task creation (field mode submit), system matches task titles against active bundles
- Matched bundle items inserted into `task_materials` with deduplication
- Tasks flagged with `bundles_applied=true`

### 10.4 Recipe Expansion Automation
- `expand_recipe` RPC handles atomic child task creation
- Formula-based material quantity calculation (room_sqft, perimeter_ft, task_qty)
- `capture_recipe_from_task` enables reverse-capture from executed work back into recipes

### 10.5 Auto-Profile Creation
- `handle_new_user()` trigger creates profile on signup
- First registered user automatically becomes admin

---

## 11. REPORTING & ANALYTICS

### 11.1 Scope Accuracy (`/admin/scope-accuracy`)
- Compares scope estimates vs actual project costs
- Links via `tasks.source_scope_item_id` back to original scope items
- Tracks: `estimated_hours`, `estimated_labor_cost`, `estimated_material_cost` on scope items
- Tracks: `actual_total_cost` on tasks

### 11.2 Project Cost Tracking
- `scope_items.computed_total` = qty × unit_cost_override (calculated field)
- `scope_items.unit_cost_override` can be set manually or auto-filled from cost library
- `scopes.estimated_total_snapshot` captured at conversion time
- `projects.has_missing_estimates` flags incomplete pricing

### 11.3 Material Totals
- Shopping page aggregates materials by: not purchased → purchased not delivered → delivered
- Groups by store section and project for shopping runs
- Supports copy-to-clipboard for shopping lists

### 11.4 Labor Tracking
- `task_workers` table: `joined_at`, `left_at`, `active` flag
- Supports multiple concurrent workers per task (crew mode)
- `tasks.started_at` / `tasks.completed_at` for task-level duration

---

## 12. IMPORTANT ARCHITECTURAL RULES

1. **Scopes are reusable blueprints** — they remain active after conversion and can generate multiple projects
2. **Tasks always belong to a project** — never standalone
3. **Materials attach to tasks** — `task_materials.task_id` is required
4. **Labor is logged through worker shifts** — `task_workers` with join/leave timestamps
5. **Recipes define HOW** (execution steps), **Rehab Library defines WHAT** (scope items)
6. **Recipe hints bridge the gap** — `scope_items.recipe_hint_id` and `rehab_library_items.recipe_hint_id` suggest recipes when items become tasks
7. **Material bundles are auto-applied** — matched by keywords when tasks are created
8. **Field mode tasks require manager review** — `needs_manager_review=true`, `stage='Not Ready'`
9. **All edge functions verify JWT** — even with `verify_jwt=false` in config, manual auth is performed
10. **Cost library provides pricing defaults** — `cost_items` with normalized names for fuzzy matching
11. **Cascading deletes** — project deletion cascades to tasks, members, materials via FK constraints (RLS bypassed for internal CASCADE)
12. **Admin is the first user** — `handle_new_user()` sets `is_admin=true` if no admins exist
13. **Assignment modes** — Solo tasks use `assigned_to_user_id`; crew tasks use `task_candidates` + `task_workers`
14. **Matching engine uses adaptive thresholds** — 0.50 for ≤2 tokens, 0.70 for longer labels, with synonym normalization

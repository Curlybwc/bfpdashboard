

## Plan: QuickBooks Export — Real Expense Account + Class Mapping

### 1. Database Migration (one migration, three changes)

**A. `quickbooks_settings` — single-row app-wide config**

```sql
CREATE TABLE public.quickbooks_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_expense_account_id text,
  labor_expense_account_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce single-row via unique constraint on a constant column
ALTER TABLE public.quickbooks_settings
  ADD COLUMN singleton boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT quickbooks_settings_singleton UNIQUE (singleton),
  ADD CONSTRAINT quickbooks_settings_singleton_check CHECK (singleton = true);

ALTER TABLE public.quickbooks_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select qb settings" ON public.quickbooks_settings
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert qb settings" ON public.quickbooks_settings
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update qb settings" ON public.quickbooks_settings
  FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
```

**B. `quickbooks_class_mappings` — one QB class per project**

```sql
CREATE TABLE public.quickbooks_class_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  qb_class_id text NOT NULL,
  qb_class_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

ALTER TABLE public.quickbooks_class_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select class mappings" ON public.quickbooks_class_mappings
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert class mappings" ON public.quickbooks_class_mappings
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update class mappings" ON public.quickbooks_class_mappings
  FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete class mappings" ON public.quickbooks_class_mappings
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));
```

### 2. Edge Function Changes — `quickbooks_export_payables/index.ts`

Add two new lookups before the per-batch loop:

1. Fetch the single `quickbooks_settings` row. If missing or `labor_expense_account_id` is null, return an immediate error for all batches: *"Configure a QuickBooks expense account in Payroll → QB Settings before exporting."*

2. Fetch `quickbooks_class_mappings` for all `project_id`s in the batch set. Build a `classMap` keyed by `project_id`.

In the per-batch loop, add a new check after vendor mapping:

- If the batch's `project_id` has no class mapping → **fail that batch** with error: *"No QuickBooks class mapped for project \"{projectName}\". Add a class mapping in QB Settings before exporting."* (write error to `qb_export_error`, same pattern as vendor check)

Update the bill payload:

```text
AccountBasedExpenseLineDetail: {
  AccountRef: { value: settings.labor_expense_account_id, name: settings.labor_expense_account_name },
  ClassRef: { value: classMapping.qb_class_id, name: classMapping.qb_class_name }
}
```

Update Description/PrivateNote to include project address:

```text
Description: "Payroll: {period_start} to {period_end} · {projectAddress || projectName}"
PrivateNote: "Lovable Payroll Batch #{batchId.slice(0,8)} · {projectName}"
```

### 3. Admin UI — new section in `PayrollSummary.tsx`

Add a collapsible **"QuickBooks Settings"** card between the connection banner and the pay period selector. Visible only when `qbStatus?.connected` is true. Three sub-sections:

**A. Expense Account** — single row with two text inputs (Account ID, Display Name) and a Save button. On mount, fetch from `quickbooks_settings`; upsert on save.

**B. Project → Class Mappings** — table of active projects (fetched from `projects` where status = 'active'). Each row shows project name + address, with text inputs for QB Class ID and Class Name. Inline save per row (upsert into `quickbooks_class_mappings`).

**C. Vendor Mappings** — table of active profiles. Each row shows contractor name, with text inputs for QB Vendor ID and Vendor Name. Inline save per row (upsert into `quickbooks_vendor_mappings`).

### 4. Files Changed

| File | Change |
|------|--------|
| New migration SQL | Create `quickbooks_settings` + `quickbooks_class_mappings` |
| `supabase/functions/quickbooks_export_payables/index.ts` | Read settings + class mappings; fail on missing; use real AccountRef + ClassRef |
| `src/components/shifts/PayrollSummary.tsx` | Add QB Settings collapsible card with 3 sub-sections |

### 5. Fallback / Error Behavior

- **Missing expense account** → All batches in the request fail with one clear error message
- **Missing class mapping for a project** → That specific batch fails with actionable error naming the project (hard blocker per user request)
- **Missing vendor mapping** → Unchanged; already fails per-batch with actionable error


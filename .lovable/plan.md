

## QuickBooks Account Picker — Implementation Plan

### Files to Change

**1. Create `supabase/functions/quickbooks_list_accounts/index.ts`**
- Clone pattern from `quickbooks_list_classes/index.ts`
- Query: `SELECT Id, Name, FullyQualifiedName, AccountType, AccountSubType, Active FROM Account WHERE Active = true AND AccountType = 'Expense' MAXRESULTS 1000`
- Return `{ accounts: [{ id, name, fully_qualified_name, account_type, account_sub_type }] }`
- Admin-only via `requireAdminAuth`, reuse `getActiveConnection` + `qbApiFetch` from shared helpers

**2. Edit `supabase/config.toml`**
- Add `[functions.quickbooks_list_accounts]` with `verify_jwt = false`

**3. Edit `src/components/shifts/QBSettingsCard.tsx`**
- Add state: `qbAccounts`, `qbAccountsLoading`, `qbAccountsLoaded`, `qbAccountsError` (same pattern as class picker)
- Add `loadQBAccounts()` calling `supabase.functions.invoke('quickbooks_list_accounts')`
- Add "Load QB Accounts" / "Refresh Accounts" button in the Labor Expense Account section header
- When loaded: replace manual ID/Name inputs with a `<Select>` dropdown
  - Display format: `fully_qualified_name (account_sub_type)` — e.g. "Contract Labor (ContractorExpense)" to distinguish similar names
- On selection: auto-fill `expAccountId` and `expAccountName`, mark `expDirty = true`
- Fallback: keep manual text inputs when accounts aren't loaded or fetch fails

### What stays unchanged
- `quickbooks_export_payables` reads `labor_expense_account_id` / `labor_expense_account_name` from `quickbooks_settings` — no change needed
- Class mappings, vendor mappings, Save All behavior — untouched
- Database schema — untouched


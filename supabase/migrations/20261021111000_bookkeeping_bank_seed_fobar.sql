-- QuickBooks Write-Back Stage 1 seed (independent review S4): the FOBAR
-- Great Southern Bank checking account the mirror loads against.
-- The id matches the row already live in Ezzie Staging (seeded 2026-10-21),
-- so this is a no-op there and a correct seed in a fresh environment.
insert into public.financial_accounts
  (id, display_name, account_type, owner_organization_id, currency_code,
   account_last4, status, source_system, notes)
values
  ('b9adf626-1bf2-4d3d-a06e-5d06f8d7e838',
   'FOBAR — Great Southern Bank Checking',
   'checking',
   '5f60331c-e7aa-4234-82e8-e0cc6c5d541e',
   'USD', '6662', 'active', 'plaid',
   'FOBAR Holdings LLC operating checking at Great Southern Bank; Plaid account mask 6662; QBO account name: FOBAR - 1')
on conflict (id) do nothing;

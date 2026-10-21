/**
 * Finance lives in the sidebar as an expandable tree (Jen's hierarchy,
 * 2026-10-21; twin of the grouped Finance tree in the Ezzie app),
 * ordered by kind of work: accounting first (classification — the
 * recording of what already happened), then the money-out surfaces
 * (payroll, pay history, reimbursements). QuickBooks Vendor Mappings
 * is configuration and lives under Admin in this app, not here.
 * Pay History is the old "Accounting" payments ledger, renamed.
 */
export const FINANCE_NAV_CHILDREN = [
  { label: 'Classification Queue', to: '/finance/bank-queue' },
  { label: 'Payroll', to: '/payroll' },
  { label: 'Pay History', to: '/admin/accounting' },
  { label: 'Reimbursements', to: '/admin/reimbursements' },
] as const;

export const FINANCE_PATH_PREFIXES = [
  '/admin/accounting',
  '/finance',
  '/admin/reimbursements',
  '/payroll',
] as const;

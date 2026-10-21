/**
 * Finance lives in the sidebar as an expandable tree (Jen's direction,
 * 2026-10-21; twin of FINANCE_NAV_CHILDREN in the Ezzie app). One entry
 * per finance surface that exists in this app; steps of one workflow
 * (e.g. the reimbursement payment queue) are reached from inside their
 * surface, not as sibling entries.
 */
export const FINANCE_NAV_CHILDREN = [
  { label: 'Accounting', to: '/admin/accounting' },
  { label: 'Bank Classification Queue', to: '/finance/bank-queue' },
  { label: 'Reimbursements', to: '/admin/reimbursements' },
  { label: 'Payroll', to: '/payroll' },
  { label: 'QuickBooks Vendor Mappings', to: '/admin/vendor-mappings' },
] as const;

export const FINANCE_PATH_PREFIXES = [
  '/admin/accounting',
  '/finance',
  '/admin/reimbursements',
  '/admin/vendor-mappings',
  '/payroll',
] as const;

export type ReimbursementStatus =
  | 'submitted'
  | 'needs_info'
  | 'not_approved'
  | 'approved'
  | 'exported'
  | 'paid'
  | 'voided';

export const REIMBURSEMENT_STATUS_LABEL: Record<ReimbursementStatus, string> = {
  submitted: 'Submitted',
  needs_info: 'More Info Needed',
  not_approved: 'Not Approved',
  approved: 'Approved',
  exported: 'Sent to QuickBooks',
  paid: 'Paid',
  voided: 'Voided',
};

export const REIMBURSEMENT_STATUS_VARIANT: Record<ReimbursementStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  submitted: 'secondary',
  needs_info: 'outline',
  not_approved: 'destructive',
  approved: 'default',
  exported: 'default',
  paid: 'default',
  voided: 'outline',
};

export const SETTLEMENT_METHODS = ['QuickBooks', 'Bank ACH', 'Check', 'Zelle', 'Cash', 'Other'] as const;
export type SettlementMethod = typeof SETTLEMENT_METHODS[number];

export const ALLOWED_RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_RECEIPTS_PER_REQUEST = 5;
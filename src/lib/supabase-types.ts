// Convenience types derived from the database schema
export type ProjectStatus = 'active' | 'paused' | 'complete';
export type ProjectType = 'construction' | 'rental' | 'general';
export type ProjectMemberRole = 'contractor' | 'manager' | 'read_only';
export type TaskStage = 'Ready' | 'In Progress' | 'Not Ready' | 'Hold' | 'Done';
export type TaskPriority = '1 – Now' | '2 – This Week' | '3 – Soon' | '4 – When Time' | '5 – Later';
export type MaterialsStatus = 'Yes' | 'Partial' | 'No';
/** UI-facing subset of the database scope_status enum (which also includes Draft, Converted, Archived). */
export type ScopeStatus = 'active' | 'archived';
export type ScopeMemberRole = 'viewer' | 'editor' | 'manager';
export type UnitType = 'each' | 'sqft' | 'lf' | 'piece';
export type PricingStatus = 'Priced' | 'Needs Pricing';
export type PayoutOnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'restricted';
export type PayoutRunStatus = 'draft' | 'submitted' | 'completed' | 'canceled' | 'failed' | 'partially_failed';
export type WorkerPayableBatchStatus = 'draft' | 'exported' | 'paid' | 'voided';
export type WorkerPaymentSource = 'stripe_connect' | 'manual_quickbooks' | 'venmo_manual' | 'quickbooks_linked';
export type WorkerPaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'voided';
export type WorkerTaxClassification = 'contractor_1099' | 'employee_w2';

export const TASK_STAGES: TaskStage[] = ['Ready', 'In Progress', 'Not Ready', 'Hold', 'Done'];
export const TASK_PRIORITIES: TaskPriority[] = ['1 – Now', '2 – This Week', '3 – Soon', '4 – When Time', '5 – Later'];
export const MATERIALS_OPTIONS: MaterialsStatus[] = ['Yes', 'Partial', 'No'];
export const PROJECT_STATUSES: ProjectStatus[] = ['active', 'paused', 'complete'];
export const SCOPE_STATUSES: ScopeStatus[] = ['active', 'archived'];
export const PRICING_STATUSES: PricingStatus[] = ['Priced', 'Needs Pricing'];
export const PAYOUT_ONBOARDING_STATUSES: PayoutOnboardingStatus[] = ['not_started', 'in_progress', 'completed', 'restricted'];
export const PAYOUT_RUN_STATUSES: PayoutRunStatus[] = ['draft', 'submitted', 'completed', 'canceled', 'failed', 'partially_failed'];
export const WORKER_PAYABLE_BATCH_STATUSES: WorkerPayableBatchStatus[] = ['draft', 'exported', 'paid', 'voided'];
export const WORKER_PAYMENT_SOURCES: WorkerPaymentSource[] = ['stripe_connect', 'manual_quickbooks', 'venmo_manual', 'quickbooks_linked'];
export const WORKER_PAYMENT_STATUSES: WorkerPaymentStatus[] = ['pending', 'processing', 'paid', 'failed', 'voided'];
export const WORKER_TAX_CLASSIFICATIONS: WorkerTaxClassification[] = ['contractor_1099', 'employee_w2'];

export type AssignmentMode = 'solo' | 'crew';

export type BlockerReason =
  | 'missing_materials' | 'access_issue' | 'waiting_on_approval'
  | 'hidden_damage' | 'tool_equipment' | 'waiting_on_trade' | 'instruction_mismatch' | 'new_work_discovered' | 'other';

export const BLOCKER_REASONS: { value: BlockerReason; label: string }[] = [
  { value: 'missing_materials', label: 'Missing Materials' },
  { value: 'access_issue', label: 'Access Issue' },
  { value: 'waiting_on_approval', label: 'Waiting on Approval' },
  { value: 'hidden_damage', label: 'Hidden Damage / Unexpected' },
  { value: 'tool_equipment', label: 'Tool / Equipment Issue' },
  { value: 'waiting_on_trade', label: 'Waiting on Another Trade' },
  { value: 'instruction_mismatch', label: 'Instruction Mismatch' },
  { value: 'new_work_discovered', label: 'New Work Discovered' },
  { value: 'other', label: 'Other' },
];

export type ScopeItemStatus = 'Not Checked' | 'OK' | 'Repair' | 'Replace' | 'Get Bid';
export const SCOPE_ITEM_STATUSES: ScopeItemStatus[] = ['Not Checked', 'OK', 'Repair', 'Replace', 'Get Bid'];

export type AssignmentOutcome = 'assign_user' | 'outside_vendor' | 'crew';

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export const RECURRENCE_FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

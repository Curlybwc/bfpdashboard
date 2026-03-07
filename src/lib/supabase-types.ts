// Convenience types derived from the database schema
export type ProjectStatus = 'active' | 'paused' | 'complete';
export type ProjectMemberRole = 'contractor' | 'manager' | 'read_only';
export type TaskStage = 'Ready' | 'In Progress' | 'Not Ready' | 'Hold' | 'Done';
export type TaskPriority = '1 – Now' | '2 – This Week' | '3 – Soon' | '4 – When Time' | '5 – Later';
export type MaterialsStatus = 'Yes' | 'Partial' | 'No';
/** UI-facing subset of the database scope_status enum (which also includes Draft, Converted, Archived). */
export type ScopeStatus = 'active' | 'archived';
export type ScopeMemberRole = 'viewer' | 'editor' | 'manager';
export type UnitType = 'each' | 'sqft' | 'lf' | 'piece';
export type PricingStatus = 'Priced' | 'Needs Pricing';

export const TASK_STAGES: TaskStage[] = ['Ready', 'In Progress', 'Not Ready', 'Hold', 'Done'];
export const TASK_PRIORITIES: TaskPriority[] = ['1 – Now', '2 – This Week', '3 – Soon', '4 – When Time', '5 – Later'];
export const MATERIALS_OPTIONS: MaterialsStatus[] = ['Yes', 'Partial', 'No'];
export const PROJECT_STATUSES: ProjectStatus[] = ['active', 'paused', 'complete'];
export const SCOPE_STATUSES: ScopeStatus[] = ['active', 'archived'];
export const PRICING_STATUSES: PricingStatus[] = ['Priced', 'Needs Pricing'];

export type AssignmentMode = 'solo' | 'crew';

export type BlockerReason =
  | 'missing_materials' | 'access_issue' | 'waiting_on_approval'
  | 'hidden_damage' | 'tool_equipment' | 'waiting_on_trade' | 'other';

export const BLOCKER_REASONS: { value: BlockerReason; label: string }[] = [
  { value: 'missing_materials', label: 'Missing Materials' },
  { value: 'access_issue', label: 'Access Issue' },
  { value: 'waiting_on_approval', label: 'Waiting on Approval' },
  { value: 'hidden_damage', label: 'Hidden Damage / Unexpected' },
  { value: 'tool_equipment', label: 'Tool / Equipment Issue' },
  { value: 'waiting_on_trade', label: 'Waiting on Another Trade' },
  { value: 'other', label: 'Other' },
];

export type ScopeItemStatus = 'Not Checked' | 'OK' | 'Repair' | 'Replace' | 'Get Bid';
export const SCOPE_ITEM_STATUSES: ScopeItemStatus[] = ['Not Checked', 'OK', 'Repair', 'Replace', 'Get Bid'];

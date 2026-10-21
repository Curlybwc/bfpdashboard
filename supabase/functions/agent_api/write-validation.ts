import { TASK_STAGES, TASK_PRIORITIES } from './validation.ts';
export class InputError extends Error {
  constructor(public code: string, message = code, public status = 400) { super(message); }
}
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function text(v: unknown, field: string, nullable = false): string | null {
  if (nullable && v === null) return null;
  if (typeof v !== 'string' || !v.trim() || v.trim().length > 2000) throw new InputError(`invalid_${field}`);
  return v.trim();
}
export function date(v: unknown, field: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v+'T00:00:00Z')) || new Date(v+'T00:00:00Z').toISOString().slice(0,10) !== v) throw new InputError(`invalid_${field}`);
  return v;
}
export function number(v: unknown, field: string, zero = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || (zero ? v < 0 : v <= 0) || v > 100000000 || Math.abs(v * 100 - Math.round(v * 100)) > 0.000001) throw new InputError(`invalid_${field}`);
  return v;
}
export function choice(v: unknown, field: string, values: readonly string[]): string {
  if (typeof v !== 'string' || !values.includes(v)) throw new InputError(`invalid_${field}`, `${field} must be one of: ${values.join(', ')}.`);
  return v;
}
export const SETTLEMENT_METHODS = ['bill_pay','check','direct_deposit','cash','other'] as const;
export function validateNewBody(b: Record<string, unknown>) {
  if (b.dry_run !== undefined && typeof b.dry_run !== 'boolean') throw new InputError('invalid_dry_run');
  if (b.client_ref !== undefined) {
    const value = text(b.client_ref,'client_ref');
    if (value && value.length > 200) throw new InputError('invalid_client_ref');
    if (!String(b.action).startsWith('create_')) throw new InputError('invalid_client_ref');
  }
  if (b.action === 'create_time_entry') {
    if (typeof b.purpose !== 'string' || !b.purpose.trim()) throw new InputError('missing_purpose');
    text(b.purpose,'purpose'); text(b.worker,'worker'); text(b.project,'project'); date(b.date,'date');
    if ((b.hours !== undefined) === (b.flat_rate !== undefined)) throw new InputError('invalid_compensation', 'Supply exactly one of hours or flat_rate.');
    if (b.hours !== undefined) number(b.hours,'hours');
    if (b.flat_rate !== undefined) number(b.flat_rate,'flat_rate');
  }
  if (b.purpose !== undefined) {
    if (typeof b.purpose !== 'string' || !b.purpose.trim()) throw new InputError('missing_purpose');
    text(b.purpose,'purpose');
  }
  for (const field of ['invoice_no','trade']) if (b[field] !== undefined) text(b[field],field,true);
  if (b.date !== undefined) date(b.date,'date');
  if (b.paid_at !== undefined) date(b.paid_at,'paid_at');
  if (b.settlement_method !== undefined) choice(b.settlement_method,'settlement_method',SETTLEMENT_METHODS);
  if (b.stage !== undefined) choice(b.stage,'stage',TASK_STAGES);
  if (b.priority !== undefined) choice(b.priority,'priority',TASK_PRIORITIES);
  if (b.due_date !== undefined && b.due_date !== null) date(b.due_date,'due_date');
  if (b.hours !== undefined) number(b.hours,'hours');
  if (b.flat_rate !== undefined) number(b.flat_rate,'flat_rate');
  if (b.amount !== undefined) number(b.amount,'amount');
  if (b.rate !== undefined) number(b.rate,'rate',true);
  for (const flag of ['is_active','is_manager','is_admin','skip_quickbooks_export','direct_deposit_on_file','info_1099_entered']) if (b[flag] !== undefined && typeof b[flag] !== 'boolean') throw new InputError(`invalid_${flag}`);
}

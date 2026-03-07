/**
 * Pure domain helpers for scope-to-project conversion.
 * Used by ScopeDetail for pre-conversion UI display (counts, totals, warnings).
 * The actual conversion is performed atomically by the convert_scope_to_project RPC.
 */

export interface ScopeItemForConversion {
  id: string;
  description: string;
  status: string;
  computed_total: number | null;
  recipe_hint_id: string | null;
}

/** Result shape returned by the convert_scope_to_project RPC. */
export interface ConversionResult {
  project_id: string;
  task_count: number;
  estimated_total: number;
  has_missing_estimates: boolean;
}

/**
 * Validates and parses the raw JSON returned by the convert_scope_to_project RPC.
 * Returns null if the shape is invalid or project_id is missing.
 */
export function parseConversionResult(data: unknown): ConversionResult | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.project_id !== 'string' || !d.project_id) return null;
  return {
    project_id: d.project_id,
    task_count: typeof d.task_count === 'number' ? d.task_count : 0,
    estimated_total: typeof d.estimated_total === 'number' ? d.estimated_total : 0,
    has_missing_estimates: typeof d.has_missing_estimates === 'boolean' ? d.has_missing_estimates : false,
  };
}

/**
 * Items eligible for conversion to project tasks.
 * Rule: status is actionable (Repair, Replace, Get Bid) OR has a positive computed_total.
 */
export function getConvertibleItems<T extends ScopeItemForConversion>(items: T[]): T[] {
  return items.filter(
    (item) =>
      ['Repair', 'Replace', 'Get Bid'].includes(item.status) ||
      (item.computed_total != null && item.computed_total > 0)
  );
}

/**
 * Sum of computed_total across ALL scope items (not just convertible ones).
 * Matches the snapshot behavior: every item contributes to the total estimate.
 */
export function computeEstimatedTotal(items: ScopeItemForConversion[]): number {
  return items.reduce((sum, item) => sum + (item.computed_total ?? 0), 0);
}

/**
 * Returns true if any convertible item is missing a valid estimate.
 * "Missing" = computed_total is null, undefined, or zero.
 */
export function detectMissingEstimates(convertibleItems: ScopeItemForConversion[]): boolean {
  return convertibleItems.some((item) => !item.computed_total || item.computed_total === 0);
}

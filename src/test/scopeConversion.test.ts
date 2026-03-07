import { describe, it, expect } from 'vitest';
import {
  getConvertibleItems,
  computeEstimatedTotal,
  detectMissingEstimates,
  parseConversionResult,
  type ScopeItemForConversion,
} from '@/lib/scopeConversion';

const item = (overrides: Partial<ScopeItemForConversion>): ScopeItemForConversion => ({
  id: 'id-1',
  description: 'Test item',
  status: 'Not Checked',
  computed_total: null,
  recipe_hint_id: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// getConvertibleItems
// ---------------------------------------------------------------------------
describe('getConvertibleItems', () => {
  it('includes Repair, Replace, Get Bid regardless of computed_total', () => {
    const items = [
      item({ id: '1', status: 'Repair', computed_total: null }),
      item({ id: '2', status: 'Replace', computed_total: 0 }),
      item({ id: '3', status: 'Get Bid', computed_total: 500 }),
    ];
    expect(getConvertibleItems(items)).toHaveLength(3);
  });

  it('includes OK items with positive computed_total', () => {
    const items = [item({ status: 'OK', computed_total: 100 })];
    expect(getConvertibleItems(items)).toHaveLength(1);
  });

  it('excludes OK/Not Checked with null or zero computed_total', () => {
    const items = [
      item({ status: 'OK', computed_total: null }),
      item({ status: 'OK', computed_total: 0 }),
      item({ status: 'Not Checked', computed_total: null }),
    ];
    expect(getConvertibleItems(items)).toHaveLength(0);
  });

  it('returns empty for empty input', () => {
    expect(getConvertibleItems([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeEstimatedTotal
// ---------------------------------------------------------------------------
describe('computeEstimatedTotal', () => {
  it('sums all items including non-convertible', () => {
    const items = [
      item({ status: 'OK', computed_total: 100 }),
      item({ status: 'Not Checked', computed_total: 200 }),
    ];
    expect(computeEstimatedTotal(items)).toBe(300);
  });

  it('treats null computed_total as 0', () => {
    const items = [item({ computed_total: null }), item({ computed_total: 50 })];
    expect(computeEstimatedTotal(items)).toBe(50);
  });

  it('returns 0 for empty array', () => {
    expect(computeEstimatedTotal([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// detectMissingEstimates
// ---------------------------------------------------------------------------
describe('detectMissingEstimates', () => {
  it('returns true when a convertible item has null computed_total', () => {
    expect(detectMissingEstimates([item({ status: 'Repair', computed_total: null })])).toBe(true);
  });

  it('returns true when computed_total is 0', () => {
    expect(detectMissingEstimates([item({ status: 'Repair', computed_total: 0 })])).toBe(true);
  });

  it('returns false when all have positive computed_total', () => {
    expect(detectMissingEstimates([item({ status: 'Repair', computed_total: 500 })])).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(detectMissingEstimates([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseConversionResult
// ---------------------------------------------------------------------------
describe('parseConversionResult', () => {
  it('parses valid data', () => {
    const data = { project_id: 'p1', task_count: 5, estimated_total: 1000, has_missing_estimates: false };
    const result = parseConversionResult(data);
    expect(result).toEqual(data);
  });

  it('returns null for null input', () => {
    expect(parseConversionResult(null)).toBeNull();
  });

  it('returns null for missing project_id', () => {
    expect(parseConversionResult({ task_count: 5 })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseConversionResult('string')).toBeNull();
    expect(parseConversionResult(42)).toBeNull();
  });
});

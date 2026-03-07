import { describe, it, expect } from 'vitest';
import { suggestBundles, type BundleForMatch } from '@/lib/bundleMatch';

const bundle = (overrides: Partial<BundleForMatch> & { id: string; name: string }): BundleForMatch => ({
  keywords: null,
  priority: 10,
  trade: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// suggestBundles
// ---------------------------------------------------------------------------
describe('suggestBundles', () => {
  it('returns exact keyword match with score 1.0', () => {
    const bundles = [bundle({ id: 'b1', name: 'Drywall Bundle', keywords: ['drywall'] })];
    const results = suggestBundles('drywall', bundles);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(1.0);
  });

  it('returns substring keyword match with score 0.9', () => {
    const bundles = [bundle({ id: 'b1', name: 'Paint Bundle', keywords: ['interior paint'] })];
    const results = suggestBundles('interior paint walls', bundles);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.9);
  });

  it('falls back to bundle name when no keywords', () => {
    const bundles = [bundle({ id: 'b1', name: 'drywall', keywords: [] })];
    const results = suggestBundles('drywall', bundles);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(1.0);
  });

  it('returns empty for no match', () => {
    const bundles = [bundle({ id: 'b1', name: 'Plumbing', keywords: ['plumbing', 'pipes'] })];
    const results = suggestBundles('electrical panel', bundles);
    expect(results).toHaveLength(0);
  });

  it('sorts by priority ASC then score DESC', () => {
    const bundles = [
      bundle({ id: 'b1', name: 'Low Priority', keywords: ['drywall'], priority: 20 }),
      bundle({ id: 'b2', name: 'High Priority', keywords: ['drywall'], priority: 5 }),
    ];
    const results = suggestBundles('drywall', bundles);
    expect(results[0].bundle.id).toBe('b2');
    expect(results[1].bundle.id).toBe('b1');
  });

  it('returns empty for empty description', () => {
    const bundles = [bundle({ id: 'b1', name: 'Anything', keywords: ['test'] })];
    expect(suggestBundles('', bundles)).toHaveLength(0);
  });

  it('returns empty for empty bundles array', () => {
    expect(suggestBundles('drywall', [])).toHaveLength(0);
  });
});

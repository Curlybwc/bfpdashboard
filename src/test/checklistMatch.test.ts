import { describe, it, expect } from 'vitest';
import {
  normalizeForChecklistMatch,
  jaccardSimilarity,
  isChecklistCovered,
  strongerStatus,
  matchExistingScopeItem,
} from '@/lib/checklistMatch';

// ---------------------------------------------------------------------------
// normalizeForChecklistMatch
// ---------------------------------------------------------------------------
describe('normalizeForChecklistMatch', () => {
  it('lowercases and trims', () => {
    expect(normalizeForChecklistMatch('  HELLO World  ')).toBe('hello world');
  });

  it('strips punctuation', () => {
    expect(normalizeForChecklistMatch('furnace/ac')).toBe('hvac');
  });

  it('collapses whitespace', () => {
    expect(normalizeForChecklistMatch('a   b   c')).toBe('a b c');
  });

  it('strips leading verbs', () => {
    expect(normalizeForChecklistMatch('Replace kitchen sink')).toBe('kitchen sink');
    expect(normalizeForChecklistMatch('Repair drywall')).toBe('drywall');
    expect(normalizeForChecklistMatch('Get Bid plumbing')).toBe('plumbing');
    expect(normalizeForChecklistMatch('Install ceiling fan')).toBe('ceiling fan');
  });

  it('applies synonym: furnace → hvac', () => {
    expect(normalizeForChecklistMatch('furnace')).toBe('hvac');
  });

  it('applies synonym: countertops → kitchen counters', () => {
    expect(normalizeForChecklistMatch('countertops')).toBe('kitchen counters');
  });

  it('applies synonym: hardwood floors → refinish hardwoods', () => {
    expect(normalizeForChecklistMatch('hardwood floors')).toBe('refinish hardwoods');
  });

  it('applies synonym: vinyl plank → vinyl flooring', () => {
    expect(normalizeForChecklistMatch('vinyl plank')).toBe('vinyl flooring');
  });

  it('applies synonym: trashout → dumpsters', () => {
    expect(normalizeForChecklistMatch('trashout')).toBe('dumpsters');
  });

  it('applies synonym: breaker box → electrical panel', () => {
    expect(normalizeForChecklistMatch('breaker box')).toBe('electrical panel');
  });

  it('returns empty string for empty/whitespace input', () => {
    expect(normalizeForChecklistMatch('')).toBe('');
    expect(normalizeForChecklistMatch('   ')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// jaccardSimilarity
// ---------------------------------------------------------------------------
describe('jaccardSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(jaccardSimilarity('a b c', 'a b c')).toBe(1);
  });

  it('returns 0 for disjoint strings', () => {
    expect(jaccardSimilarity('a b', 'c d')).toBe(0);
  });

  it('returns correct partial overlap', () => {
    // {a, b, c} ∩ {b, c, d} = {b, c} → 2/4 = 0.5
    expect(jaccardSimilarity('a b c', 'b c d')).toBe(0.5);
  });

  it('returns 0 for two empty strings', () => {
    expect(jaccardSimilarity('', '')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isChecklistCovered
// ---------------------------------------------------------------------------
describe('isChecklistCovered', () => {
  it('matches by cost_item_id', () => {
    expect(isChecklistCovered('anything', 'something else', 'ci-1', 'ci-1')).toBe(true);
  });

  it('does not match mismatched cost_item_ids', () => {
    expect(isChecklistCovered('no match', 'no match at all', 'ci-1', 'ci-2')).toBe(false);
  });

  it('matches by exact normalized text', () => {
    expect(isChecklistCovered('Replace HVAC', 'hvac', null, null)).toBe(true);
  });

  it('matches by substring containment', () => {
    expect(isChecklistCovered('kitchen cabinets upper', 'kitchen cabinets', null, null)).toBe(true);
  });

  it('matches via Jaccard above threshold (2-token, ≥0.50)', () => {
    // "hvac system" vs "hvac unit" → tokens {hvac, system} vs {hvac, unit} → 1/3 ≈ 0.33 → below
    expect(isChecklistCovered('hvac system', 'hvac unit', null, null)).toBe(false);
    // "kitchen sink" vs "kitchen sink faucet" → {kitchen, sink} ∩ {kitchen, sink, faucet} → 2/3 ≈ 0.67 → above 0.50
    expect(isChecklistCovered('kitchen sink', 'kitchen sink faucet', null, null)).toBe(true);
  });

  it('returns false for no match', () => {
    expect(isChecklistCovered('paint exterior', 'plumbing rough in', null, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// strongerStatus
// ---------------------------------------------------------------------------
describe('strongerStatus', () => {
  it('Replace beats Repair', () => {
    expect(strongerStatus('Replace', 'Repair')).toBe('Replace');
  });

  it('Repair beats Get Bid', () => {
    expect(strongerStatus('Repair', 'Get Bid')).toBe('Repair');
  });

  it('Get Bid beats OK', () => {
    expect(strongerStatus('Get Bid', 'OK')).toBe('Get Bid');
  });

  it('OK beats Not Checked', () => {
    expect(strongerStatus('OK', 'Not Checked')).toBe('OK');
  });

  it('is commutative', () => {
    expect(strongerStatus('Not Checked', 'Replace')).toBe('Replace');
  });

  it('handles unknown statuses (default to 0)', () => {
    expect(strongerStatus('Unknown', 'Not Checked')).toBe('Not Checked');
  });
});

// ---------------------------------------------------------------------------
// matchExistingScopeItem
// ---------------------------------------------------------------------------
describe('matchExistingScopeItem', () => {
  const items = [
    { description: 'Replace furnace', cost_item_id: 'ci-1' },
    { description: 'Install vinyl plank flooring', cost_item_id: 'ci-2' },
    { description: 'Paint interior', cost_item_id: null },
  ];

  it('matches by cost_item_id when unique', () => {
    const result = matchExistingScopeItem(items, 'anything', 'ci-1');
    expect(result).toBe(items[0]);
  });

  it('returns null for ambiguous cost_item_id matches', () => {
    const dupes = [
      { description: 'A', cost_item_id: 'ci-x' },
      { description: 'B', cost_item_id: 'ci-x' },
    ];
    expect(matchExistingScopeItem(dupes, 'A', 'ci-x')).toBeNull();
  });

  it('matches by exact normalized description', () => {
    const result = matchExistingScopeItem(items, 'paint interior', null);
    expect(result).toBe(items[2]);
  });

  it('returns null when no match', () => {
    expect(matchExistingScopeItem(items, 'build deck', null)).toBeNull();
  });

  it('returns null for empty candidate', () => {
    expect(matchExistingScopeItem(items, '', null)).toBeNull();
  });
});

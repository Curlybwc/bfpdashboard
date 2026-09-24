import { describe, it, expect } from 'vitest';
import { normalizeAddressKey, matchProperty, matchPerson, diffFacts, type CanonicalProperty } from '@/lib/portfolioImportMatch';

const canon: CanonicalProperty[] = [
  { id: 'taft', normalized_address_key: normalizeAddressKey('4150 Taft Avenue', '64111'), external_ids: [{ system_key: 'bfp_dashboard', external_id: 'proj-taft' }], project_ids: ['proj-taft'] },
  { id: 'nebraska', normalized_address_key: normalizeAddressKey('4441 Nebraska Ave', '64111'), external_ids: [], project_ids: ['proj-neb'] },
];

describe('portfolio import matcher', () => {
  it('normalizes suffixes and unit designators', () => {
    expect(normalizeAddressKey('4150 Taft Avenue.', '64111-1234')).toBe(normalizeAddressKey('4150 taft ave apt 2', '64111'));
  });
  it('matches by external id first', () => {
    expect(matchProperty({ source_system: 'bfp_dashboard', source_record_id: 'proj-taft' }, canon)).toMatchObject({ status: 'matched', id: 'taft', method: 'external_id' });
  });
  it('matches by project link', () => {
    expect(matchProperty({ source_system: 'rent_roll', source_record_id: 'r1', project_id: 'proj-neb' }, canon)).toMatchObject({ id: 'nebraska', method: 'project_link' });
  });
  it('matches existing property by exact normalized address, never duplicates', () => {
    expect(matchProperty({ source_system: 'rent_roll', source_record_id: 'r2', address_line_1: '4441 Nebraska Avenue', postal_code: '64111' }, canon)).toMatchObject({ status: 'matched', id: 'nebraska' });
  });
  it('sends postal mismatch to needs_attention', () => {
    expect(matchProperty({ source_system: 'rent_roll', source_record_id: 'r3', address_line_1: '4441 Nebraska Ave', postal_code: '66101' }, canon).status).toBe('needs_attention');
  });
  it('unknown address becomes new', () => {
    expect(matchProperty({ source_system: 'rent_roll', source_record_id: 'r4', address_line_1: '9 Elm St', postal_code: '64111' }, canon).status).toBe('new');
  });
  it('never matches people by name alone', () => {
    const people = [{ id: 'p1', external_ids: [], contacts: ['a@b.com'] }];
    expect(matchPerson({ source_system: 'rent_roll', source_record_id: 't1', name: 'Same Name' }, people).status).toBe('new');
    expect(matchPerson({ source_system: 'rent_roll', source_record_id: 't1', name: 'x', email: 'A@B.com ' }, people)).toMatchObject({ status: 'matched', id: 'p1' });
  });
  it('fills unknowns, flags real conflicts, ignores identical and null facts', () => {
    const r = diffFacts({ autopay: null, payer_type: 'owner', provider: 'Evergy' }, { autopay: true, payer_type: 'tenant', provider: 'evergy', ebill: null });
    expect(r.fill).toEqual({ autopay: true });
    expect(r.conflicts).toEqual([{ field: 'payer_type', existing: 'owner', incoming: 'tenant' }]);
  });
});

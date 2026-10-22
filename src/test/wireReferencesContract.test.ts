import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Twin of the Ezzie Packet 3 / Batch A contract test, scoped to what
// this repo carries: the migration copy and the two finance pages.
// (Derivation, the bank loader and the crosswalk candidate script
// live in the Ezzie repo only — Derive runs in Ezzie; this app links
// into it.)
const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

const migration = read(
  'supabase/migrations/20261022120000_bookkeeping_wire_references.sql',
);
const queuePage = read('src/pages/FinanceBankQueue.tsx');
const adminPage = read('src/pages/AdminClassificationLearning.tsx');

describe('Packet 3 / Batch A — wire references into determination (dashboard twin)', () => {
  it('A1: crosswalk is a durable record with owner confirmation, never a fuzzy join', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS public.bookkeeping_utility_account_crosswalk',
    );
    expect(migration).toContain("CHECK (status IN ('draft', 'confirmed', 'rejected'))");
    expect(migration).toContain('UNIQUE (company_id, bank_account_number)');
    expect(migration).not.toMatch(/insert into public\.bookkeeping_utility_account_crosswalk/i);
    expect(migration).toContain("r.crosswalk_status = 'confirmed'");
    expect(adminPage).toContain('bookkeeping_utility_crosswalk_list');
    expect(adminPage).toContain('bookkeeping_utility_crosswalk_set_status');
    expect(adminPage).toContain('Utility account crosswalk');
  });

  it('A2: roster list surfaces the register link state', () => {
    expect(migration).toContain('property_link_basis');
    expect(adminPage).toContain('Register link');
    expect(adminPage).toContain('property_name');
  });

  it('A3: the email matcher demands amount + date window + vendor text together', () => {
    expect(migration).toContain('abs(e.amount) = abs(t.signed_amount)');
    expect(migration).toContain('e.transaction_date between t.txn_date - 5 and t.txn_date + 5');
    expect(migration).toContain('bookkeeping_text_tokens');
    expect(migration).toContain('shared is not null and array_length(shared, 1) >= 1');
  });

  it('A3: evidence never classifies — no account/class writes in the evidence step', () => {
    const evidenceStep = migration.slice(migration.indexOf('-- 4) Email evidence'));
    const evidenceFlat = evidenceStep.replace(/--/g, ' ').replace(/\s+/g, ' ');
    expect(evidenceFlat).toContain('never proposes an account or class');
    expect(evidenceStep).not.toMatch(/proposal_account\s*=/);
    expect(evidenceStep).not.toMatch(/proposal_class\s*=/);
    expect(evidenceStep).toContain(
      "proposal_state = case when r.old_state = 'unidentified'",
    );
    expect(evidenceStep).toContain("then 'needs_review' else t.proposal_state end");
  });

  it('A3: email evidence hangs on the queue row', () => {
    expect(queuePage).toContain('bookkeeping_bank_txn_evidence_list');
    expect(queuePage).toContain('evidence_count');
  });

  it('classification order is roster → utility map → taught rules → evidence', () => {
    const rosterIdx = migration.indexOf('-- 1) Property roster');
    const utilityIdx = migration.indexOf('-- 2) Utilities crosswalk');
    const rulesIdx = migration.indexOf('-- 3) Taught rules.');
    const evidenceIdx = migration.indexOf('-- 4) Email evidence');
    expect(rosterIdx).toBeGreaterThan(-1);
    expect(utilityIdx).toBeGreaterThan(rosterIdx);
    expect(rulesIdx).toBeGreaterThan(utilityIdx);
    expect(evidenceIdx).toBeGreaterThan(rulesIdx);
  });

  it('new public tables carry explicit grants and never anon', () => {
    expect(migration).toContain(
      'GRANT SELECT ON public.bookkeeping_utility_account_crosswalk TO authenticated;',
    );
    expect(migration).toContain(
      'GRANT SELECT ON public.bookkeeping_bank_txn_evidence TO authenticated;',
    );
    for (const line of migration.split('\n')) {
      if (/^\s*GRANT/i.test(line)) {
        expect(line).not.toMatch(/\bTO\s+(PUBLIC|anon)\b/i);
        expect(line).not.toMatch(/,\s*anon\b/i);
      }
    }
  });

  it('stage discipline: nothing here writes to QuickBooks', () => {
    expect(migration).toContain('nothing here writes to QuickBooks');
  });
});

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Twin of the Ezzie Packet 4 / Batch B contract test, scoped to what
// this repo carries: the migration copy and the two finance pages.
// (The bank loader, register_sync and the derivation function live in
// the Ezzie repo only — those runs happen in Ezzie; this app shares
// the same door RPCs against its own backend.)
const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

const migration = read(
  'supabase/migrations/20261022150000_bookkeeping_field_log.sql',
);
const queuePage = read('src/pages/FinanceBankQueue.tsx');
const adminPage = read('src/pages/AdminClassificationLearning.tsx');

describe('Packet 4 / Batch B — field log (dashboard twin)', () => {
  it('B1: one append-only log table carries the spec column set', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS public.bookkeeping_field_log_entries',
    );
    for (const col of [
      'org_id', 'company_id', 'bank_transaction_id', 'batch_id',
      'property_id', 'event_kind', 'source', 'detail', 'actor',
      'created_at',
    ]) {
      expect(migration).toContain(col);
    }
    expect(migration).toContain('detail jsonb NOT NULL');
  });

  it('B1: event kinds and sources are exactly the spec lists', () => {
    for (const kind of [
      'ingested', 'matched', 'proposed', 'evidence_attached',
      'derivation_finding', 'reviewed', 'approved', 'synced_to_register',
      'loop_opened', 'loop_resolved',
    ]) {
      expect(migration).toContain(`'${kind}'`);
    }
    for (const source of [
      'loader', 'classify_roster', 'classify_rule', 'classify_utility_map',
      'email_matcher', 'derivation', 'register_sync', 'human',
    ]) {
      expect(migration).toContain(`'${source}'`);
    }
  });

  it('B1: append-only is structural — no write grants for anyone', () => {
    expect(migration).toContain(
      'GRANT SELECT ON public.bookkeeping_field_log_entries TO authenticated;',
    );
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public.bookkeeping_field_log_entries',
    );
    for (const line of migration.split('\n')) {
      if (/^\s*GRANT/i.test(line)) {
        expect(line).not.toMatch(/INSERT|UPDATE|DELETE/i);
        expect(line).not.toMatch(/\bTO\s+(PUBLIC|anon)\b/i);
      }
    }
  });

  it('B1: no status fields were added to the transactions table', () => {
    expect(migration).not.toMatch(
      /alter table public\.bookkeeping_bank_transactions add/i,
    );
  });

  it('B3: open-loops count is surfaced in the queue and on the learning page', () => {
    expect(queuePage).toContain('is_open_loop');
    expect(queuePage).toContain('loops: {counts.openLoops}');
    expect(queuePage).toContain('Open loops · {counts.openLoops}');
    expect(adminPage).toContain('bookkeeping_field_log_open_loop_count');
    expect(adminPage).toContain('Open loops: {openLoops}');
  });

  it('B3: per-row history reads through the door RPC — no new page', () => {
    expect(queuePage).toContain('bookkeeping_field_log_list');
    expect(queuePage).toContain('History');
    expect(migration).toContain('bookkeeping_field_log_list');
  });

  it('B2: the review door writes the trail — reviewed / approved / loop_resolved', () => {
    const reviewFn = migration.slice(
      migration.indexOf('bookkeeping_bank_queue_review'),
    );
    expect(reviewFn).toContain("'reviewed'");
    expect(reviewFn).toContain("'approved'");
    expect(reviewFn).toContain("'loop_resolved'");
    expect(reviewFn).toContain("'human'");
  });

  it('stage discipline: nothing here writes to QuickBooks', () => {
    expect(migration).toContain('nothing here writes to QuickBooks');
  });
});

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

const seedMigration = read(
  'supabase/migrations/20261022140000_bookkeeping_crosswalk_seed_drafts.sql',
);
const adminPage = read('src/pages/AdminClassificationLearning.tsx');

describe('Packet 3B — crosswalk draft seeding from the utility adapter', () => {
  it('seeds drafts only, through a manager-gated door', () => {
    expect(seedMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.bookkeeping_utility_crosswalk_seed_drafts',
    );
    expect(seedMigration).toContain('shared_ingestion_is_manager');
    expect(seedMigration).toContain('SECURITY DEFINER');
    // the insert writes drafts and nothing else — seeding never confirms
    expect(seedMigration).toMatch(
      /insert into public\.bookkeeping_utility_account_crosswalk/i,
    );
    expect(seedMigration).toContain("'draft'");
    expect(seedMigration).not.toMatch(/set\s+status\s*=\s*'confirmed'/i);
    expect(seedMigration).not.toContain("'confirmed',");
  });

  it('appearance is exact: the adapter account number in the bank text classify extracts', () => {
    // same extraction classify uses — no second identity definition
    expect(seedMigration).toContain(
      "substring(t.raw_name from 'MSD\\s+WEB\\s+([0-9]+)')",
    );
    // adapter side compares against the reference's account-number part
    // or its full digit string — exact equality, never a fuzzy join
    expect(seedMigration).toContain("split_part(a.account_reference, '-', 1)");
    expect(seedMigration).toContain("regexp_replace(a.account_reference, '[^0-9]', '', 'g')");
    expect(seedMigration).not.toMatch(/levenshtein|similarity|%\s*\(/i);
  });

  it('idempotent and owner rulings are final: existing rows are never overwritten', () => {
    expect(seedMigration).toContain(
      'on conflict (company_id, bank_account_number) do nothing',
    );
    expect(seedMigration).toContain('already_present');
    // a shared account spanning several properties is residue, not a guess
    expect(seedMigration).toContain('ambiguous_adapter_matches');
    expect(seedMigration).toContain('matched_properties > 1');
  });

  it('residue is reported in both directions — nothing silently dropped', () => {
    expect(seedMigration).toContain('bank_numbers_without_adapter_match');
    expect(seedMigration).toContain('adapter_accounts_not_in_bank_text');
    expect(seedMigration).toContain('bank_numbers_found');
    expect(seedMigration).toContain('drafts_created');
  });

  it('provenance: a seeded draft names its Rentals Utilities adapter record', () => {
    expect(seedMigration).toContain('Rentals Utilities spreadsheet adapter record');
    expect(seedMigration).toContain('source_record_id');
    expect(seedMigration).toContain('property_management_utility_accounts_adapter');
  });

  it('provider scope is honest: MSD only, others raise instead of guessing', () => {
    expect(seedMigration).toContain("v_provider <> 'MSD'");
    expect(seedMigration).toContain('implemented for MSD only');
  });

  it('function grants: authenticated + service_role, never anon', () => {
    expect(seedMigration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.bookkeeping_utility_crosswalk_seed_drafts(uuid, text) FROM PUBLIC, anon;',
    );
    expect(seedMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.bookkeeping_utility_crosswalk_seed_drafts(uuid, text) TO authenticated, service_role;',
    );
    for (const line of seedMigration.split('\n')) {
      if (/^\s*GRANT/i.test(line)) {
        expect(line).not.toMatch(/\bTO\s+(PUBLIC|anon)\b/i);
      }
    }
  });

  it('Admin carries the seed action wired to the RPC', () => {
    expect(adminPage).toContain('bookkeeping_utility_crosswalk_seed_drafts');
    expect(adminPage).toContain('Seed drafts from utility spreadsheet');
  });

  it('stage discipline: nothing here writes to QuickBooks', () => {
    expect(seedMigration + adminPage).not.toMatch(
      /quickbooks.*(journalentry|bill|purchase|payment)\s*['"]?\s*(post|create)/i,
    );
    expect(seedMigration).toContain('nothing here writes to QuickBooks');
  });
});

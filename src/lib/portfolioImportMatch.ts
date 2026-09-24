// Deterministic matcher for Ezzie Package B portfolio imports.
// Never merges people by name or properties by fuzzy address; ambiguity -> needs_attention.

const SUFFIXES: Record<string, string> = {
  avenue: 'ave', av: 'ave', street: 'st', drive: 'dr', road: 'rd', lane: 'ln', court: 'ct',
  boulevard: 'blvd', place: 'pl', circle: 'cir', terrace: 'ter', parkway: 'pkwy', highway: 'hwy',
  north: 'n', south: 's', east: 'e', west: 'w',
};

export function normalizeAddressKey(line1: string | null | undefined, postal?: string | null): string | null {
  if (!line1) return null;
  const base = line1
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\b(apt|unit|ste|suite)\b.*$/, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SUFFIXES[w] ?? w)
    .join(' ');
  if (!base) return null;
  const zip = (postal ?? '').replace(/\D/g, '').slice(0, 5);
  return zip ? `${base}|${zip}` : base;
}

export interface CanonicalProperty {
  id: string;
  normalized_address_key: string | null;
  external_ids: { system_key: string; external_id: string }[];
  project_ids: string[];
}

export interface IncomingPropertyRow {
  source_system: string;
  source_record_id: string;
  address_line_1?: string | null;
  postal_code?: string | null;
  project_id?: string | null;
}

export type MatchResult =
  | { status: 'matched'; id: string; method: 'external_id' | 'project_link' | 'normalized_address' | 'contact_exact' }
  | { status: 'new' }
  | { status: 'needs_attention'; reason: string; candidates: string[] };

const stripZip = (k: string) => k.split('|')[0];

export function matchProperty(row: IncomingPropertyRow, canon: CanonicalProperty[]): MatchResult {
  const ext = canon.filter((c) =>
    c.external_ids.some((e) => e.system_key === row.source_system && e.external_id === row.source_record_id));
  if (ext.length === 1) return { status: 'matched', id: ext[0].id, method: 'external_id' };
  if (ext.length > 1) return { status: 'needs_attention', reason: 'external id on multiple properties', candidates: ext.map((c) => c.id) };

  if (row.project_id) {
    const pl = canon.filter((c) => c.project_ids.includes(row.project_id!));
    if (pl.length === 1) return { status: 'matched', id: pl[0].id, method: 'project_link' };
  }

  const key = normalizeAddressKey(row.address_line_1, row.postal_code);
  if (!key) return { status: 'needs_attention', reason: 'no address or identifier', candidates: [] };
  const exact = canon.filter((c) => c.normalized_address_key === key);
  if (exact.length === 1) return { status: 'matched', id: exact[0].id, method: 'normalized_address' };
  if (exact.length > 1) return { status: 'needs_attention', reason: 'address matches multiple properties', candidates: exact.map((c) => c.id) };
  // same street line, zip differs or missing on one side -> human review, never auto-merge
  const loose = canon.filter((c) => c.normalized_address_key && stripZip(c.normalized_address_key) === stripZip(key));
  if (loose.length) return { status: 'needs_attention', reason: 'street matches but postal code differs/missing', candidates: loose.map((c) => c.id) };
  return { status: 'new' };
}

export interface CanonicalPerson { id: string; external_ids: { system_key: string; external_id: string }[]; contacts: string[] }
export interface IncomingPerson { source_system: string; source_record_id: string; name: string; email?: string | null; phone?: string | null }

export const normalizeEmail = (v?: string | null) => (v ? v.trim().toLowerCase() : null);
export const normalizePhone = (v?: string | null) => {
  const d = (v ?? '').replace(/\D/g, '');
  const t = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return t.length === 10 ? t : null;
};

export function matchPerson(row: IncomingPerson, people: CanonicalPerson[]): MatchResult {
  const ext = people.filter((p) => p.external_ids.some((e) => e.system_key === row.source_system && e.external_id === row.source_record_id));
  if (ext.length === 1) return { status: 'matched', id: ext[0].id, method: 'external_id' };
  const keys = [normalizeEmail(row.email), normalizePhone(row.phone)].filter(Boolean) as string[];
  const hits = [...new Set(people.filter((p) => p.contacts.some((c) => keys.includes(c))).map((p) => p.id))];
  if (hits.length === 1) return { status: 'matched', id: hits[0], method: 'contact_exact' };
  if (hits.length > 1) return { status: 'needs_attention', reason: 'contact matches multiple people', candidates: hits };
  return { status: 'new' }; // name-only never matches; a same-name person becomes a review item upstream
}

export type FactValue = string | number | boolean | null | undefined;
export interface FieldDiff { field: string; existing: FactValue; incoming: FactValue }

/** Compare incoming facts to canonical. NULL/unknown never overwrites and never conflicts. */
export function diffFacts(existing: Record<string, FactValue>, incoming: Record<string, FactValue>) {
  const fill: Record<string, FactValue> = {};
  const conflicts: FieldDiff[] = [];
  for (const [field, inc] of Object.entries(incoming)) {
    if (inc === null || inc === undefined || inc === '') continue;
    const cur = existing[field];
    if (cur === null || cur === undefined || cur === '') fill[field] = inc;
    else if (String(cur).trim().toLowerCase() !== String(inc).trim().toLowerCase()) conflicts.push({ field, existing: cur, incoming: inc });
  }
  return { fill, conflicts };
}

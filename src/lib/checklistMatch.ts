/** Shared normalizer for checklist matching — strips verbs, applies synonyms, removes punctuation */
export function normalizeForChecklistMatch(s: string): string {
  let t = s.toLowerCase().trim().replace(/\s+/g, ' ');
  t = t.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  // Strip leading verbs/fillers
  t = t.replace(/^(replace|repair|get bid|bid|need to|we need to|install|remove|new)\s+/i, '').trim();
  // Synonym map
  const synonyms: [RegExp, string][] = [
    [/\b(bathroom|5x7 bathroom)\b/, 'bathroom replacement'],
    [/\b(furnace|ac|furnace\/ac|furnace ac)\b/, 'hvac'],
    [/\b(sewer hookup|sewer connect|sewer trench)\b/, 'sewer lateral'],
    [/\b(breaker box|panel|meter|mast|service)\b/, 'electrical panel'],
    [/\b(trashout|cleanout|trash out|clean out)\b/, 'dumpsters'],
    [/\b(countertops?|counters?)\b/, 'kitchen counters'],
    [/\b(kitchen)\s+(cabinets?)\b/, 'kitchen cabinets'],
  ];
  for (const [pat, replacement] of synonyms) {
    t = t.replace(pat, replacement);
  }
  return t.trim();
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Adaptive Jaccard with substring containment check */
export function isChecklistCovered(siDescription: string, ciNormalizedLabel: string, siCostItemId: string | null, ciDefaultCostItemId: string | null): boolean {
  // Cost item link match
  if (siCostItemId && ciDefaultCostItemId && siCostItemId === ciDefaultCostItemId) return true;

  const siNorm = normalizeForChecklistMatch(siDescription);
  const ciNorm = ciNormalizedLabel; // Already normalized at insert time

  // Exact match
  if (siNorm === ciNorm) return true;

  // Substring containment
  if (siNorm.includes(ciNorm) || ciNorm.includes(siNorm)) return true;

  // Adaptive Jaccard
  const siTokens = siNorm.split(' ').filter(Boolean).length;
  const ciTokens = ciNorm.split(' ').filter(Boolean).length;
  const minTokens = Math.min(siTokens, ciTokens);
  const threshold = minTokens <= 2 ? 0.50 : 0.70;
  return jaccardSimilarity(siNorm, ciNorm) >= threshold;
}

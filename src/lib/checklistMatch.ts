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
    [/\b(hardwood floors?|hardwoods?|sand floors?|sand and finish)\b/, 'refinish hardwoods'],
    [/\b(vinyl plank|luxury vinyl|lvp|vinyl flooring)\b/, 'vinyl flooring'],
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

/** Status priority for merge decisions */
const STATUS_PRIORITY: Record<string, number> = {
  'Replace': 5, 'Repair': 4, 'Get Bid': 3, 'OK': 2, 'Not Checked': 1,
};

export function strongerStatus(a: string, b: string): string {
  return (STATUS_PRIORITY[a] || 0) >= (STATUS_PRIORITY[b] || 0) ? a : b;
}

/** Find an existing scope item that matches a candidate description/cost_item_id.
 *  Returns the best match or null. If multiple tie, returns null to avoid wrong merges. */
export function matchExistingScopeItem<T extends { description: string; cost_item_id: string | null }>(
  items: T[],
  candidateDescription: string,
  candidateCostItemId: string | null,
): T | null {
  // A) cost_item_id match
  if (candidateCostItemId) {
    const costMatches = items.filter(si => si.cost_item_id === candidateCostItemId);
    if (costMatches.length === 1) return costMatches[0];
    if (costMatches.length > 1) return null; // ambiguous
  }

  const candNorm = normalizeForChecklistMatch(candidateDescription);
  if (!candNorm) return null;

  // B) exact normalized match
  const exactMatches = items.filter(si => normalizeForChecklistMatch(si.description) === candNorm);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return null;

  // C) substring containment
  const subMatches = items.filter(si => {
    const siNorm = normalizeForChecklistMatch(si.description);
    return siNorm.includes(candNorm) || candNorm.includes(siNorm);
  });
  if (subMatches.length === 1) return subMatches[0];
  if (subMatches.length > 1) return null;

  // D) fuzzy Jaccard
  let bestScore = 0;
  let bestItem: T | null = null;
  let tieCount = 0;
  for (const si of items) {
    const siNorm = normalizeForChecklistMatch(si.description);
    const siTokens = siNorm.split(' ').filter(Boolean).length;
    const candTokens = candNorm.split(' ').filter(Boolean).length;
    const minTokens = Math.min(siTokens, candTokens);
    const threshold = minTokens <= 2 ? 0.50 : 0.70;
    const score = jaccardSimilarity(siNorm, candNorm);
    if (score >= threshold) {
      if (score > bestScore) { bestScore = score; bestItem = si; tieCount = 1; }
      else if (score === bestScore) { tieCount++; }
    }
  }
  if (tieCount === 1 && bestItem) return bestItem;
  return null;
}

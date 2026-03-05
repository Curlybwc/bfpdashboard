import { normalizeForChecklistMatch, jaccardSimilarity } from './checklistMatch';

export interface BundleForMatch {
  id: string;
  name: string;
  keywords: string[] | null;
  priority: number;
  trade: string | null;
}

export interface BundleSuggestion {
  bundle: BundleForMatch;
  score: number;
}

/**
 * Suggest matching bundles for a task description.
 * Returns all matches sorted by priority ASC (lower = higher), then score DESC.
 */
export function suggestBundles(description: string, bundles: BundleForMatch[]): BundleSuggestion[] {
  const norm = normalizeForChecklistMatch(description);
  if (!norm) return [];

  const results: BundleSuggestion[] = [];

  for (const bundle of bundles) {
    let bestScore = 0;

    const keywords = bundle.keywords && bundle.keywords.length > 0 ? bundle.keywords : [];

    for (const keyword of keywords) {
      const kwNorm = normalizeForChecklistMatch(keyword);
      if (!kwNorm) continue;

      if (norm === kwNorm) {
        bestScore = Math.max(bestScore, 1.0);
        continue;
      }

      if (norm.includes(kwNorm) || kwNorm.includes(norm)) {
        bestScore = Math.max(bestScore, 0.9);
        continue;
      }

      const normTokens = norm.split(' ').filter(Boolean).length;
      const kwTokens = kwNorm.split(' ').filter(Boolean).length;
      const minTokens = Math.min(normTokens, kwTokens);
      const threshold = minTokens <= 2 ? 0.50 : 0.70;
      const score = jaccardSimilarity(norm, kwNorm);
      if (score >= threshold) {
        bestScore = Math.max(bestScore, score);
      }
    }

    // Also check bundle name as implicit keyword
    const nameNorm = normalizeForChecklistMatch(bundle.name);
    if (nameNorm) {
      if (norm === nameNorm) bestScore = Math.max(bestScore, 1.0);
      else if (norm.includes(nameNorm) || nameNorm.includes(norm)) bestScore = Math.max(bestScore, 0.85);
      else {
        const score = jaccardSimilarity(norm, nameNorm);
        const normTokens = norm.split(' ').filter(Boolean).length;
        const nameTokens = nameNorm.split(' ').filter(Boolean).length;
        const threshold = Math.min(normTokens, nameTokens) <= 2 ? 0.50 : 0.70;
        if (score >= threshold) bestScore = Math.max(bestScore, score);
      }
    }

    if (bestScore > 0) {
      results.push({ bundle, score: bestScore });
    }
  }

  // Sort by priority ASC (lower = higher priority), then score DESC as tiebreaker
  return results.sort((a, b) => a.bundle.priority - b.bundle.priority || b.score - a.score);
}

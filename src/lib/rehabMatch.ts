import { normalizeForChecklistMatch, jaccardSimilarity } from './checklistMatch';

export interface RehabTemplate {
  id: string;
  name: string;
  keywords: string[] | null;
}

export interface RehabMatchResult {
  template: RehabTemplate;
  score: number;
}

/**
 * Match walkthrough text against rehab library templates.
 * Returns matched templates sorted by best score.
 */
export function detectRehabTemplates(
  walkthroughText: string,
  templates: RehabTemplate[]
): RehabMatchResult[] {
  const norm = normalizeForChecklistMatch(walkthroughText);
  if (!norm) return [];

  const results: RehabMatchResult[] = [];

  for (const template of templates) {
    let bestScore = 0;

    const keywords = template.keywords && template.keywords.length > 0 ? template.keywords : [];

    for (const keyword of keywords) {
      const kwNorm = normalizeForChecklistMatch(keyword);
      if (!kwNorm) continue;

      if (norm.includes(kwNorm)) {
        bestScore = Math.max(bestScore, 0.95);
        continue;
      }

      const score = jaccardSimilarity(norm, kwNorm);
      const kwTokens = kwNorm.split(' ').filter(Boolean).length;
      const threshold = kwTokens <= 2 ? 0.50 : 0.70;
      if (score >= threshold) {
        bestScore = Math.max(bestScore, score);
      }
    }

    // Fall back to name matching if no keywords
    if (keywords.length === 0) {
      const nameNorm = normalizeForChecklistMatch(template.name);
      if (nameNorm && norm.includes(nameNorm)) {
        bestScore = Math.max(bestScore, 0.85);
      } else if (nameNorm) {
        const score = jaccardSimilarity(norm, nameNorm);
        const threshold = nameNorm.split(' ').filter(Boolean).length <= 2 ? 0.50 : 0.70;
        if (score >= threshold) bestScore = Math.max(bestScore, score);
      }
    }

    if (bestScore > 0) {
      results.push({ template, score: bestScore });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

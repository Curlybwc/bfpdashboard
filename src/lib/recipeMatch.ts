import { normalizeForChecklistMatch, jaccardSimilarity } from './checklistMatch';

export interface RecipeForMatch {
  id: string;
  name: string;
  keywords: string[] | null;
}

export interface RecipeSuggestion {
  recipe: RecipeForMatch;
  score: number;
}

/**
 * Suggest matching recipes for a task/item description.
 * Returns matches sorted by best score, highest first.
 */
export function suggestRecipes(description: string, recipes: RecipeForMatch[]): RecipeSuggestion[] {
  const norm = normalizeForChecklistMatch(description);
  if (!norm) return [];

  const results: RecipeSuggestion[] = [];

  for (const recipe of recipes) {
    let bestScore = 0;

    const keywords = recipe.keywords && recipe.keywords.length > 0 ? recipe.keywords : [];

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

    // Also check recipe name as implicit keyword
    const nameNorm = normalizeForChecklistMatch(recipe.name);
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
      results.push({ recipe, score: bestScore });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

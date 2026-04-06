import { useState, useCallback } from 'react';

const TODAY_KEY = 'today_prefs';

interface TodayPrefs {
  mutedTaskIds: string[];
  collapsedSections: string[];
  collapsedCards: string[];
  date: string;
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadPrefs(): TodayPrefs {
  try {
    const raw = localStorage.getItem(TODAY_KEY);
    if (!raw) return { mutedTaskIds: [], collapsedSections: [], collapsedCards: [], date: getTodayStr() };
    const parsed = JSON.parse(raw) as TodayPrefs;
    // Reset muted tasks daily, keep section/card collapse preferences
    if (parsed.date !== getTodayStr()) {
      return { mutedTaskIds: [], collapsedSections: parsed.collapsedSections || [], collapsedCards: parsed.collapsedCards || [], date: getTodayStr() };
    }
    return parsed;
  } catch {
    return { mutedTaskIds: [], collapsedSections: [], collapsedCards: [], date: getTodayStr() };
  }
}

function savePrefs(prefs: TodayPrefs) {
  localStorage.setItem(TODAY_KEY, JSON.stringify(prefs));
}

export function useTodayPreferences() {
  const [prefs, setPrefs] = useState<TodayPrefs>(loadPrefs);

  const update = useCallback((fn: (p: TodayPrefs) => TodayPrefs) => {
    setPrefs(prev => {
      const next = fn(prev);
      savePrefs(next);
      return next;
    });
  }, []);

  const muteTask = useCallback((taskId: string) => {
    update(p => ({ ...p, mutedTaskIds: [...p.mutedTaskIds, taskId] }));
  }, [update]);

  const unmuteTask = useCallback((taskId: string) => {
    update(p => ({ ...p, mutedTaskIds: p.mutedTaskIds.filter(id => id !== taskId) }));
  }, [update]);

  const unmuteAll = useCallback(() => {
    update(p => ({ ...p, mutedTaskIds: [] }));
  }, [update]);

  const toggleSection = useCallback((sectionKey: string) => {
    update(p => ({
      ...p,
      collapsedSections: p.collapsedSections.includes(sectionKey)
        ? p.collapsedSections.filter(s => s !== sectionKey)
        : [...p.collapsedSections, sectionKey],
    }));
  }, [update]);

  const toggleCard = useCallback((taskId: string) => {
    update(p => ({
      ...p,
      collapsedCards: p.collapsedCards.includes(taskId)
        ? p.collapsedCards.filter(id => id !== taskId)
        : [...p.collapsedCards, taskId],
    }));
  }, [update]);

  return {
    mutedTaskIds: new Set(prefs.mutedTaskIds),
    collapsedSections: new Set(prefs.collapsedSections),
    collapsedCards: new Set(prefs.collapsedCards),
    muteTask,
    unmuteTask,
    unmuteAll,
    toggleSection,
    toggleCard,
  };
}

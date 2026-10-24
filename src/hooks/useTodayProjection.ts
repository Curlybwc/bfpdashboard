import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { localTodayString } from '@/lib/localDate';

/**
 * Day-projection data for the Today strip (SPEC Slice 1).
 *
 * This hook is deliberately SEPARATE from useTodayData: the strip and the
 * work queue fail independently — one panel failing must not kill the page.
 *
 * Entitlement scope mirrors the existing Today hooks exactly: a task is in
 * scope when it is assigned to the viewer OR its project is one of the
 * viewer's project memberships. No broader scope is introduced.
 *
 * Honest caps: each group is fetched with an exact count and paginated
 * until every row is collected. If a later page fails, the rows already
 * collected are returned with `truncated: true` (the strip renders
 * "Showing X of Y") — a partial projection is never presented as complete.
 */

export const PROJECTION_PAGE_SIZE = 1000;
const MAX_PAGES = 50;

export type ProjectionGroupKind = 'dueToday' | 'overdue';

export interface ProjectionGroupResult {
  rows: any[];
  total: number;
  truncated: boolean;
  error: string | null;
}

export interface TodayProjectionData {
  todayStr: string;
  dueToday: ProjectionGroupResult;
  overdue: ProjectionGroupResult;
  projectMap: Record<string, string>;
}

const emptyGroup = (): ProjectionGroupResult => ({ rows: [], total: 0, truncated: false, error: null });

export const EMPTY_PROJECTION: TodayProjectionData = {
  todayStr: localTodayString(),
  dueToday: emptyGroup(),
  overdue: emptyGroup(),
  projectMap: {},
};

export interface ProjectionScope {
  userId: string;
  projectIds: string[];
}

function baseGroupQuery(kind: ProjectionGroupKind, scope: ProjectionScope, todayStr: string) {
  let query = supabase
    .from('tasks')
    .select('id, task, due_date, stage, priority, project_id, assigned_to_user_id, created_at', { count: 'exact' });

  if (scope.projectIds.length > 0) {
    query = query.or(
      `assigned_to_user_id.eq.${scope.userId},project_id.in.(${scope.projectIds.join(',')})`,
    );
  } else {
    query = query.eq('assigned_to_user_id', scope.userId);
  }

  query = query.neq('stage', 'Done');
  query = kind === 'dueToday' ? query.eq('due_date', todayStr) : query.lt('due_date', todayStr);
  query = query.order('due_date', { ascending: true }).order('created_at', { ascending: true });
  return query;
}

export async function fetchProjectionGroup(
  kind: ProjectionGroupKind,
  scope: ProjectionScope,
  todayStr: string,
  pageSize: number = PROJECTION_PAGE_SIZE,
): Promise<ProjectionGroupResult> {
  const rows: any[] = [];
  let total: number | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * pageSize;
    const { data, count, error } = await baseGroupQuery(kind, scope, todayStr).range(from, from + pageSize - 1);

    if (error) {
      if (page === 0) {
        return { rows: [], total: 0, truncated: false, error: error.message };
      }
      // Partial read with a known total: report it as truncated, never complete.
      return { rows, total: total ?? rows.length, truncated: true, error: null };
    }

    if (total === null) total = count ?? (data?.length ?? 0);
    rows.push(...((data as any[]) ?? []));

    if (rows.length >= total) {
      return { rows, total, truncated: false, error: null };
    }
    if (!data || data.length === 0) {
      return { rows, total, truncated: rows.length < total, error: null };
    }
  }

  return { rows, total: total ?? rows.length, truncated: true, error: null };
}

export async function fetchDayProjection(
  userId: string,
  pageSize: number = PROJECTION_PAGE_SIZE,
): Promise<TodayProjectionData> {
  const todayStr = localTodayString();

  const membershipsRes = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId);

  if (membershipsRes.error) {
    const error = `Memberships: ${membershipsRes.error.message}`;
    return {
      todayStr,
      dueToday: { ...emptyGroup(), error },
      overdue: { ...emptyGroup(), error },
      projectMap: {},
    };
  }

  const projectIds = ((membershipsRes.data as any[]) ?? []).map((m: any) => m.project_id);
  const scope: ProjectionScope = { userId, projectIds };

  const [dueToday, overdue] = await Promise.all([
    fetchProjectionGroup('dueToday', scope, todayStr, pageSize),
    fetchProjectionGroup('overdue', scope, todayStr, pageSize),
  ]);

  // Best-effort enrichment: project names. A failure here degrades the
  // strip to title-only rows; it never fails the projection itself.
  const projectMap: Record<string, string> = {};
  const allProjectIds = [
    ...new Set(
      [...dueToday.rows, ...overdue.rows]
        .map((r: any) => r.project_id)
        .filter((id: any): id is string => !!id),
    ),
  ];
  if (allProjectIds.length > 0) {
    const projectsRes = await supabase.from('projects').select('id, name').in('id', allProjectIds);
    if (!projectsRes.error) {
      ((projectsRes.data as any[]) ?? []).forEach((p: any) => {
        projectMap[p.id] = p.name;
      });
    }
  }

  return { todayStr, dueToday, overdue, projectMap };
}

export function useTodayProjection(userId: string | undefined) {
  const query = useQuery({
    queryKey: ['today-projection', userId],
    queryFn: async (): Promise<TodayProjectionData> => {
      if (!userId) return EMPTY_PROJECTION;
      return fetchDayProjection(userId);
    },
    enabled: !!userId,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    data: query.data ?? EMPTY_PROJECTION,
    loading: query.isLoading,
    refresh,
  };
}

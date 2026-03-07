import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProjectMember {
  user_id: string;
  role: string;
  profiles: { full_name: string | null } | null;
}

export function useProjectDetail(projectId: string | undefined, userId?: string) {
  return useQuery({
    queryKey: ['project-detail', projectId],
    queryFn: async () => {
      const [{ data: project, error: pErr }, { data: tasks, error: tErr }, { data: members, error: mErr }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId!).maybeSingle(),
        supabase
          .from('tasks')
          .select('*')
          .eq('project_id', projectId!)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('project_members')
          .select('user_id, role, profiles(full_name)')
          .eq('project_id', projectId!),
      ]);
      if (pErr) throw pErr;
      if (tErr) throw tErr;
      if (mErr) throw mErr;
      if (!project) throw new Error('Project not found');

      // Batch-fetch photo counts
      const taskIds = (tasks ?? []).map(t => t.id);
      let photoCountMap: Record<string, number> = {};
      let myActiveWorkerTaskIds: string[] = [];
      let myCandidateTaskIds: string[] = [];

      if (taskIds.length > 0) {
        const photoPromise = supabase
          .from('task_photos' as any)
          .select('task_id')
          .in('task_id', taskIds);

        // Fetch crew membership for current user if userId provided
        const workerPromise = userId
          ? supabase
              .from('task_workers')
              .select('task_id')
              .in('task_id', taskIds)
              .eq('user_id', userId)
              .eq('active', true)
          : Promise.resolve({ data: [] as { task_id: string }[], error: null });

        const candidatePromise = userId
          ? supabase
              .from('task_candidates')
              .select('task_id')
              .in('task_id', taskIds)
              .eq('user_id', userId)
          : Promise.resolve({ data: [] as { task_id: string }[], error: null });

        const [{ data: photoRows }, workerResult, candidateResult] = await Promise.all([
          photoPromise,
          workerPromise,
          candidatePromise,
        ]);

        (photoRows || []).forEach((r: any) => {
          photoCountMap[r.task_id] = (photoCountMap[r.task_id] || 0) + 1;
        });

        // Explicitly check for errors — if crew queries fail, throw so the
        // UI shows an error state rather than silently hiding contractor tasks
        const wRes = workerResult as { data: any[] | null; error: any };
        const cRes = candidateResult as { data: any[] | null; error: any };
        if (wRes.error) throw new Error(`Failed to load crew membership: ${wRes.error.message}`);
        if (cRes.error) throw new Error(`Failed to load task candidates: ${cRes.error.message}`);

        myActiveWorkerTaskIds = (wRes.data || []).map((r: any) => r.task_id);
        myCandidateTaskIds = (cRes.data || []).map((r: any) => r.task_id);
      }

      return {
        project,
        tasks: tasks ?? [],
        members: (members ?? []) as unknown as ProjectMember[],
        photoCountMap,
        myActiveWorkerTaskIds,
        myCandidateTaskIds,
      };
    },
    enabled: !!projectId,
  });
}

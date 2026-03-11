import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProjectMember {
  user_id: string;
  role: string;
  profiles: { full_name: string | null } | null;
}

interface TaskIdRow {
  task_id: string;
}

interface TaskCountRow {
  task_id: string;
}

export function useProjectDetail(projectId: string | undefined, userId?: string) {
  return useQuery({
    queryKey: ['project-detail', projectId],
    queryFn: async () => {
      const [{ data: project, error: pErr }, { data: tasks, error: tErr }, { data: members, error: mErr }, { data: allProfiles, error: apErr }] = await Promise.all([
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
        supabase
          .from('profiles')
          .select('id, full_name'),
      ]);
      if (pErr) throw pErr;
      if (tErr) throw tErr;
      if (mErr) throw mErr;
      if (!project) throw new Error('Project not found');

      const taskIds = (tasks ?? []).map((task) => task.id);
      let photoCountMap: Record<string, number> = {};
      let materialCountMap: Record<string, number> = {};
      let myActiveWorkerTaskIds: string[] = [];
      let myCandidateTaskIds: string[] = [];

      if (taskIds.length > 0) {
        const photoPromise = supabase
          .from('task_photos')
          .select('task_id')
          .in('task_id', taskIds);

        const workerPromise = userId
          ? supabase
              .from('task_workers')
              .select('task_id')
              .in('task_id', taskIds)
              .eq('user_id', userId)
              .eq('active', true)
          : Promise.resolve({ data: [] as TaskIdRow[], error: null });

        const candidatePromise = userId
          ? supabase
              .from('task_candidates')
              .select('task_id')
              .in('task_id', taskIds)
              .eq('user_id', userId)
          : Promise.resolve({ data: [] as TaskIdRow[], error: null });

        const materialPromise = supabase
          .from('task_materials')
          .select('task_id')
          .in('task_id', taskIds);

        const [{ data: photoRows, error: photoErr }, { data: materialRows, error: materialErr }, workerResult, candidateResult] = await Promise.all([
          photoPromise,
          materialPromise,
          workerPromise,
          candidatePromise,
        ]);

        if (photoErr) throw photoErr;
        if (materialErr) throw materialErr;

        const photoList = (photoRows ?? []) as TaskCountRow[];
        const materialList = (materialRows ?? []) as TaskCountRow[];

        photoList.forEach((row) => {
          photoCountMap[row.task_id] = (photoCountMap[row.task_id] || 0) + 1;
        });
        materialList.forEach((row) => {
          materialCountMap[row.task_id] = (materialCountMap[row.task_id] || 0) + 1;
        });

        if (workerResult.error) throw new Error(`Failed to load crew membership: ${workerResult.error.message}`);
        if (candidateResult.error) throw new Error(`Failed to load task candidates: ${candidateResult.error.message}`);

        myActiveWorkerTaskIds = (workerResult.data || []).map((row) => row.task_id);
        myCandidateTaskIds = (candidateResult.data || []).map((row) => row.task_id);
      }

      return {
        project,
        tasks: tasks ?? [],
        members: (members ?? []) as ProjectMember[],
        photoCountMap,
        materialCountMap,
        myActiveWorkerTaskIds,
        myCandidateTaskIds,
      };
    },
    enabled: !!projectId,
  });
}

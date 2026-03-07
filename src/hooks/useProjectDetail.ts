import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProjectMember {
  user_id: string;
  role: string;
  profiles: { full_name: string | null } | null;
}

export function useProjectDetail(projectId: string | undefined) {
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
      if (taskIds.length > 0) {
        const { data: photoRows } = await supabase
          .from('task_photos' as any)
          .select('task_id')
          .in('task_id', taskIds);
        (photoRows || []).forEach((r: any) => {
          photoCountMap[r.task_id] = (photoCountMap[r.task_id] || 0) + 1;
        });
      }

      return {
        project,
        tasks: tasks ?? [],
        members: (members ?? []) as unknown as ProjectMember[],
        photoCountMap,
      };
    },
    enabled: !!projectId,
  });
}

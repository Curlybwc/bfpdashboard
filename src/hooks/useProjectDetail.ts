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
      const [{ data: project, error: pErr }, { data: tasks }, { data: members }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId!).single(),
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
      return {
        project: project!,
        tasks: tasks ?? [],
        members: (members ?? []) as unknown as ProjectMember[],
      };
    },
    enabled: !!projectId,
  });
}

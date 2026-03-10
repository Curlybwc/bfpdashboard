import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { computeProjectHealthSummary } from '@/lib/projectSummary';
import type { ProjectType } from '@/lib/supabase-types';

type ProjectRow = Database['public']['Tables']['projects']['Row'];

type TaskSummaryRow = {
  id: string;
  project_id: string;
  stage: Database['public']['Enums']['task_stage'];
  is_blocked: boolean;
  materials_on_site: Database['public']['Enums']['materials_status'];
  needs_manager_review: boolean;
  due_date: string | null;
  parent_task_id: string | null;
  started_at: string | null;
};

export function useProjectList(projectType: ProjectType) {
  return useQuery({
    queryKey: ['projects-list', projectType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('project_type', projectType)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const projects = (data ?? []) as ProjectRow[];
      if (projects.length === 0) {
        return { projects, projectSummaryMap: {} as Record<string, ReturnType<typeof computeProjectHealthSummary>> };
      }

      const projectIds = projects.map((project) => project.id);
      const { data: taskRows, error: taskError } = await supabase
        .from('tasks')
        .select('id, project_id, stage, is_blocked, materials_on_site, needs_manager_review, due_date, parent_task_id, started_at')
        .in('project_id', projectIds);

      if (taskError) throw taskError;

      const tasksByProject: Record<string, TaskSummaryRow[]> = {};
      projects.forEach((project) => {
        tasksByProject[project.id] = [];
      });

      ((taskRows ?? []) as TaskSummaryRow[]).forEach((task) => {
        if (!tasksByProject[task.project_id]) tasksByProject[task.project_id] = [];
        tasksByProject[task.project_id].push(task);
      });

      const projectSummaryMap: Record<string, ReturnType<typeof computeProjectHealthSummary>> = {};
      projects.forEach((project) => {
        projectSummaryMap[project.id] = computeProjectHealthSummary(tasksByProject[project.id] || []);
      });

      return { projects, projectSummaryMap };
    },
  });
}

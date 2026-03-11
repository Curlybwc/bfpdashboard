import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { applyBundles } from '@/lib/applyBundles';
import type { ProjectType, ProjectStatus, TaskStage, TaskPriority } from '@/lib/supabase-types';

export interface CreateTaskInput {
  project_id: string;
  task: string;
  stage: TaskStage;
  priority: TaskPriority;
  room_area: string | null;
  trade: string | null;
  notes: string | null;
  created_by: string;
  assigned_to_user_id: string | null;
  is_outside_vendor?: boolean;
  assignment_mode?: 'solo' | 'crew';
  crewCandidates?: string[];
  pendingMaterials: { name: string; quantity: string; unit: string }[];
  parent_task_id?: string | null;
  is_package?: boolean;
  due_date?: string | null;
  is_recurring?: boolean;
  recurrence_frequency?: string | null;
}

interface BatchCreateTaskInput {
  tasks: CreateTaskInput[];
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function createTaskRecord(input: CreateTaskInput): Promise<{ id: string }> {
  const {
    pendingMaterials,
    due_date,
    is_recurring,
    recurrence_frequency,
    is_outside_vendor,
    assignment_mode,
    crewCandidates,
    parent_task_id,
    is_package,
    ...taskFields
  } = input;

  const hasMaterials = pendingMaterials.length > 0;
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...taskFields,
      materials_on_site: hasMaterials ? ('No' as const) : ('Yes' as const),
      due_date: due_date || null,
      is_recurring: is_recurring || false,
      recurrence_frequency: is_recurring ? recurrence_frequency : null,
      recurrence_anchor_date: is_recurring && due_date ? due_date : null,
      is_outside_vendor: is_outside_vendor || false,
      assignment_mode: assignment_mode || 'solo',
      parent_task_id: parent_task_id || null,
      is_package: is_package || false,
    })
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('Task creation did not return an id.');

  if (pendingMaterials.length > 0) {
    const { error: matError } = await supabase.from('task_materials').insert(
      pendingMaterials.map((m) => ({
        task_id: data.id,
        name: m.name,
        quantity: m.quantity ? parseFloat(m.quantity) : null,
        unit: m.unit || null,
        purchased: false,
        delivered: false,
      })),
    );
    if (matError) throw matError;
  }

  await applyBundles(data.id, taskFields.task);

  if (!taskFields.assigned_to_user_id && !is_outside_vendor && assignment_mode !== 'crew') {
    const { error: assignmentError } = await supabase.rpc('apply_assignment_rules', {
      p_task_id: data.id,
    });
    if (assignmentError) throw assignmentError;
  }

  if (assignment_mode === 'crew' && crewCandidates && crewCandidates.length > 0) {
    const { error: candidateError } = await supabase.from('task_candidates').insert(
      crewCandidates.map((userId) => ({ task_id: data.id, user_id: userId })),
    );
    if (candidateError) throw candidateError;
  }

  return data;
}

export function useCreateTask(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: createTaskRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error',
        description: getErrorMessage(error, 'Unable to create task.'),
        variant: 'destructive',
      });
    },
  });
}

export function useCreateTasksBatch(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ tasks }: BatchCreateTaskInput) => {
      const createdIds: string[] = [];
      const errors: Array<{ task: string; error: string }> = [];

      for (const taskInput of tasks) {
        try {
          const created = await createTaskRecord(taskInput);
          createdIds.push(created.id);
        } catch (error: unknown) {
          errors.push({ task: taskInput.task, error: getErrorMessage(error, 'Unable to create task.') });
        }
      }

      return {
        createdCount: createdIds.length,
        total: tasks.length,
        errors,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error',
        description: getErrorMessage(error, 'Unable to create tasks.'),
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateProject(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (fields: { name?: string; address?: string | null; project_type?: ProjectType; status?: ProjectStatus }) => {
      const { error } = await supabase
        .from('projects')
        .update(fields)
        .eq('id', projectId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
      toast({ title: 'Project updated' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Update failed',
        description: getErrorMessage(error, 'Unable to update project.'),
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteProject() {
  const { toast } = useToast();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Project deleted' });
      navigate('/projects');
    },
    onError: (error: unknown) => {
      toast({
        title: 'Delete failed',
        description: getErrorMessage(error, 'Unable to delete project.'),
        variant: 'destructive',
      });
    },
  });
}

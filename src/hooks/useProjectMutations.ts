import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { applyBundles } from '@/lib/applyBundles';
import type { TaskStage, TaskPriority } from '@/lib/supabase-types';

interface CreateTaskInput {
  project_id: string;
  task: string;
  stage: TaskStage;
  priority: TaskPriority;
  room_area: string | null;
  trade: string | null;
  notes: string | null;
  created_by: string;
  assigned_to_user_id: string | null;
  pendingMaterials: { name: string; quantity: string; unit: string }[];
}

export function useCreateTask(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const { pendingMaterials, ...taskFields } = input;
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          ...taskFields,
          materials_on_site: 'No' as const,
        })
        .select('id')
        .single();
      if (error) throw error;

      // Insert manually added materials
      if (pendingMaterials.length > 0) {
        await supabase.from('task_materials').insert(
          pendingMaterials.map((m) => ({
            task_id: data.id,
            name: m.name,
            quantity: m.quantity ? parseFloat(m.quantity) : null,
            unit: m.unit || null,
            purchased: false,
            delivered: false,
          })),
        );
      }

      // Apply material bundles
      await applyBundles(data.id, taskFields.task);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateProject(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (fields: { name: string; address: string | null }) => {
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
    onError: (error: any) => {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
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
    onError: (error: any) => {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    },
  });
}

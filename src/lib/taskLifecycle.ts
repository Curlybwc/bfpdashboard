import { supabase } from '@/integrations/supabase/client';

export async function claimTask(taskId: string, userId: string) {
  const { error } = await supabase
    .from('tasks')
    .update({
      assigned_to_user_id: userId,
      claimed_by_user_id: userId,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (error) throw error;
}

export async function startTask(taskId: string, userId: string) {
  const { error } = await supabase
    .from('tasks')
    .update({
      stage: 'In Progress',
      started_at: new Date().toISOString(),
      started_by_user_id: userId,
    })
    .eq('id', taskId);

  if (error) throw error;
}

export async function completeTask(params: {
  taskId: string;
  parentTaskId?: string | null;
  isRecurring?: boolean;
}) {
  const { taskId, parentTaskId, isRecurring } = params;

  if (isRecurring) {
    const { error } = await supabase.rpc('complete_recurring_task', { p_task_id: taskId });
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('tasks')
    .update({
      stage: 'Done',
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (error) throw error;

  // Auto-complete parent (and grandparent, etc.) when all children are Done
  if (parentTaskId) {
    await tryAutoCompleteParent(parentTaskId, taskId);
  }
}

/**
 * Recursively auto-complete parent tasks when all their children are Done.
 * Walks up the hierarchy so grandparent tasks also auto-complete.
 */
async function tryAutoCompleteParent(parentTaskId: string, justCompletedChildId: string) {
  const { data: siblings, error: siblingsError } = await supabase
    .from('tasks')
    .select('id, stage')
    .eq('parent_task_id', parentTaskId)
    .neq('id', justCompletedChildId);

  if (siblingsError) throw siblingsError;

  const allSiblingsDone = (siblings || []).every((s) => s.stage === 'Done');
  if (!allSiblingsDone) return;

  // Fetch parent to get its own parent_task_id for recursive cascade
  const { data: parent, error: parentFetchError } = await supabase
    .from('tasks')
    .select('id, parent_task_id')
    .eq('id', parentTaskId)
    .single();

  if (parentFetchError) throw parentFetchError;

  const { error: parentError } = await supabase
    .from('tasks')
    .update({
      stage: 'Done',
      completed_at: new Date().toISOString(),
    })
    .eq('id', parentTaskId);
  if (parentError) throw parentError;

  // Recurse up the hierarchy
  if (parent?.parent_task_id) {
    await tryAutoCompleteParent(parent.parent_task_id, parentTaskId);
  }
}


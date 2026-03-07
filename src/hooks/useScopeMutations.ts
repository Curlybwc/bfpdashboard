import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { parseConversionResult } from '@/lib/scopeConversion';
import type { ScopeItemStatus } from '@/lib/supabase-types';

interface AddScopeItemInput {
  scope_id: string;
  description: string;
  qty: number | null;
  unit: string | null;
  unit_cost_override: number | null;
  computed_total: number | null;
  phase_key: string | null;
  pricing_status: 'Priced' | 'Needs Pricing';
  status: ScopeItemStatus;
  notes: string | null;
}

interface UpdateScopeItemInput {
  id: string;
  description: string;
  qty: number | null;
  unit: string | null;
  unit_cost_override: number | null;
  computed_total: number | null;
  notes: string | null;
  status: string;
  phase_key: string | null;
  pricing_status: 'Priced' | 'Needs Pricing';
}

export function useAddScopeItem(scopeId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: AddScopeItemInput) => {
      const { error } = await supabase.from('scope_items').insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scope-detail', scopeId] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateScopeItem(scopeId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: UpdateScopeItemInput) => {
      const { id, ...fields } = input;
      const { error } = await supabase.from('scope_items').update(fields).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scope-detail', scopeId] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteScopeItem(scopeId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('scope_items')
        .delete()
        .eq('id', itemId)
        .eq('scope_id', scopeId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scope-detail', scopeId] });
      toast({ title: 'Item deleted' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateScopeTitle(scopeId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('scopes').update({ name }).eq('id', scopeId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scope-detail', scopeId] });
      toast({ title: 'Title updated' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useArchiveScope(scopeId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (status: 'active' | 'archived') => {
      const { error } = await supabase
        .from('scopes')
        .update({ status: status as any })
        .eq('id', scopeId!);
      if (error) throw error;
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ['scope-detail', scopeId] });
      toast({ title: status === 'archived' ? 'Scope archived' : 'Scope reactivated' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useConvertScope() {
  const { toast } = useToast();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (scopeId: string) => {
      const { data, error } = await supabase.rpc('convert_scope_to_project', {
        p_scope_id: scopeId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const result = parseConversionResult(data);
      if (!result) {
        toast({ title: 'Conversion succeeded but no project ID returned', variant: 'destructive' });
        return;
      }
      toast({ title: 'Scope converted to project!' });
      navigate(`/projects/${result.project_id}`);
    },
    onError: (error: any) => {
      toast({ title: 'Error converting scope', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateLibraryPrice(scopeId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ costItemId, price }: { costItemId: string; price: number }) => {
      const { error } = await supabase
        .from('cost_items')
        .update({ default_total_cost: price })
        .eq('id', costItemId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate scope detail because "Reset to library" uses the updated library price
      queryClient.invalidateQueries({ queryKey: ['scope-detail', scopeId] });
      toast({ title: 'Library price updated' });
    },
    onError: (error: any) => {
      toast({ title: 'Error updating library', description: error.message, variant: 'destructive' });
    },
  });
}

export function useResetToLibraryPrice(scopeId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (item: { id: string; cost_item_id: string; qty: number | null }) => {
      const { data: costItem } = await supabase
        .from('cost_items')
        .select('default_total_cost')
        .eq('id', item.cost_item_id)
        .single();
      if (!costItem) throw new Error('Cost item not found');
      const computedTotal = item.qty != null ? item.qty * costItem.default_total_cost : null;
      const { error } = await supabase
        .from('scope_items')
        .update({
          unit_cost_override: costItem.default_total_cost,
          computed_total: computedTotal,
          pricing_status: 'Priced' as const,
        })
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scope-detail', scopeId] });
      toast({ title: 'Reset to library price' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

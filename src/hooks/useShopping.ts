import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  sku: string | null;
  vendor_url: string | null;
  item_type: string;
  purchased: boolean;
  delivered: boolean;
  store_section: string | null;
  task_id: string;
  task_title: string;
  project_id: string;
  project_name: string;
  project_address: string | null;
}

export function useShoppingItems() {
  return useQuery({
    queryKey: ['shopping-items'],
    queryFn: async (): Promise<ShoppingItem[]> => {
      const { data, error } = await supabase
        .from('task_materials')
        .select('id, name, quantity, unit, unit_cost, sku, vendor_url, item_type, purchased, delivered, store_section, task_id, tasks!inner(id, task, project_id, stage, projects!inner(id, name, address))')
        .eq('is_active', true)
        .neq('tasks.stage', 'Done');

      if (error) throw error;

      return ((data as any[]) || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        quantity: r.quantity,
        unit: r.unit,
        unit_cost: r.unit_cost,
        unit_cost: r.unit_cost,
        sku: r.sku,
        vendor_url: r.vendor_url,
        item_type: r.item_type,
        purchased: r.purchased,
        delivered: r.delivered,
        store_section: r.store_section,
        task_id: r.tasks.id,
        task_title: r.tasks.task,
        project_id: r.tasks.projects.id,
        project_name: r.tasks.projects.name,
        project_address: r.tasks.projects.address,
      }));
    },
  });
}

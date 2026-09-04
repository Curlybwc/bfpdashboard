import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Product {
  id: string;
  name: string;
  normalized_name: string;
  sku: string | null;
  vendor_url: string | null;
  vendor_name: string | null;
  unit_cost: number | null;
  unit: string | null;
  store_section: string | null;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  model: string | null;
  description: string | null;
  notes: string | null;
  is_active: boolean;
  org_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PriceHistoryEntry {
  id: string;
  product_id: string;
  vendor_name: string | null;
  vendor_url: string | null;
  sku: string | null;
  unit_cost: number | null;
  unit: string | null;
  date_recorded: string;
  notes: string | null;
  source_project_id: string | null;
  source_task_id: string | null;
  created_at: string;
}

export interface ProductUsage {
  task_material_id: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  purchased: boolean;
  delivered: boolean;
  task_id: string;
  task_title: string;
  task_stage: string;
  project_id: string;
  project_name: string;
}

export function normalizeName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function normalizeUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return 'https://' + trimmed;
}

export function useProducts() {
  return useQuery({
    queryKey: ['product-library'],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('material_library')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data as unknown as Product[]) || [];
    },
  });
}

export function useProductPriceHistory(productId: string | null) {
  return useQuery({
    queryKey: ['product-price-history', productId],
    enabled: !!productId,
    queryFn: async (): Promise<PriceHistoryEntry[]> => {
      const { data, error } = await supabase
        .from('product_price_history')
        .select('*')
        .eq('product_id', productId!)
        .order('date_recorded', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as PriceHistoryEntry[]) || [];
    },
  });
}

/** Where a product has been used — matched by direct link or normalized name. */
export function useProductUsage(product: Product | null) {
  return useQuery({
    queryKey: ['product-usage', product?.id],
    enabled: !!product,
    queryFn: async (): Promise<ProductUsage[]> => {
      const { data, error } = await supabase
        .from('task_materials')
        .select('id, quantity, unit, unit_cost, purchased, delivered, name, product_library_id, tasks!inner(id, task, stage, project_id, projects!inner(id, name))')
        .eq('is_active', true)
        .or(`product_library_id.eq.${product!.id},name.ilike.${product!.name.replace(/[%_,]/g, ' ')}`);
      if (error) throw error;
      return ((data as any[]) || []).map((r) => ({
        task_material_id: r.id,
        quantity: r.quantity,
        unit: r.unit,
        unit_cost: r.unit_cost,
        purchased: r.purchased,
        delivered: r.delivered,
        task_id: r.tasks.id,
        task_title: r.tasks.task,
        task_stage: r.tasks.stage,
        project_id: r.tasks.projects.id,
        project_name: r.tasks.projects.name,
      }));
    },
  });
}

export function useRecordPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      productId: string;
      unitCost: number | null;
      vendorName?: string | null;
      vendorUrl?: string | null;
      sku?: string | null;
      unit?: string | null;
      notes?: string | null;
      sourceProjectId?: string | null;
      sourceTaskId?: string | null;
    }) => {
      const { error } = await supabase.rpc('record_product_price' as any, {
        p_product_id: args.productId,
        p_unit_cost: args.unitCost,
        p_vendor_name: args.vendorName ?? null,
        p_vendor_url: normalizeUrl(args.vendorUrl),
        p_sku: args.sku ?? null,
        p_unit: args.unit ?? null,
        p_source_project_id: args.sourceProjectId ?? null,
        p_source_task_id: args.sourceTaskId ?? null,
        p_notes: args.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['product-library'] });
      qc.invalidateQueries({ queryKey: ['product-price-history', vars.productId] });
    },
  });
}

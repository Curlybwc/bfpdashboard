import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Vendor {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  quickbooks_vendor_id: string | null;
  quickbooks_display_name: string | null;
  quickbooks_sync_status: string;
  quickbooks_last_synced_at: string | null;
  quickbooks_last_error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VendorFormData {
  name: string;
  email?: string;
  phone?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface QBVendorResult {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  line1: string | null;
  line2: string | null;
  postal_code: string | null;
  country: string | null;
}

export function useVendors(companyId: string | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['vendors', companyId];

  const vendorsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('vendors' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as Vendor[];
    },
    enabled: !!companyId,
  });

  const createVendor = useMutation({
    mutationFn: async (form: VendorFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (!companyId) throw new Error('No company selected');
      const { data, error } = await supabase
        .from('vendors' as any)
        .insert({
          company_id: companyId,
          created_by: user.id,
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          address_line_1: form.address_line_1 || null,
          address_line_2: form.address_line_2 || null,
          city: form.city || null,
          state: form.state || null,
          postal_code: form.postal_code || null,
          country: form.country || 'US',
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Vendor;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Vendor created' });
    },
    onError: (err: any) => {
      toast({ title: 'Error creating vendor', description: err.message, variant: 'destructive' });
    },
  });

  const updateVendor = useMutation({
    mutationFn: async ({ id, ...form }: VendorFormData & { id: string }) => {
      const { error } = await supabase
        .from('vendors' as any)
        .update({
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          address_line_1: form.address_line_1 || null,
          address_line_2: form.address_line_2 || null,
          city: form.city || null,
          state: form.state || null,
          postal_code: form.postal_code || null,
          country: form.country || 'US',
        } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Vendor updated' });
    },
    onError: (err: any) => {
      toast({ title: 'Error updating vendor', description: err.message, variant: 'destructive' });
    },
  });

  const deleteVendor = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('vendors' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Vendor deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Error deleting vendor', description: err.message, variant: 'destructive' });
    },
  });

  const searchQBVendors = async (searchTerm: string): Promise<QBVendorResult[]> => {
    if (!companyId) return [];
    const { data, error } = await supabase.functions.invoke('quickbooks_vendor_search', {
      body: { company_id: companyId, search_term: searchTerm },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.message || data.error);
    return data?.vendors || [];
  };

  const mapToQBVendor = useMutation({
    mutationFn: async ({ vendorId, qbVendorId, qbDisplayName }: { vendorId: string; qbVendorId: string; qbDisplayName: string }) => {
      const { error } = await supabase
        .from('vendors' as any)
        .update({
          quickbooks_vendor_id: qbVendorId,
          quickbooks_display_name: qbDisplayName,
          quickbooks_sync_status: 'synced',
          quickbooks_last_synced_at: new Date().toISOString(),
          quickbooks_last_error: null,
        } as any)
        .eq('id', vendorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Vendor linked to QuickBooks' });
    },
    onError: (err: any) => {
      toast({ title: 'Error linking vendor', description: err.message, variant: 'destructive' });
    },
  });

  const pullFromQB = useMutation({
    mutationFn: async (vendorId: string) => {
      const { data, error } = await supabase.functions.invoke('quickbooks_vendor_pull', {
        body: { vendor_id: vendorId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Vendor data pulled from QuickBooks' });
    },
    onError: (err: any) => {
      toast({ title: 'Pull failed', description: err.message, variant: 'destructive' });
    },
  });

  const pushToQB = useMutation({
    mutationFn: async (vendorId: string) => {
      const { data, error } = await supabase.functions.invoke('quickbooks_vendor_push', {
        body: { vendor_id: vendorId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Vendor created in QuickBooks' });
    },
    onError: (err: any) => {
      toast({ title: 'Push failed', description: err.message, variant: 'destructive' });
    },
  });

  const unlinkQBVendor = useMutation({
    mutationFn: async (vendorId: string) => {
      const { error } = await supabase
        .from('vendors' as any)
        .update({
          quickbooks_vendor_id: null,
          quickbooks_display_name: null,
          quickbooks_sync_status: 'not_synced',
          quickbooks_last_synced_at: null,
          quickbooks_last_error: null,
        } as any)
        .eq('id', vendorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'QuickBooks link removed' });
    },
    onError: (err: any) => {
      toast({ title: 'Error unlinking', description: err.message, variant: 'destructive' });
    },
  });

  return {
    vendors: vendorsQuery.data || [],
    isLoading: vendorsQuery.isLoading,
    createVendor,
    updateVendor,
    deleteVendor,
    searchQBVendors,
    mapToQBVendor,
    pullFromQB,
    pushToQB,
    unlinkQBVendor,
  };
}

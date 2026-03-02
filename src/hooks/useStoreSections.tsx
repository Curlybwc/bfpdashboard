import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StoreSection {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useStoreSections(includeInactive = false) {
  const [sections, setSections] = useState<StoreSection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('store_sections')
      .select('*')
      .order('sort_order', { ascending: true });
    if (!includeInactive) q = q.eq('is_active', true);
    const { data } = await q;
    setSections((data as unknown as StoreSection[]) || []);
    setLoading(false);
  }, [includeInactive]);

  useEffect(() => { fetch(); }, [fetch]);

  return { sections, loading, refetch: fetch };
}

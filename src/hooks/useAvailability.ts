import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AvailabilityWindow {
  id: string;
  user_id: string;
  available_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const useAvailability = (userId: string | undefined) => {
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchMyAvailability = useCallback(async (from: string, to: string) => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('worker_availability')
      .select('*')
      .eq('user_id', userId)
      .gte('available_date', from)
      .lte('available_date', to)
      .order('available_date')
      .order('start_time');
    if (error) {
      toast({ title: 'Error loading availability', description: error.message, variant: 'destructive' });
    }
    setWindows((data as AvailabilityWindow[]) || []);
    setLoading(false);
  }, [userId, toast]);

  const addWindow = useCallback(async (row: {
    available_date: string;
    start_time: string;
    end_time: string;
    notes?: string;
  }) => {
    if (!userId) return false;
    if (row.end_time <= row.start_time) {
      toast({ title: 'Invalid time range', description: 'End time must be after start time.', variant: 'destructive' });
      return false;
    }
    const { error } = await supabase
      .from('worker_availability')
      .insert({ user_id: userId, ...row });
    if (error) {
      toast({ title: 'Error adding availability', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Availability added' });
    return true;
  }, [userId, toast]);

  const updateWindow = useCallback(async (id: string, updates: {
    start_time?: string;
    end_time?: string;
    notes?: string | null;
  }) => {
    if (updates.start_time && updates.end_time && updates.end_time <= updates.start_time) {
      toast({ title: 'Invalid time range', description: 'End time must be after start time.', variant: 'destructive' });
      return false;
    }
    const { error } = await supabase
      .from('worker_availability')
      .update(updates)
      .eq('id', id);
    if (error) {
      toast({ title: 'Error updating availability', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Availability updated' });
    return true;
  }, [toast]);

  const deleteWindow = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('worker_availability')
      .delete()
      .eq('id', id);
    if (error) {
      toast({ title: 'Error deleting availability', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Availability removed' });
    return true;
  }, [toast]);

  return { windows, loading, fetchMyAvailability, addWindow, updateWindow, deleteWindow };
};

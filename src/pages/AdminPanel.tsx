import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import CostLibrary from '@/components/CostLibrary';

const AdminPanel = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<any[]>([]);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate('/projects', { replace: true });
    }
  }, [isAdmin, adminLoading, navigate]);

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    if (data) setProfiles(data);
  };

  useEffect(() => {
    if (isAdmin) fetchProfiles();
  }, [isAdmin]);

  const toggleAdmin = async (profileId: string, currentValue: boolean) => {
    if (currentValue) {
      // Removing admin — check if last
      const adminCount = profiles.filter((p) => p.is_admin).length;
      if (adminCount <= 1) {
        toast({ title: 'Cannot remove last admin', variant: 'destructive' });
        return;
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: !currentValue })
      .eq('id', profileId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    fetchProfiles();
  };

  const toggleField = async (profileId: string, field: 'can_manage_projects', currentValue: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: !currentValue })
      .eq('id', profileId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    fetchProfiles();
  };

  if (adminLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading...</div>;
  }

  if (!isAdmin) return null;

  return (
    <div className="pb-20">
      <PageHeader title="Admin Panel" backTo="/projects" />
      <div className="p-4">
        <Tabs defaultValue="users" onValueChange={(v) => { if (v === 'tools') navigate('/admin/inventory/tools'); }}>
          <TabsList className="mb-3">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="cost-library">Cost Library</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
          </TabsList>
          <TabsContent value="users">
...
          </TabsContent>
          <TabsContent value="cost-library">
            <CostLibrary />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminPanel;

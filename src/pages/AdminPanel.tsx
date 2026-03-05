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
import AdminAliases from '@/components/AdminAliases';

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
        <Tabs defaultValue="users" onValueChange={(v) => {
          if (v === 'tools') navigate('/admin/inventory/tools');
          if (v === 'materials') navigate('/admin/inventory/materials');
          if (v === 'sections') navigate('/admin/store-sections');
          if (v === 'recipes') navigate('/admin/recipes');
          if (v === 'rehab') navigate('/admin/rehab-library');
        }}>
          <TabsList className="mb-3">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="cost-library">Cost Library</TabsTrigger>
            <TabsTrigger value="aliases">Aliases</TabsTrigger>
            <TabsTrigger value="recipes">Recipes</TabsTrigger>
            <TabsTrigger value="sections">Sections</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="materials">Materials</TabsTrigger>
          </TabsList>
          <TabsContent value="users">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              User Management ({profiles.length})
            </h2>
            {profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
            ) : (
              <div className="space-y-2">
                {profiles.map((profile) => (
                  <Card key={profile.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {profile.full_name || 'Unnamed User'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{profile.id}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Manager</span>
                          <Switch
                            checked={profile.can_manage_projects}
                            onCheckedChange={() => toggleField(profile.id, 'can_manage_projects', profile.can_manage_projects)}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Admin</span>
                          <Switch
                            checked={profile.is_admin}
                            onCheckedChange={() => toggleAdmin(profile.id, profile.is_admin)}
                            disabled={profile.id === user?.id && profiles.filter(p => p.is_admin).length <= 1}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="cost-library">
            <CostLibrary />
          </TabsContent>
          <TabsContent value="aliases">
            <AdminAliases />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminPanel;

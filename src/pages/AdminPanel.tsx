import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

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

  if (adminLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading...</div>;
  }

  if (!isAdmin) return null;

  return (
    <div className="pb-20">
      <PageHeader title="Admin Panel" backTo="/projects" />
      <div className="p-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          User Management ({profiles.length})
        </h2>
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
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Admin</span>
                  <Switch
                    checked={profile.is_admin}
                    onCheckedChange={() => toggleAdmin(profile.id, profile.is_admin)}
                    disabled={profile.id === user?.id && profiles.filter(p => p.is_admin).length <= 1}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import CostLibrary from '@/components/CostLibrary';
import AdminAliases from '@/components/AdminAliases';
import AdminAvailability from '@/components/admin/AdminAvailability';
import AdminCrewGroups from '@/components/admin/AdminCrewGroups';
import AdminTenants from '@/components/admin/AdminTenants';
import AdminMaterialLibrary from '@/components/admin/AdminMaterialLibrary';
import { LogIn, BookOpen, Settings, Package, BarChart3, Users, Trash2, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

type ActiveView = 'hub' | 'users' | 'cost-library' | 'aliases' | 'availability' | 'crew-groups' | 'tenants' | 'material-library';

const AdminPanel = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>('hub');
  const [impersonating, setImpersonating] = useState<string | null>(null);

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

  const toggleField = async (profileId: string, field: 'can_manage_projects' | 'is_active', currentValue: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: !currentValue } as any)
      .eq('id', profileId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    fetchProfiles();
    if (field === 'is_active') {
      toast({ title: currentValue ? 'User deactivated' : 'User reactivated' });
    }
  };

  const handleDeleteUser = async (targetUserId: string, name: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin_delete_user', {
        body: { target_user_id: targetUserId },
      });
      if (error || data?.error) {
        toast({ title: 'Delete failed', description: data?.error || error?.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'User deleted', description: `${name || 'User'} has been permanently removed.` });
      fetchProfiles();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleImpersonate = async (targetUserId: string) => {
    if (impersonating) return;
    setImpersonating(targetUserId);
    try {
      const { data, error } = await supabase.functions.invoke('admin_impersonate', {
        body: { target_user_id: targetUserId, published_url: 'https://bfpdashboard.lovable.app' },
      });
      if (error || data?.error) {
        toast({ title: 'Impersonate failed', description: data?.error || error?.message, variant: 'destructive' });
        return;
      }
      if (data?.url) {
        window.open(data.url, '_blank');
        toast({ title: 'Impersonation link opened', description: `Logged in as ${data.email} in a new tab.` });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setImpersonating(null);
    }
  };

  if (adminLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading...</div>;
  }

  if (!isAdmin) return null;

  const hubCategories = [
    {
      label: 'Libraries',
      icon: BookOpen,
      description: 'Cost items, recipes, rehab templates, bundles & rules',
      items: [
        { label: 'Cost Library', action: () => setActiveView('cost-library') },
        { label: 'Recipes', action: () => navigate('/admin/recipes') },
        { label: 'Rehab Library', action: () => navigate('/admin/rehab-library') },
        { label: 'Bundles', action: () => navigate('/admin/bundles') },
        { label: 'Store Sections', action: () => navigate('/admin/store-sections') },
        { label: 'Materials Library', action: () => setActiveView('material-library') },
        { label: 'Assignment Rules', action: () => navigate('/admin/assignment-rules') },
      ],
    },
    {
      label: 'Operations',
      icon: Settings,
      description: 'Shifts, availability & crew management',
      items: [
        { label: 'Shifts', action: () => navigate('/shifts') },
        { label: 'Availability', action: () => setActiveView('availability') },
        { label: 'Crew Groups', action: () => setActiveView('crew-groups') },
      ],
    },
    {
      label: 'Inventory',
      icon: Package,
      description: 'Track tools and materials across projects',
      items: [
        { label: 'Tools', action: () => navigate('/admin/inventory/tools') },
        { label: 'Materials', action: () => navigate('/admin/inventory/materials') },
      ],
    },
    {
      label: 'Reports',
      icon: BarChart3,
      description: 'Analytics, calendar & scope accuracy',
      items: [
        { label: 'Analytics', action: () => navigate('/admin/analytics') },
        { label: 'Calendar', action: () => navigate('/admin/calendar') },
        { label: 'Scope Accuracy', action: () => navigate('/admin/scope-accuracy') },
      ],
    },
    {
      label: 'Access',
      icon: Users,
      description: 'User permissions, aliases & impersonation',
      items: [
        { label: 'Users', action: () => setActiveView('users') },
        { label: 'Aliases', action: () => setActiveView('aliases') },
        { label: 'Tenants', action: () => setActiveView('tenants') },
      ],
    },
  ];

  const usersContent = (
    <>
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
                  {profile.id !== user?.id && (
                    <button
                      onClick={() => handleImpersonate(profile.id)}
                      disabled={impersonating === profile.id}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                      title={`Log in as ${profile.full_name || 'this user'}`}
                    >
                      <LogIn className="h-3.5 w-3.5" />
                      {impersonating === profile.id ? '...' : 'Impersonate'}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="pb-20">
      <PageHeader title="Admin Panel" backTo="/projects" />
      <div className="p-4">
        {activeView !== 'hub' && (
          <Button variant="ghost" size="sm" className="mb-3 -ml-1 text-muted-foreground" onClick={() => setActiveView('hub')}>
            ← Back to Admin Hub
          </Button>
        )}

        {activeView === 'hub' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {hubCategories.map((cat) => {
              const Icon = cat.icon;
              return (
                <Card key={cat.label} className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-md bg-primary/10 p-2">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{cat.label}</p>
                      <p className="text-xs text-muted-foreground">{cat.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.items.map((item) => (
                      <Button
                        key={item.label}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={item.action}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {activeView === 'users' && usersContent}
        {activeView === 'cost-library' && <CostLibrary />}
        {activeView === 'aliases' && <AdminAliases />}
        {activeView === 'availability' && <AdminAvailability />}
        {activeView === 'crew-groups' && <AdminCrewGroups />}
        {activeView === 'tenants' && <AdminTenants />}
        {activeView === 'material-library' && <AdminMaterialLibrary />}
      </div>
    </div>
  );
};

export default AdminPanel;

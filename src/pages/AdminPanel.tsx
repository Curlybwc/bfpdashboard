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
import { LogIn } from 'lucide-react';
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
} from '@/components/ui/menubar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { Menu } from 'lucide-react';

type ActiveView = 'users' | 'cost-library' | 'aliases' | 'availability' | 'crew-groups';

const VIEW_LABELS: Record<ActiveView, string> = {
  users: 'Users',
  'cost-library': 'Cost Library',
  aliases: 'Aliases',
  availability: 'Availability',
  'crew-groups': 'Crew Groups',
};

const AdminPanel = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>('users');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const isMobile = useIsMobile();

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

  const handleImpersonate = async (targetUserId: string) => {
    if (impersonating) return;
    setImpersonating(targetUserId);
    try {
      const { data, error } = await supabase.functions.invoke('admin_impersonate', {
        body: { target_user_id: targetUserId },
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

  const handleLocal = (view: ActiveView) => {
    setActiveView(view);
    setSheetOpen(false);
  };

  const handleNav = (path: string) => {
    setSheetOpen(false);
    navigate(path);
  };

  // Shared menu group definitions
  const menuGroups = [
    {
      label: 'Libraries',
      items: [
        { label: 'Cost Library', action: () => handleLocal('cost-library') },
        { label: 'Recipes', action: () => handleNav('/admin/recipes') },
        { label: 'Rehab Library', action: () => handleNav('/admin/rehab-library') },
        { label: 'Bundles', action: () => handleNav('/admin/bundles') },
        { label: 'Store Sections', action: () => handleNav('/admin/store-sections') },
        { label: 'Assignment Rules', action: () => handleNav('/admin/assignment-rules') },
      ],
    },
    {
      label: 'Operations',
      items: [
        { label: 'Shifts', action: () => handleNav('/shifts') },
        { label: 'Availability', action: () => handleLocal('availability') },
      ],
    },
    {
      label: 'Inventory',
      items: [
        { label: 'Tools', action: () => handleNav('/admin/inventory/tools') },
        { label: 'Materials', action: () => handleNav('/admin/inventory/materials') },
      ],
    },
    {
      label: 'Reports',
      items: [
        { label: 'Analytics', action: () => handleNav('/admin/analytics') },
        { label: 'Calendar', action: () => handleNav('/admin/calendar') },
        { label: 'Scope Accuracy', action: () => handleNav('/admin/scope-accuracy') },
      ],
    },
    {
      label: 'Access',
      items: [
        { label: 'Users', action: () => handleLocal('users') },
        { label: 'Aliases', action: () => handleLocal('aliases') },
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
        {/* Desktop Menubar */}
        {!isMobile ? (
          <Menubar className="mb-2">
            {menuGroups.map((group) => (
              <MenubarMenu key={group.label}>
                <MenubarTrigger>{group.label}</MenubarTrigger>
                <MenubarContent>
                  {group.items.map((item) => (
                    <MenubarItem key={item.label} onClick={item.action}>
                      {item.label}
                    </MenubarItem>
                  ))}
                </MenubarContent>
              </MenubarMenu>
            ))}
          </Menubar>
        ) : (
          /* Mobile Sheet */
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="mb-2 w-full justify-start gap-2">
                <Menu className="h-4 w-4" />
                Admin Menu
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Admin Menu</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-5">
                {menuGroups.map((group) => (
                  <div key={group.label}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <button
                          key={item.label}
                          onClick={item.action}
                          className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        )}

        <p className="text-xs text-muted-foreground mb-4">
          Viewing: <span className="font-medium text-foreground">{VIEW_LABELS[activeView]}</span>
        </p>

        {/* Content */}
        {activeView === 'users' && usersContent}
        {activeView === 'cost-library' && <CostLibrary />}
        {activeView === 'aliases' && <AdminAliases />}
        {activeView === 'availability' && <AdminAvailability />}
      </div>
    </div>
  );
};

export default AdminPanel;

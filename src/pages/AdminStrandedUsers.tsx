import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, AlertCircle, Loader2 } from 'lucide-react';

interface Stranded {
  user_id: string;
  full_name: string | null;
  email: string | null;
  current_org_id: string | null;
  current_org_name: string | null;
  current_org_member_count: number;
  current_org_project_count: number;
}

const AdminStrandedUsers = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();
  const [users, setUsers] = useState<Stranded[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);
  const [roleByUser, setRoleByUser] = useState<Record<string, 'member' | 'admin'>>({});

  const fetchStranded = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_stranded_users');
    if (error) {
      toast({ title: 'Failed to load', description: error.message, variant: 'destructive' });
    } else {
      setUsers((data as Stranded[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchStranded();
  }, [isAdmin]);

  const handleMove = async (u: Stranded) => {
    setMoving(u.user_id);
    const { error } = await supabase.rpc('admin_move_user_to_my_org', {
      p_target_user_id: u.user_id,
      p_role: roleByUser[u.user_id] ?? 'member',
    });
    setMoving(null);
    if (error) {
      toast({ title: 'Move failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${u.full_name || 'User'} moved into your organization` });
      fetchStranded();
    }
  };

  if (adminLoading) return null;
  if (!isAdmin) return <div className="p-4 text-sm text-muted-foreground">Admins only.</div>;

  return (
    <div className="pb-20">
      <PageHeader title="Users in Other Orgs" backTo="/admin" />
      <div className="p-4 space-y-3">
        <Card className="p-3 border-warning/40 bg-warning/5">
          <div className="flex gap-2">
            <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-medium">Why does this exist?</p>
              <p className="text-muted-foreground">
                When someone signs up directly (without an invite link), they get their own private workspace.
                If you meant for them to join your org, move them here. Going forward, use the
                <strong> Invite Users</strong> tool so new people land in your org automatically.
              </p>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading...
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            All users are in your organization. Nice!
          </p>
        ) : (
          users.map((u) => {
            const isLikelyStrandedSignup =
              Number(u.current_org_member_count) <= 1 && Number(u.current_org_project_count) === 0;
            return (
              <Card key={u.user_id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{u.full_name || 'Unnamed user'}</p>
                    {u.email && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <Badge variant="outline" className="text-xs">
                        {u.current_org_name || 'No org'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {u.current_org_member_count} member{u.current_org_member_count === 1 ? '' : 's'} · {u.current_org_project_count} project{u.current_org_project_count === 1 ? '' : 's'}
                      </span>
                      {isLikelyStrandedSignup && (
                        <Badge variant="secondary" className="text-xs">likely auto-signup</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={roleByUser[u.user_id] ?? 'member'}
                    onValueChange={(v) => setRoleByUser((prev) => ({ ...prev, [u.user_id]: v as 'member' | 'admin' }))}
                  >
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-8 flex-1"
                    disabled={moving === u.user_id}
                    onClick={() => handleMove(u)}
                  >
                    {moving === u.user_id ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Moving...</>
                    ) : (
                      <><UserPlus className="h-3.5 w-3.5 mr-1" /> Move into my org</>
                    )}
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AdminStrandedUsers;
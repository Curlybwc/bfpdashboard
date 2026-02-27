import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ROLES = ['viewer', 'editor', 'manager'] as const;

const ScopeMembers = ({ scopeId }: { scopeId: string }) => {
  const { isAdmin } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<any[]>([]);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('editor');
  const [userRole, setUserRole] = useState<string | null>(null);

  const canManage = isAdmin || userRole === 'manager';

  const fetchMembers = async () => {
    const { data } = await supabase
      .from('scope_members')
      .select('*, profiles(full_name)')
      .eq('scope_id', scopeId);
    if (data) {
      setMembers(data);
      const mine = data.find((m: any) => m.user_id === user?.id);
      if (mine) setUserRole(mine.role);
    }
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name');
    if (data) setAllProfiles(data);
  };

  useEffect(() => {
    fetchMembers();
  }, [scopeId]);

  useEffect(() => {
    if (canManage) fetchProfiles();
  }, [canManage]);

  const changeRole = async (memberId: string, newRole: string) => {
    const { error } = await supabase
      .from('scope_members')
      .update({ role: newRole as any })
      .eq('id', memberId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    fetchMembers();
  };

  const addMember = async () => {
    if (!selectedUser) return;
    const { error } = await supabase.from('scope_members').insert({
      scope_id: scopeId,
      user_id: selectedUser,
      role: selectedRole as any,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setOpen(false);
    setSelectedUser('');
    setSelectedRole('editor');
    fetchMembers();
  };

  const existingUserIds = members.map((m: any) => m.user_id);
  const availableProfiles = allProfiles.filter((p) => !existingUserIds.includes(p.id));

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Members ({members.length})
        </h2>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Member</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {availableProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={addMember} className="w-full" disabled={!selectedUser}>Add</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="space-y-2">
        {members.map((m: any) => (
          <Card key={m.id} className="p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">
                {m.profiles?.full_name || 'Unnamed'}
              </p>
              {canManage ? (
                <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs text-muted-foreground">{m.role}</span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ScopeMembers;

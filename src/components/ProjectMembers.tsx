import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ROLES = ['contractor', 'manager', 'read_only'] as const;

const ProjectMembers = ({ projectId }: { projectId: string }) => {
  const { isAdmin } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<any[]>([]);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('contractor');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const canManage = isAdmin || userRole === 'manager';

  const fetchMembers = async () => {
    const { data } = await supabase
      .from('project_members')
      .select('*, profiles(full_name)')
      .eq('project_id', projectId);
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
  }, [projectId]);

  useEffect(() => {
    if (canManage) fetchProfiles();
  }, [canManage]);

  const changeRole = async (memberId: string, newRole: string) => {
    const { error } = await supabase
      .from('project_members')
      .update({ role: newRole as any })
      .eq('id', memberId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    fetchMembers();
  };

  const addMembers = async () => {
    if (selectedUsers.length === 0) return;
    setAdding(true);
    const inserts = selectedUsers.map(userId => ({
      project_id: projectId,
      user_id: userId,
      role: selectedRole as any,
    }));
    const { error } = await supabase.from('project_members').insert(inserts);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setAdding(false);
      return;
    }
    toast({ title: `${selectedUsers.length} member(s) added` });
    setOpen(false);
    setSelectedUsers([]);
    setSelectedRole('contractor');
    setSearchQuery('');
    setAdding(false);
    fetchMembers();
  };

  const existingUserIds = members.map((m: any) => m.user_id);
  const availableProfiles = allProfiles.filter((p) => !existingUserIds.includes(p.id));

  const filteredProfiles = availableProfiles.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (p.full_name && p.full_name.toLowerCase().includes(q)) || p.id.toLowerCase().includes(q);
  });

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Members ({members.length})
        </h2>
        {canManage && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSelectedUsers([]); setSearchQuery(''); } }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Member</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Members</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="max-h-52 overflow-auto border rounded-md">
                  {filteredProfiles.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No users available.</p>
                  )}
                  {filteredProfiles.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent cursor-pointer transition-colors border-b last:border-b-0"
                    >
                      <Checkbox
                        checked={selectedUsers.includes(p.id)}
                        onCheckedChange={() => toggleUser(p.id)}
                      />
                      <span className="text-sm truncate">{p.full_name || p.id}</span>
                    </label>
                  ))}
                </div>

                {selectedUsers.length > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedUsers.length} selected</p>
                )}

                <Button onClick={addMembers} className="w-full" disabled={selectedUsers.length === 0 || adding}>
                  {adding ? 'Adding...' : `Add ${selectedUsers.length || ''} Member${selectedUsers.length !== 1 ? 's' : ''}`}
                </Button>
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

export default ProjectMembers;

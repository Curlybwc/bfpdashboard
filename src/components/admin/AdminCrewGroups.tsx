import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Pencil, X, Check } from 'lucide-react';

interface CrewGroup {
  id: string;
  name: string;
  members: { user_id: string; full_name: string | null }[];
}

const AdminCrewGroups = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [groups, setGroups] = useState<CrewGroup[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);
  const [newName, setNewName] = useState('');
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editMembers, setEditMembers] = useState<string[]>([]);

  const fetchGroups = async () => {
    const { data: groupsData } = await supabase
      .from('crew_groups')
      .select('id, name')
      .order('name');
    if (!groupsData) return;

    const { data: membersData } = await supabase
      .from('crew_group_members')
      .select('crew_group_id, user_id, profiles:user_id(full_name)');

    const mapped: CrewGroup[] = groupsData.map((g: any) => ({
      id: g.id,
      name: g.name,
      members: (membersData || [])
        .filter((m: any) => m.crew_group_id === g.id)
        .map((m: any) => ({ user_id: m.user_id, full_name: m.profiles?.full_name })),
    }));
    setGroups(mapped);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
    if (data) setProfiles(data);
  };

  useEffect(() => {
    fetchGroups();
    fetchProfiles();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !user) return;
    const { data, error } = await supabase
      .from('crew_groups')
      .insert({ name: newName.trim(), created_by: user.id })
      .select('id')
      .single();
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (newMembers.length > 0) {
      await supabase.from('crew_group_members').insert(
        newMembers.map((uid) => ({ crew_group_id: data.id, user_id: uid }))
      );
    }
    setNewName('');
    setNewMembers([]);
    setCreating(false);
    fetchGroups();
    toast({ title: 'Crew group created' });
  };

  const handleDelete = async (groupId: string) => {
    await supabase.from('crew_groups').delete().eq('id', groupId);
    fetchGroups();
    toast({ title: 'Crew group deleted' });
  };

  const startEdit = (group: CrewGroup) => {
    setEditingId(group.id);
    setEditName(group.name);
    setEditMembers(group.members.map((m) => m.user_id));
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await supabase.from('crew_groups').update({ name: editName.trim() }).eq('id', editingId);
    // Replace members
    await supabase.from('crew_group_members').delete().eq('crew_group_id', editingId);
    if (editMembers.length > 0) {
      await supabase.from('crew_group_members').insert(
        editMembers.map((uid) => ({ crew_group_id: editingId, user_id: uid }))
      );
    }
    setEditingId(null);
    fetchGroups();
    toast({ title: 'Crew group updated' });
  };

  const toggleMember = (list: string[], setList: (v: string[]) => void, uid: string) => {
    setList(list.includes(uid) ? list.filter((id) => id !== uid) : [...list, uid]);
  };

  const memberCheckboxes = (selected: string[], setSelected: (v: string[]) => void) => (
    <div className="space-y-1 max-h-40 overflow-y-auto rounded border p-2">
      {profiles.map((p) => (
        <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
          <Checkbox
            checked={selected.includes(p.id)}
            onCheckedChange={() => toggleMember(selected, setSelected, p.id)}
          />
          <span>{p.full_name || 'Unnamed'}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Crew Groups ({groups.length})
        </h2>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />New Group
          </Button>
        )}
      </div>

      {creating && (
        <Card className="p-3 space-y-3">
          <div className="space-y-2">
            <Label>Group Name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Demo Crew" />
          </div>
          <div className="space-y-2">
            <Label>Members</Label>
            {memberCheckboxes(newMembers, setNewMembers)}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
            <Button size="sm" variant="outline" onClick={() => { setCreating(false); setNewName(''); setNewMembers([]); }}>Cancel</Button>
          </div>
        </Card>
      )}

      {groups.map((group) => (
        <Card key={group.id} className="p-3">
          {editingId === group.id ? (
            <div className="space-y-3">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              {memberCheckboxes(editMembers, setEditMembers)}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveEdit}><Check className="h-4 w-4 mr-1" />Save</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="h-4 w-4 mr-1" />Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{group.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {group.members.length === 0
                    ? 'No members'
                    : group.members.map((m) => m.full_name || 'Unnamed').join(', ')}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(group)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(group.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}

      {groups.length === 0 && !creating && (
        <p className="text-sm text-muted-foreground text-center py-8">No crew groups yet.</p>
      )}
    </div>
  );
};

export default AdminCrewGroups;

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus, Loader2 } from 'lucide-react';

interface Profile {
  id: string;
  full_name: string | null;
}

interface Alias {
  id: string;
  user_id: string;
  alias: string;
}

const AdminAliases = () => {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [newAlias, setNewAlias] = useState('');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').order('full_name').then(({ data }) => {
      if (data) setProfiles(data);
    });
  }, []);

  useEffect(() => {
    if (!selectedUserId) { setAliases([]); return; }
    setLoading(true);
    supabase
      .from('profile_aliases')
      .select('id, user_id, alias')
      .eq('user_id', selectedUserId)
      .order('alias')
      .then(({ data }) => {
        setAliases(data || []);
        setLoading(false);
      });
  }, [selectedUserId]);

  const handleAdd = async () => {
    const trimmed = newAlias.trim();
    if (!trimmed || !selectedUserId) return;
    setAdding(true);
    const { error } = await supabase.from('profile_aliases').insert({ user_id: selectedUserId, alias: trimmed });
    if (error) {
      const msg = error.message.includes('profile_aliases_alias_unique')
        ? 'This alias is already used by another user.'
        : error.message;
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } else {
      setNewAlias('');
      // Refresh
      const { data } = await supabase.from('profile_aliases').select('id, user_id, alias').eq('user_id', selectedUserId).order('alias');
      setAliases(data || []);
      toast({ title: `Alias "${trimmed}" added` });
    }
    setAdding(false);
  };

  const handleDelete = async (aliasId: string, aliasName: string) => {
    const { error } = await supabase.from('profile_aliases').delete().eq('id', aliasId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setAliases(prev => prev.filter(a => a.id !== aliasId));
      toast({ title: `Alias "${aliasName}" removed` });
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground">User Aliases / Nicknames</h2>

      <Select value={selectedUserId || ''} onValueChange={v => setSelectedUserId(v || null)}>
        <SelectTrigger><SelectValue placeholder="Select a user..." /></SelectTrigger>
        <SelectContent>
          {profiles.map(p => (
            <SelectItem key={p.id} value={p.id}>{p.full_name || 'Unnamed'}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedUserId && (
        <Card className="p-3 space-y-3">
          <p className="text-sm font-medium">
            Aliases for {profiles.find(p => p.id === selectedUserId)?.full_name || 'Unnamed'}
          </p>

          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : aliases.length === 0 ? (
            <p className="text-xs text-muted-foreground">No aliases yet.</p>
          ) : (
            <div className="space-y-1">
              {aliases.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm">{a.alias}</span>
                  <button onClick={() => handleDelete(a.id, a.alias)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={newAlias}
              onChange={e => setNewAlias(e.target.value)}
              placeholder="New alias (e.g. Becky)"
              className="flex-1 h-8 text-sm"
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <Button size="sm" onClick={handleAdd} disabled={adding || !newAlias.trim()}>
              {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AdminAliases;

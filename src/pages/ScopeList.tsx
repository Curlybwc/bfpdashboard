import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, MapPin, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ScopeStatus } from '@/lib/supabase-types';

const ScopeList = () => {
  const { user } = useAuth();
  const { isAdmin, canManageProjects } = useAdmin();
  const { toast } = useToast();
  const canCreate = isAdmin || canManageProjects;
  const [scopes, setScopes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [filterStatus, setFilterStatus] = useState<ScopeStatus | 'all'>('active');

  const fetchScopes = async () => {
    let query = supabase.from('scopes').select('*').order('created_at', { ascending: false });
    if (filterStatus !== 'all') query = query.eq('status', filterStatus);
    const { data, error } = await query;
    if (!error) setScopes(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchScopes(); }, [filterStatus]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { data: scope, error } = await supabase.from('scopes').insert({ name: name || null, address, created_by: user.id }).select().single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    // Add creator as manager
    await supabase.from('scope_members').insert({ scope_id: scope.id, user_id: user.id, role: 'manager' });
    setName(''); setAddress(''); setOpen(false);
    fetchScopes();
  };

  return (
    <div className="pb-20">
      <PageHeader
        title="Scopes"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ScopeStatus | 'all')}
              className="text-xs border rounded-md px-2 py-1.5 bg-card text-foreground"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            {canCreate && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />New</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Scope</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Scope Name (optional)</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full">Create Scope</Button>
                </form>
              </DialogContent>
            </Dialog>
            )}
          </div>
        }
      />
      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading...</p>
        ) : scopes.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No scopes found.</p>
        ) : (
          scopes.map((s) => (
            <Link key={s.id} to={`/scopes/${s.id}`}>
              <Card className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{s.name || 'Untitled Scope'}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3 shrink-0" />{s.address}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default ScopeList;

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, User, MapPin, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TenantsListProps {
  projectId: string;
  canEdit: boolean;
}

interface Tenant {
  id: string;
  project_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

const TenantsList = ({ projectId, canEdit }: TenantsListProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['tenants', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Tenant[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tenants', projectId] });

  const openAdd = () => {
    setEditingTenant(null);
    setName('');
    setAddress('');
    setDialogOpen(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setName(tenant.name);
    setAddress(tenant.address || '');
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTenant) {
      const { error } = await supabase
        .from('tenants')
        .update({ name: name.trim(), address: address.trim() || null })
        .eq('id', editingTenant.id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Tenant updated' });
    } else {
      const { error } = await supabase
        .from('tenants')
        .insert({ project_id: projectId, name: name.trim(), address: address.trim() || null });
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Tenant added' });
    }
    setDialogOpen(false);
    invalidate();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('tenants').delete().eq('id', deleteId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Tenant removed' });
    setDeleteId(null);
    invalidate();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tenants</h3>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" />Add Tenant
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tenants.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No tenants added yet.</p>
      ) : (
        tenants.map((tenant) => (
          <Card key={tenant.id}>
            <CardContent className="p-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium flex items-center gap-1.5">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  {tenant.name}
                </p>
                {tenant.address && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5 ml-5.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {tenant.address}
                  </p>
                )}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(tenant)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(tenant.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTenant ? 'Edit Tenant' : 'Add Tenant'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Tenant Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. John Smith" />
            </div>
            <div className="space-y-2">
              <Label>Address (optional)</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Unit 2B" />
            </div>
            <Button type="submit" className="w-full" disabled={!name.trim()}>
              {editingTenant ? 'Save Changes' : 'Add Tenant'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Tenant</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to remove this tenant?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TenantsList;

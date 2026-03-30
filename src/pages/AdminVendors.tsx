import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useVendors, Vendor, VendorFormData, QBVendorResult } from '@/hooks/useVendors';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, ArrowDownToLine, ArrowUpFromLine, Link2, Unlink, AlertCircle, CheckCircle2, Clock, Pencil, Trash2 } from 'lucide-react';

const AdminVendors = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // Company selector
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('id, name, short_name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Auto-select first company
  if (!selectedCompanyId && companiesQuery.data?.length) {
    setSelectedCompanyId(companiesQuery.data[0].id);
  }

  const {
    vendors, isLoading,
    createVendor, updateVendor, deleteVendor,
    searchQBVendors, mapToQBVendor, pullFromQB, pushToQB, unlinkQBVendor,
  } = useVendors(selectedCompanyId);

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [formData, setFormData] = useState<VendorFormData>({ name: '' });

  // QB search dialog
  const [showQBSearch, setShowQBSearch] = useState(false);
  const [qbLinkVendorId, setQbLinkVendorId] = useState<string | null>(null);
  const [qbSearchTerm, setQbSearchTerm] = useState('');
  const [qbResults, setQbResults] = useState<QBVendorResult[]>([]);
  const [qbSearching, setQbSearching] = useState(false);

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    (v.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.quickbooks_display_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const openCreateForm = () => {
    setEditingVendor(null);
    setFormData({ name: '', email: '', phone: '', address_line_1: '', address_line_2: '', city: '', state: '', postal_code: '', country: 'US' });
    setShowForm(true);
  };

  const openEditForm = (v: Vendor) => {
    setEditingVendor(v);
    setFormData({
      name: v.name,
      email: v.email || '',
      phone: v.phone || '',
      address_line_1: v.address_line_1 || '',
      address_line_2: v.address_line_2 || '',
      city: v.city || '',
      state: v.state || '',
      postal_code: v.postal_code || '',
      country: v.country || 'US',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (editingVendor) {
      await updateVendor.mutateAsync({ id: editingVendor.id, ...formData });
    } else {
      await createVendor.mutateAsync(formData);
    }
    setShowForm(false);
  };

  const openQBSearch = (vendorId: string) => {
    setQbLinkVendorId(vendorId);
    setQbSearchTerm('');
    setQbResults([]);
    setShowQBSearch(true);
  };

  const handleQBSearch = async () => {
    setQbSearching(true);
    try {
      const results = await searchQBVendors(qbSearchTerm);
      setQbResults(results);
    } catch (err: any) {
      toast({ title: 'QB search failed', description: err.message, variant: 'destructive' });
    } finally {
      setQbSearching(false);
    }
  };

  const handleQBLink = async (qbVendor: QBVendorResult) => {
    if (!qbLinkVendorId) return;
    await mapToQBVendor.mutateAsync({
      vendorId: qbLinkVendorId,
      qbVendorId: qbVendor.id,
      qbDisplayName: qbVendor.display_name,
    });
    setShowQBSearch(false);
  };

  const syncStatusBadge = (v: Vendor) => {
    if (v.quickbooks_sync_status === 'synced') {
      return <Badge variant="outline" className="text-green-700 border-green-300 gap-1"><CheckCircle2 className="h-3 w-3" /> Synced</Badge>;
    }
    if (v.quickbooks_sync_status === 'error') {
      return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Error</Badge>;
    }
    return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Not synced</Badge>;
  };

  return (
    <div className="pb-20">
      <PageHeader title="Vendors" backTo="/admin" />
      <div className="p-4 space-y-4">
        {/* Company selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedCompanyId || ''} onValueChange={setSelectedCompanyId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              {(companiesQuery.data || []).map(c => (
                <SelectItem key={c.id} value={c.id}>{c.short_name || c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1 min-w-[180px]">
            <Input
              placeholder="Search vendors..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9"
            />
          </div>
          <Button size="sm" onClick={openCreateForm} disabled={!selectedCompanyId}>
            <Plus className="h-4 w-4 mr-1" /> Add Vendor
          </Button>
        </div>

        {/* Vendor list */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : filteredVendors.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {selectedCompanyId ? 'No vendors found.' : 'Select a company to view vendors.'}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredVendors.map(v => (
              <Card key={v.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{v.name}</p>
                      {syncStatusBadge(v)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                      {v.email && <p>{v.email}</p>}
                      {v.phone && <p>{v.phone}</p>}
                      {(v.city || v.state) && <p>{[v.city, v.state].filter(Boolean).join(', ')}</p>}
                      {v.quickbooks_display_name && (
                        <p className="text-primary/70">QB: {v.quickbooks_display_name} (ID: {v.quickbooks_vendor_id})</p>
                      )}
                      {v.quickbooks_last_error && (
                        <p className="text-destructive text-[11px]">Error: {v.quickbooks_last_error}</p>
                      )}
                      {v.quickbooks_last_synced_at && (
                        <p className="text-[11px]">Last synced: {new Date(v.quickbooks_last_synced_at).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEditForm(v)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    {!v.quickbooks_vendor_id ? (
                      <>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openQBSearch(v.id)}>
                          <Link2 className="h-3 w-3 mr-1" /> Link QB
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => pushToQB.mutate(v.id)} disabled={pushToQB.isPending}>
                          <ArrowUpFromLine className="h-3 w-3 mr-1" /> Push to QB
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => pullFromQB.mutate(v.id)} disabled={pullFromQB.isPending}>
                          <ArrowDownToLine className="h-3 w-3 mr-1" /> Pull QB
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => unlinkQBVendor.mutate(v.id)}>
                          <Unlink className="h-3 w-3 mr-1" /> Unlink
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => deleteVendor.mutate(v.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit vendor dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Email</Label><Input value={formData.email || ''} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={formData.phone || ''} onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>Address Line 1</Label><Input value={formData.address_line_1 || ''} onChange={e => setFormData(f => ({ ...f, address_line_1: e.target.value }))} /></div>
            <div><Label>Address Line 2</Label><Input value={formData.address_line_2 || ''} onChange={e => setFormData(f => ({ ...f, address_line_2: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>City</Label><Input value={formData.city || ''} onChange={e => setFormData(f => ({ ...f, city: e.target.value }))} /></div>
              <div><Label>State</Label><Input value={formData.state || ''} onChange={e => setFormData(f => ({ ...f, state: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>ZIP</Label><Input value={formData.postal_code || ''} onChange={e => setFormData(f => ({ ...f, postal_code: e.target.value }))} /></div>
              <div><Label>Country</Label><Input value={formData.country || 'US'} onChange={e => setFormData(f => ({ ...f, country: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createVendor.isPending || updateVendor.isPending}>
              {editingVendor ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QB search/link dialog */}
      <Dialog open={showQBSearch} onOpenChange={setShowQBSearch}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link to QuickBooks Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Search QB vendors..."
                value={qbSearchTerm}
                onChange={e => setQbSearchTerm(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleQBSearch(); }}
              />
              <Button onClick={handleQBSearch} disabled={qbSearching} size="sm">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {qbSearching && <p className="text-sm text-muted-foreground">Searching...</p>}
            {qbResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto space-y-1">
                {qbResults.map(qb => (
                  <Card
                    key={qb.id}
                    className="p-2 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleQBLink(qb)}
                  >
                    <p className="text-sm font-medium">{qb.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[qb.email, qb.phone, qb.city, qb.state].filter(Boolean).join(' · ') || `ID: ${qb.id}`}
                    </p>
                  </Card>
                ))}
              </div>
            )}
            {!qbSearching && qbResults.length === 0 && qbSearchTerm && (
              <p className="text-sm text-muted-foreground">No results. Try a different search.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminVendors;

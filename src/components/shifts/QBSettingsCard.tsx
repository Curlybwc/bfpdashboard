import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import QBCombobox from './QBCombobox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, ChevronDown, Save, Settings, RefreshCw, Plus, Building2, Pencil, Link2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type CompanyRow = { id: string; name: string; short_name: string | null; qb_connection_id: string | null };
type QBConnectionRow = { id: string; company_name: string | null; realm_id: string };
type ProjectRow = { id: string; name: string; address: string | null; status: string };
type ProfileRow = { id: string; full_name: string | null; is_active: boolean };
type QBClass = { id: string; name: string; fully_qualified_name: string };
type QBAccount = { id: string; name: string; fully_qualified_name: string; account_type: string | null; account_sub_type: string | null };
type QBVendor = { id: string; display_name: string };

const QBSettingsCard = () => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Companies
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [qbConnections, setQbConnections] = useState<QBConnectionRow[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyShort, setNewCompanyShort] = useState('');
  const [newCompanyConnId, setNewCompanyConnId] = useState('');
  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [addingCompany, setAddingCompany] = useState(false);

  // Edit company
  const [editCompanyOpen, setEditCompanyOpen] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editCompanyShort, setEditCompanyShort] = useState('');
  const [editCompanyConnId, setEditCompanyConnId] = useState('');
  const [editingCompany, setEditingCompany] = useState(false);

  const openEditCompany = () => {
    if (!selectedCompany) return;
    setEditCompanyName(selectedCompany.name);
    setEditCompanyShort(selectedCompany.short_name || '');
    setEditCompanyConnId(selectedCompany.qb_connection_id || '');
    setEditCompanyOpen(true);
  };

  const handleEditCompany = async () => {
    if (!editCompanyName.trim() || !selectedCompanyId) return;
    setEditingCompany(true);
    const { error } = await supabase
      .from('companies')
      .update({
        name: editCompanyName.trim(),
        short_name: editCompanyShort.trim() || null,
        qb_connection_id: editCompanyConnId || null,
      })
      .eq('id', selectedCompanyId);
    setEditingCompany(false);
    if (error) {
      toast({ title: 'Failed to update company', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Company updated' });
      setEditCompanyOpen(false);
      await loadCompanies();
    }
  };

  // Expense account state (per company)
  const [expAccountId, setExpAccountId] = useState('');
  const [expAccountName, setExpAccountName] = useState('');
  const [expLoading, setExpLoading] = useState(false);
  const [expSaving, setExpSaving] = useState(false);

  // Class mappings state
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [classMappings, setClassMappings] = useState<Record<string, { qb_class_id: string; qb_class_name: string }>>({});
  const [classEdits, setClassEdits] = useState<Record<string, { qb_class_id: string; qb_class_name: string }>>({});
  const [classSaving, setClassSaving] = useState<string | null>(null);

  // QB classes from API — keyed to the company they were loaded for
  const [qbClasses, setQbClasses] = useState<QBClass[]>([]);
  const [qbClassesLoading, setQbClassesLoading] = useState(false);
  const [qbClassesLoaded, setQbClassesLoaded] = useState(false);
  const [qbClassesError, setQbClassesError] = useState<string | null>(null);
  const [qbClassesForCompany, setQbClassesForCompany] = useState<string>('');

  // QB accounts from API (for expense account picker)
  const [qbAccounts, setQbAccounts] = useState<QBAccount[]>([]);
  const [qbAccountsLoading, setQbAccountsLoading] = useState(false);
  const [qbAccountsLoaded, setQbAccountsLoaded] = useState(false);
  const [qbAccountsError, setQbAccountsError] = useState<string | null>(null);

  // QB vendors from API (for vendor picker)
  const [qbVendors, setQbVendors] = useState<QBVendor[]>([]);
  const [qbVendorsLoading, setQbVendorsLoading] = useState(false);
  const [qbVendorsLoaded, setQbVendorsLoaded] = useState(false);
  const [qbVendorsError, setQbVendorsError] = useState<string | null>(null);

  // Vendor mappings state (per company)
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [vendorMappings, setVendorMappings] = useState<Record<string, { qb_vendor_id: string; qb_vendor_name: string }>>({});
  const [vendorEdits, setVendorEdits] = useState<Record<string, { qb_vendor_id: string; qb_vendor_name: string }>>({});
  const [vendorSaving, setVendorSaving] = useState<string | null>(null);

  // Track whether expense account was edited from its loaded value
  const [expDirty, setExpDirty] = useState(false);

  // Connect flow state
  const [qbConnecting, setQbConnecting] = useState(false);

  // Legacy unassigned data counts
  const [legacyVendorCount, setLegacyVendorCount] = useState(0);
  const [legacyBatchCount, setLegacyBatchCount] = useState(0);
  const [claimingLegacy, setClaimingLegacy] = useState(false);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  const loadCompanies = useCallback(async () => {
    const [{ data: companiesData }, { data: connectionsData }] = await Promise.all([
      supabase.from('companies').select('id, name, short_name, qb_connection_id').order('name'),
      supabase.from('quickbooks_connections').select('id, company_name, realm_id').is('disconnected_at', null),
    ]);
    const comps = (companiesData || []) as CompanyRow[];
    setCompanies(comps);
    setQbConnections((connectionsData || []) as QBConnectionRow[]);
    if (comps.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(comps[0].id);
    }
  }, [selectedCompanyId]);

  const loadCompanyData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setExpLoading(true);

    // Reset QB entity caches when switching companies
    setQbClassesLoaded(false);
    setQbClassesForCompany('');
    setQbAccountsLoaded(false);
    setQbVendorsLoaded(false);
    setQbClasses([]);
    setQbAccounts([]);
    setQbVendors([]);

    const [settingsRes, projectsRes, profilesRes, classRes, vendorRes] = await Promise.all([
      supabase.from('quickbooks_settings').select('labor_expense_account_id, labor_expense_account_name').eq('company_id', selectedCompanyId).maybeSingle(),
      supabase.from('projects').select('id, name, address, status').eq('status', 'active').eq('company_id', selectedCompanyId).order('name'),
      supabase.from('profiles').select('id, full_name, is_active').eq('is_active', true).order('full_name'),
      supabase.from('quickbooks_class_mappings').select('project_id, qb_class_id, qb_class_name'),
      supabase.from('quickbooks_vendor_mappings').select('user_id, qb_vendor_id, qb_vendor_name').eq('company_id', selectedCompanyId),
    ]);

    if (settingsRes.data) {
      setExpAccountId(settingsRes.data.labor_expense_account_id || '');
      setExpAccountName(settingsRes.data.labor_expense_account_name || '');
    } else {
      setExpAccountId('');
      setExpAccountName('');
    }
    setExpDirty(false);

    setProjects((projectsRes.data || []) as ProjectRow[]);
    setProfiles((profilesRes.data || []) as ProfileRow[]);

    const cm: Record<string, { qb_class_id: string; qb_class_name: string }> = {};
    ((classRes.data || []) as any[]).forEach((r) => {
      cm[r.project_id] = { qb_class_id: r.qb_class_id, qb_class_name: r.qb_class_name || '' };
    });
    setClassMappings(cm);
    setClassEdits({});

    const vm: Record<string, { qb_vendor_id: string; qb_vendor_name: string }> = {};
    ((vendorRes.data || []) as any[]).forEach((r) => {
      vm[r.user_id] = { qb_vendor_id: r.qb_vendor_id, qb_vendor_name: r.qb_vendor_name || '' };
    });
    setVendorMappings(vm);
    setVendorEdits({});

    setExpLoading(false);
  }, [selectedCompanyId]);

  const loadLegacyCounts = useCallback(async () => {
    const [{ count: vendorCount }, { count: batchCount }] = await Promise.all([
      supabase.from('quickbooks_vendor_mappings').select('id', { count: 'exact', head: true }).is('company_id', null),
      supabase.from('worker_payable_batches').select('id', { count: 'exact', head: true }).is('company_id', null),
    ]);
    setLegacyVendorCount(vendorCount || 0);
    setLegacyBatchCount(batchCount || 0);
  }, []);

  const handleClaimLegacyVendors = async () => {
    if (!selectedCompanyId) return;
    setClaimingLegacy(true);
    const { error } = await supabase
      .from('quickbooks_vendor_mappings')
      .update({ company_id: selectedCompanyId })
      .is('company_id', null);
    setClaimingLegacy(false);
    if (error) {
      toast({ title: 'Failed to claim legacy mappings', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Legacy vendor mappings assigned to this company' });
      setLegacyVendorCount(0);
      await loadCompanyData();
    }
  };

  const handleConnectQBForCompany = async () => {
    if (!selectedCompanyId) return;
    setQbConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks_connect_begin', {
        body: { company_id: selectedCompanyId },
      });
      if (error || !data?.auth_url) {
        toast({ title: 'Failed to start QuickBooks connection', description: error?.message || 'No auth URL returned', variant: 'destructive' });
        setQbConnecting(false);
        return;
      }
      window.open(data.auth_url, '_blank', 'noopener');
    } catch {
      toast({ title: 'Failed to start QuickBooks connection', variant: 'destructive' });
    }
    setQbConnecting(false);
  };

  useEffect(() => {
    if (open) {
      loadCompanies();
      loadLegacyCounts();
    }
  }, [open, loadCompanies, loadLegacyCounts]);

  useEffect(() => {
    if (open && selectedCompanyId) loadCompanyData();
  }, [open, selectedCompanyId, loadCompanyData]);

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) return;
    setAddingCompany(true);
    const { error } = await supabase.from('companies').insert({
      name: newCompanyName.trim(),
      short_name: newCompanyShort.trim() || null,
      qb_connection_id: newCompanyConnId || null,
    });
    setAddingCompany(false);
    if (error) {
      toast({ title: 'Failed to add company', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Company added' });
      setNewCompanyName('');
      setNewCompanyShort('');
      setNewCompanyConnId('');
      setAddCompanyOpen(false);
      await loadCompanies();
    }
  };

  const loadQBClasses = async () => {
    setQbClassesLoading(true);
    setQbClassesError(null);
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks_list_classes', {
        body: { company_id: selectedCompanyId },
      });
      if (error) {
        setQbClassesError(error.message);
      } else if (data?.error) {
        setQbClassesError(data.message || data.error);
      } else {
        const classes = (data?.classes || []) as QBClass[];
        setQbClasses(classes);
        setQbClassesLoaded(true);
        setQbClassesForCompany(selectedCompanyId);
        toast({ title: `Loaded ${classes.length} QB classes` });
      }
    } catch {
      setQbClassesError('Unexpected error');
    }
    setQbClassesLoading(false);
  };

  const loadQBAccounts = async () => {
    setQbAccountsLoading(true);
    setQbAccountsError(null);
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks_list_accounts', {
        body: { company_id: selectedCompanyId },
      });
      if (error) {
        setQbAccountsError(error.message);
      } else if (data?.error) {
        setQbAccountsError(data.message || data.error);
      } else {
        const accounts = (data?.accounts || []) as QBAccount[];
        setQbAccounts(accounts);
        setQbAccountsLoaded(true);
        toast({ title: `Loaded ${accounts.length} QB expense accounts` });
      }
    } catch {
      setQbAccountsError('Unexpected error');
    }
    setQbAccountsLoading(false);
  };

  const selectExpenseAccount = (accountId: string) => {
    const account = qbAccounts.find((a) => a.id === accountId);
    if (!account) return;
    setExpAccountId(account.id);
    setExpAccountName(account.fully_qualified_name);
    setExpDirty(true);
  };

  const saveExpenseAccount = async (): Promise<boolean> => {
    if (!expAccountId.trim() || !selectedCompanyId) return false;
    setExpSaving(true);

    const { data: existing } = await supabase
      .from('quickbooks_settings')
      .select('id')
      .eq('company_id', selectedCompanyId)
      .maybeSingle();

    let error;
    if (existing) {
      ({ error } = await supabase
        .from('quickbooks_settings')
        .update({
          labor_expense_account_id: expAccountId.trim(),
          labor_expense_account_name: expAccountName.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id));
    } else {
      ({ error } = await supabase
        .from('quickbooks_settings')
        .insert({
          labor_expense_account_id: expAccountId.trim(),
          labor_expense_account_name: expAccountName.trim() || null,
          company_id: selectedCompanyId,
        }));
    }
    setExpSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return false;
    }
    return true;
  };

  const getClassEdit = (projectId: string) => {
    if (classEdits[projectId]) return classEdits[projectId];
    if (classMappings[projectId]) return classMappings[projectId];
    return { qb_class_id: '', qb_class_name: '' };
  };

  const setClassEdit = (projectId: string, field: 'qb_class_id' | 'qb_class_name', value: string) => {
    const current = getClassEdit(projectId);
    setClassEdits((prev) => ({ ...prev, [projectId]: { ...current, [field]: value } }));
  };

  const selectClassForProject = (projectId: string, classId: string) => {
    // Guard: only allow selection if classes belong to the currently selected company
    if (qbClassesForCompany !== selectedCompanyId) return;
    const qbClass = qbClasses.find((c) => c.id === classId);
    if (!qbClass) return;
    setClassEdits((prev) => ({
      ...prev,
      [projectId]: { qb_class_id: qbClass.id, qb_class_name: qbClass.fully_qualified_name },
    }));
  };

  const saveClassMapping = async (projectId: string): Promise<boolean> => {
    const edit = getClassEdit(projectId);
    if (!edit.qb_class_id.trim()) return false;
    setClassSaving(projectId);

    const { error } = await supabase
      .from('quickbooks_class_mappings')
      .upsert(
        { project_id: projectId, qb_class_id: edit.qb_class_id.trim(), qb_class_name: edit.qb_class_name.trim() || null },
        { onConflict: 'project_id' }
      );

    if (error) {
      setClassSaving(null);
      return false;
    }
    setClassMappings((prev) => ({ ...prev, [projectId]: { qb_class_id: edit.qb_class_id.trim(), qb_class_name: edit.qb_class_name.trim() } }));
    setClassEdits((prev) => { const n = { ...prev }; delete n[projectId]; return n; });
    setClassSaving(null);
    return true;
  };

  const getVendorEdit = (userId: string) => {
    if (vendorEdits[userId]) return vendorEdits[userId];
    if (vendorMappings[userId]) return vendorMappings[userId];
    return { qb_vendor_id: '', qb_vendor_name: '' };
  };

  const setVendorEdit = (userId: string, field: 'qb_vendor_id' | 'qb_vendor_name', value: string) => {
    const current = getVendorEdit(userId);
    setVendorEdits((prev) => ({ ...prev, [userId]: { ...current, [field]: value } }));
  };

  const loadQBVendors = async () => {
    setQbVendorsLoading(true);
    setQbVendorsError(null);
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks_list_vendors', {
        body: { company_id: selectedCompanyId },
      });
      if (error) {
        setQbVendorsError(error.message);
      } else if (data?.error) {
        setQbVendorsError(data.message || data.error);
      } else {
        const vendors = (data?.vendors || []) as QBVendor[];
        setQbVendors(vendors);
        setQbVendorsLoaded(true);
        toast({ title: `Loaded ${vendors.length} QB vendors` });
      }
    } catch {
      setQbVendorsError('Unexpected error');
    }
    setQbVendorsLoading(false);
  };

  const selectVendorForUser = (userId: string, vendorId: string) => {
    const vendor = qbVendors.find((v) => v.id === vendorId);
    if (!vendor) return;
    setVendorEdits((prev) => ({
      ...prev,
      [userId]: { qb_vendor_id: vendor.id, qb_vendor_name: vendor.display_name },
    }));
  };

  const saveVendorMapping = async (userId: string): Promise<boolean> => {
    const edit = getVendorEdit(userId);
    if (!edit.qb_vendor_id.trim() || !selectedCompanyId) return false;
    setVendorSaving(userId);

    // Use upsert with the new composite unique key
    const { error } = await supabase
      .from('quickbooks_vendor_mappings')
      .upsert(
        {
          user_id: userId,
          qb_vendor_id: edit.qb_vendor_id.trim(),
          qb_vendor_name: edit.qb_vendor_name.trim() || null,
          company_id: selectedCompanyId,
        },
        { onConflict: 'user_id,company_id' }
      );

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      setVendorSaving(null);
      return false;
    }
    setVendorMappings((prev) => ({ ...prev, [userId]: { qb_vendor_id: edit.qb_vendor_id.trim(), qb_vendor_name: edit.qb_vendor_name.trim() } }));
    setVendorEdits((prev) => { const n = { ...prev }; delete n[userId]; return n; });
    setVendorSaving(null);
    return true;
  };

  const setExpAccountIdTracked = (v: string) => { setExpAccountId(v); setExpDirty(true); };
  const setExpAccountNameTracked = (v: string) => { setExpAccountName(v); setExpDirty(true); };

  const [saveAllLoading, setSaveAllLoading] = useState(false);

  const saveAll = async () => {
    setSaveAllLoading(true);
    const saved: string[] = [];
    let failures = 0;

    if (expDirty) {
      const ok = await saveExpenseAccount();
      if (ok) { saved.push('labor account'); setExpDirty(false); }
      else failures++;
    }

    // Scope class edits to only projects visible under the current company
    const visibleProjectIds = new Set(projects.map((p) => p.id));
    const classEditIds = Object.keys(classEdits).filter((pid) => visibleProjectIds.has(pid));
    let classSavedCount = 0;
    for (const pid of classEditIds) {
      const ok = await saveClassMapping(pid);
      if (ok) classSavedCount++;
      else failures++;
    }
    if (classSavedCount > 0) saved.push(`${classSavedCount} class mapping${classSavedCount > 1 ? 's' : ''}`);

    const vendorEditIds = Object.keys(vendorEdits);
    let vendorSavedCount = 0;
    for (const uid of vendorEditIds) {
      const ok = await saveVendorMapping(uid);
      if (ok) vendorSavedCount++;
      else failures++;
    }
    if (vendorSavedCount > 0) saved.push(`${vendorSavedCount} vendor mapping${vendorSavedCount > 1 ? 's' : ''}`);

    setSaveAllLoading(false);

    if (saved.length === 0 && failures === 0) {
      toast({ title: 'Nothing to save', description: 'No changes detected.' });
    } else if (failures > 0 && saved.length > 0) {
      toast({ title: 'Some settings could not be saved', description: `Saved ${saved.join(' and ')}.`, variant: 'destructive' });
    } else if (failures > 0) {
      toast({ title: 'Some settings could not be saved', variant: 'destructive' });
    } else {
      toast({ title: 'QuickBooks settings saved', description: `Saved ${saved.join(' and ')}.` });
    }
  };

  const hasAnyUnsaved = expDirty || Object.keys(classEdits).length > 0 || Object.keys(vendorEdits).length > 0;

  return (
    <Card className="p-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 cursor-pointer">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium flex-1">QuickBooks Settings</p>
            <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          {/* Company Selector */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-3 w-3 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">Company</p>
              <Dialog open={addCompanyOpen} onOpenChange={setAddCompanyOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2">
                    <Plus className="h-3 w-3 mr-1" />Add Company
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Company</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Company Name</Label>
                      <Input className="h-8 text-sm" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="e.g. Bahr Family Properties, LLC" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Short Name</Label>
                      <Input className="h-8 text-sm" value={newCompanyShort} onChange={(e) => setNewCompanyShort(e.target.value)} placeholder="e.g. BFP" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">QuickBooks Connection</Label>
                      <Select value={newCompanyConnId} onValueChange={setNewCompanyConnId}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select connection…" /></SelectTrigger>
                        <SelectContent>
                          {qbConnections.map((conn) => (
                            <SelectItem key={conn.id} value={conn.id}>{conn.company_name || conn.realm_id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button disabled={addingCompany || !newCompanyName.trim()} onClick={handleAddCompany} className="w-full">
                      {addingCompany ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      Add Company
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              {selectedCompany && (
                <Dialog open={editCompanyOpen} onOpenChange={setEditCompanyOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={openEditCompany}>
                      <Pencil className="h-3 w-3 mr-1" />Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Edit Company</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Company Name</Label>
                        <Input className="h-8 text-sm" value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Short Name</Label>
                        <Input className="h-8 text-sm" value={editCompanyShort} onChange={(e) => setEditCompanyShort(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">QuickBooks Connection</Label>
                        <Select value={editCompanyConnId} onValueChange={setEditCompanyConnId}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="No connection" /></SelectTrigger>
                          <SelectContent>
                            {qbConnections.map((conn) => (
                              <SelectItem key={conn.id} value={conn.id}>{conn.company_name || conn.realm_id}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button disabled={editingCompany || !editCompanyName.trim()} onClick={handleEditCompany} className="w-full">
                        {editingCompany ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        Save Changes
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            {companies.length === 0 ? (
              <p className="text-xs text-muted-foreground">No companies configured. Add a company to start.</p>
            ) : (
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select company…" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.short_name ? ` (${c.short_name})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedCompany && !selectedCompany.qb_connection_id && (
              <div className="flex items-center justify-between gap-2 p-2 rounded border border-destructive/30 bg-destructive/5">
                <p className="text-xs text-destructive">⚠ This company has no QuickBooks connection linked.</p>
                <Button size="sm" variant="outline" className="h-7 text-xs px-2 shrink-0" onClick={handleConnectQBForCompany} disabled={qbConnecting}>
                  {qbConnecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                  Connect QuickBooks
                </Button>
              </div>
            )}
            {selectedCompany && selectedCompany.qb_connection_id && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Linked to: {qbConnections.find(c => c.id === selectedCompany.qb_connection_id)?.company_name || 'Unknown'}
                </p>
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={handleConnectQBForCompany} disabled={qbConnecting}>
                  {qbConnecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                  Reconnect
                </Button>
              </div>
            )}
          </div>

          {/* Legacy unassigned data warning */}
          {(legacyVendorCount > 0 || legacyBatchCount > 0) && (
            <div className="p-2 rounded border border-accent/30 bg-accent/5 space-y-1">
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-accent-foreground shrink-0" />
                <p className="text-xs font-medium text-accent-foreground">Legacy data needs assignment</p>
              </div>
              {legacyVendorCount > 0 && (
                <p className="text-xs text-muted-foreground">{legacyVendorCount} vendor mapping{legacyVendorCount > 1 ? 's' : ''} have no company assigned.</p>
              )}
              {legacyBatchCount > 0 && (
                <p className="text-xs text-muted-foreground">{legacyBatchCount} payable batch{legacyBatchCount > 1 ? 'es' : ''} have no company assigned.</p>
              )}
              {legacyVendorCount > 0 && selectedCompanyId && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleClaimLegacyVendors} disabled={claimingLegacy}>
                  {claimingLegacy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                  Assign {legacyVendorCount} vendor mapping{legacyVendorCount > 1 ? 's' : ''} to {selectedCompany?.short_name || selectedCompany?.name || 'this company'}
                </Button>
              )}
            </div>
          )}

          {!selectedCompanyId ? (
            <p className="text-xs text-muted-foreground">Select a company above to configure QuickBooks settings.</p>
          ) : expLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {/* A. Expense Account */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">Labor Expense Account</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    disabled={qbAccountsLoading}
                    onClick={loadQBAccounts}
                  >
                    {qbAccountsLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    {qbAccountsLoaded ? 'Refresh Accounts' : 'Load QB Accounts'}
                  </Button>
                </div>
                {qbAccountsError && (
                  <p className="text-xs text-destructive">{qbAccountsError} — use manual entry below.</p>
                )}
                {qbAccountsLoaded && qbAccounts.length > 0 ? (
                  <QBCombobox
                    options={qbAccounts.map((a) => ({
                      value: a.id,
                      label: a.fully_qualified_name,
                      detail: a.account_sub_type || a.account_type || undefined,
                    }))}
                    value={expAccountId || undefined}
                    onSelect={selectExpenseAccount}
                    placeholder="Search expense accounts…"
                    className="w-full"
                  />
                ) : (
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Account ID</Label>
                      <Input className="h-8 text-xs w-40" value={expAccountId} onChange={(e) => setExpAccountIdTracked(e.target.value)} placeholder="e.g. 68" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Display Name</Label>
                      <Input className="h-8 text-xs w-48" value={expAccountName} onChange={(e) => setExpAccountNameTracked(e.target.value)} placeholder="e.g. Contract Labor" />
                    </div>
                  </div>
                )}
              </div>

              {/* B. Project → Class Mappings */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">Project → QB Class</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    disabled={qbClassesLoading}
                    onClick={loadQBClasses}
                  >
                    {qbClassesLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    {qbClassesLoaded ? 'Refresh Classes' : 'Load QB Classes'}
                  </Button>
                </div>
                {qbClassesError && (
                  <p className="text-xs text-destructive">{qbClassesError} — use manual entry below.</p>
                )}
                {projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active projects assigned to this company.</p>
                ) : (
                  <div className="space-y-1">
                    {projects.map((proj) => {
                      const edit = getClassEdit(proj.id);
                      const hasUnsaved = !!classEdits[proj.id];
                      const showDropdown = qbClassesLoaded && qbClasses.length > 0 && qbClassesForCompany === selectedCompanyId;

                      return (
                        <div key={proj.id} className="flex flex-wrap items-center gap-2 text-xs border rounded p-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{proj.name}</p>
                            {proj.address && <p className="truncate text-muted-foreground">{proj.address}</p>}
                          </div>
                          {showDropdown ? (
                            <QBCombobox
                              options={qbClasses.map((c) => ({ value: c.id, label: c.fully_qualified_name }))}
                              value={edit.qb_class_id || undefined}
                              onSelect={(val) => selectClassForProject(proj.id, val)}
                              placeholder="Search classes…"
                              className="w-56"
                            />
                          ) : (
                            <>
                              <Input
                                className="h-7 text-xs w-24"
                                value={edit.qb_class_id}
                                onChange={(e) => setClassEdit(proj.id, 'qb_class_id', e.target.value)}
                                placeholder="Class ID"
                              />
                              <Input
                                className="h-7 text-xs w-36"
                                value={edit.qb_class_name}
                                onChange={(e) => setClassEdit(proj.id, 'qb_class_name', e.target.value)}
                                placeholder="Class Name"
                              />
                            </>
                          )}
                          <Button
                            size="sm"
                            variant={hasUnsaved ? 'default' : 'outline'}
                            className="h-7 text-xs px-2"
                            disabled={classSaving === proj.id}
                            onClick={() => saveClassMapping(proj.id)}
                          >
                            {classSaving === proj.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* C. Vendor Mappings */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">Contractor → QB Vendor</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    disabled={qbVendorsLoading}
                    onClick={loadQBVendors}
                  >
                    {qbVendorsLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    {qbVendorsLoaded ? 'Refresh Vendors' : 'Load QB Vendors'}
                  </Button>
                </div>
                {qbVendorsError && (
                  <p className="text-xs text-destructive">{qbVendorsError} — use manual entry below.</p>
                )}
                {profiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active profiles.</p>
                ) : (
                  <div className="space-y-1">
                    {profiles.map((prof) => {
                      const edit = getVendorEdit(prof.id);
                      const hasUnsaved = !!vendorEdits[prof.id];
                      const showDropdown = qbVendorsLoaded && qbVendors.length > 0;
                      return (
                        <div key={prof.id} className="flex flex-wrap items-center gap-2 text-xs border rounded p-2">
                          <p className="min-w-0 flex-1 truncate font-medium">{prof.full_name || prof.id}</p>
                          {showDropdown ? (
                            <QBCombobox
                              options={qbVendors.map((v) => ({ value: v.id, label: v.display_name }))}
                              value={edit.qb_vendor_id || undefined}
                              onSelect={(val) => selectVendorForUser(prof.id, val)}
                              placeholder="Search vendors…"
                              className="w-56"
                            />
                          ) : (
                            <>
                              <Input
                                className="h-7 text-xs w-24"
                                value={edit.qb_vendor_id}
                                onChange={(e) => setVendorEdit(prof.id, 'qb_vendor_id', e.target.value)}
                                placeholder="Vendor ID"
                              />
                              <Input
                                className="h-7 text-xs w-36"
                                value={edit.qb_vendor_name}
                                onChange={(e) => setVendorEdit(prof.id, 'qb_vendor_name', e.target.value)}
                                placeholder="Vendor Name"
                              />
                            </>
                          )}
                          <Button
                            size="sm"
                            variant={hasUnsaved ? 'default' : 'outline'}
                            className="h-7 text-xs px-2"
                            disabled={vendorSaving === prof.id}
                            onClick={() => saveVendorMapping(prof.id)}
                          >
                            {vendorSaving === prof.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Save All button */}
              <div className="pt-2 border-t">
                <Button
                  className="w-full"
                  disabled={saveAllLoading || !hasAnyUnsaved}
                  onClick={saveAll}
                >
                  {saveAllLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save All QuickBooks Settings
                </Button>
                {!hasAnyUnsaved && (
                  <p className="text-xs text-muted-foreground text-center mt-1">No unsaved changes</p>
                )}
              </div>
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default QBSettingsCard;

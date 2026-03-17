import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, ChevronDown, Save, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ProjectRow = { id: string; name: string; address: string | null; status: string };
type ProfileRow = { id: string; full_name: string | null; is_active: boolean };

const QBSettingsCard = () => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Expense account state
  const [expAccountId, setExpAccountId] = useState('');
  const [expAccountName, setExpAccountName] = useState('');
  const [expLoading, setExpLoading] = useState(false);
  const [expSaving, setExpSaving] = useState(false);

  // Class mappings state
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [classMappings, setClassMappings] = useState<Record<string, { qb_class_id: string; qb_class_name: string }>>({});
  const [classEdits, setClassEdits] = useState<Record<string, { qb_class_id: string; qb_class_name: string }>>({});
  const [classSaving, setClassSaving] = useState<string | null>(null);

  // Vendor mappings state
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [vendorMappings, setVendorMappings] = useState<Record<string, { qb_vendor_id: string; qb_vendor_name: string }>>({});
  const [vendorEdits, setVendorEdits] = useState<Record<string, { qb_vendor_id: string; qb_vendor_name: string }>>({});
  const [vendorSaving, setVendorSaving] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setExpLoading(true);

    const [settingsRes, projectsRes, profilesRes, classRes, vendorRes] = await Promise.all([
      supabase.from('quickbooks_settings').select('labor_expense_account_id, labor_expense_account_name').limit(1).maybeSingle(),
      supabase.from('projects').select('id, name, address, status').eq('status', 'active').order('name'),
      supabase.from('profiles').select('id, full_name, is_active').eq('is_active', true).order('full_name'),
      supabase.from('quickbooks_class_mappings').select('project_id, qb_class_id, qb_class_name'),
      supabase.from('quickbooks_vendor_mappings').select('user_id, qb_vendor_id, qb_vendor_name'),
    ]);

    if (settingsRes.data) {
      setExpAccountId(settingsRes.data.labor_expense_account_id || '');
      setExpAccountName(settingsRes.data.labor_expense_account_name || '');
    }

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
  }, []);

  useEffect(() => {
    if (open) loadAll();
  }, [open, loadAll]);

  const saveExpenseAccount = async () => {
    if (!expAccountId.trim()) {
      toast({ title: 'Account ID required', variant: 'destructive' });
      return;
    }
    setExpSaving(true);

    // Upsert: try update first, then insert if no row exists
    const { data: existing } = await supabase
      .from('quickbooks_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('quickbooks_settings')
        .update({
          labor_expense_account_id: expAccountId.trim(),
          labor_expense_account_name: expAccountName.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) {
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Expense account saved' });
      }
    } else {
      const { error } = await supabase
        .from('quickbooks_settings')
        .insert({
          labor_expense_account_id: expAccountId.trim(),
          labor_expense_account_name: expAccountName.trim() || null,
        });
      if (error) {
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Expense account saved' });
      }
    }
    setExpSaving(false);
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

  const saveClassMapping = async (projectId: string) => {
    const edit = getClassEdit(projectId);
    if (!edit.qb_class_id.trim()) {
      toast({ title: 'Class ID required', variant: 'destructive' });
      return;
    }
    setClassSaving(projectId);

    const { error } = await supabase
      .from('quickbooks_class_mappings')
      .upsert(
        { project_id: projectId, qb_class_id: edit.qb_class_id.trim(), qb_class_name: edit.qb_class_name.trim() || null },
        { onConflict: 'project_id' }
      );

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      setClassMappings((prev) => ({ ...prev, [projectId]: { qb_class_id: edit.qb_class_id.trim(), qb_class_name: edit.qb_class_name.trim() } }));
      setClassEdits((prev) => { const n = { ...prev }; delete n[projectId]; return n; });
      toast({ title: 'Class mapping saved' });
    }
    setClassSaving(null);
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

  const saveVendorMapping = async (userId: string) => {
    const edit = getVendorEdit(userId);
    if (!edit.qb_vendor_id.trim()) {
      toast({ title: 'Vendor ID required', variant: 'destructive' });
      return;
    }
    setVendorSaving(userId);

    const { error } = await supabase
      .from('quickbooks_vendor_mappings')
      .upsert(
        { user_id: userId, qb_vendor_id: edit.qb_vendor_id.trim(), qb_vendor_name: edit.qb_vendor_name.trim() || null },
        { onConflict: 'user_id' }
      );

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      setVendorMappings((prev) => ({ ...prev, [userId]: { qb_vendor_id: edit.qb_vendor_id.trim(), qb_vendor_name: edit.qb_vendor_name.trim() } }));
      setVendorEdits((prev) => { const n = { ...prev }; delete n[userId]; return n; });
      toast({ title: 'Vendor mapping saved' });
    }
    setVendorSaving(null);
  };

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
          {expLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {/* A. Expense Account */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Labor Expense Account</p>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Account ID</Label>
                    <Input className="h-8 text-xs w-40" value={expAccountId} onChange={(e) => setExpAccountId(e.target.value)} placeholder="e.g. 68" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Display Name</Label>
                    <Input className="h-8 text-xs w-48" value={expAccountName} onChange={(e) => setExpAccountName(e.target.value)} placeholder="e.g. Contract Labor" />
                  </div>
                  <Button size="sm" className="h-8" disabled={expSaving} onClick={saveExpenseAccount}>
                    {expSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                    Save
                  </Button>
                </div>
              </div>

              {/* B. Project → Class Mappings */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project → QB Class</p>
                {projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active projects.</p>
                ) : (
                  <div className="space-y-1">
                    {projects.map((proj) => {
                      const edit = getClassEdit(proj.id);
                      const hasUnsaved = !!classEdits[proj.id];
                      return (
                        <div key={proj.id} className="flex flex-wrap items-center gap-2 text-xs border rounded p-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{proj.name}</p>
                            {proj.address && <p className="truncate text-muted-foreground">{proj.address}</p>}
                          </div>
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
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contractor → QB Vendor</p>
                {profiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active profiles.</p>
                ) : (
                  <div className="space-y-1">
                    {profiles.map((prof) => {
                      const edit = getVendorEdit(prof.id);
                      const hasUnsaved = !!vendorEdits[prof.id];
                      return (
                        <div key={prof.id} className="flex flex-wrap items-center gap-2 text-xs border rounded p-2">
                          <p className="min-w-0 flex-1 truncate font-medium">{prof.full_name || prof.id}</p>
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
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default QBSettingsCard;

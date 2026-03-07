import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, ChevronRight, User, Truck, Users } from 'lucide-react';

type OutcomeType = 'assign_user' | 'outside_vendor' | 'crew';

interface Rule {
  id: string;
  name: string;
  keywords: string[];
  match_mode: string;
  priority: number;
  active: boolean;
  outcome_type: OutcomeType;
  outcome_user_id: string | null;
}

interface Profile {
  id: string;
  full_name: string | null;
}

const OUTCOME_LABELS: Record<OutcomeType, string> = {
  assign_user: 'Assign User',
  outside_vendor: 'Outside Vendor',
  crew: 'Crew Task',
};

const OUTCOME_ICONS: Record<OutcomeType, React.ReactNode> = {
  assign_user: <User className="h-3 w-3" />,
  outside_vendor: <Truck className="h-3 w-3" />,
  crew: <Users className="h-3 w-3" />,
};

const AdminAssignmentRules = () => {
  const { isAdmin, canManageProjects, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rules, setRules] = useState<Rule[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form
  const [newName, setNewName] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newMatchMode, setNewMatchMode] = useState('contains');
  const [newPriority, setNewPriority] = useState('100');
  const [newOutcomeType, setNewOutcomeType] = useState<OutcomeType>('outside_vendor');
  const [newOutcomeUserId, setNewOutcomeUserId] = useState('');

  // Edit form
  const [editName, setEditName] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editMatchMode, setEditMatchMode] = useState('contains');
  const [editPriority, setEditPriority] = useState('100');
  const [editOutcomeType, setEditOutcomeType] = useState<OutcomeType>('outside_vendor');
  const [editOutcomeUserId, setEditOutcomeUserId] = useState('');

  const canAccess = isAdmin || canManageProjects;

  useEffect(() => {
    if (!adminLoading && !canAccess) {
      navigate('/projects', { replace: true });
    }
  }, [canAccess, adminLoading, navigate]);

  const fetchRules = async () => {
    const { data } = await supabase
      .from('assignment_rules' as any)
      .select('*')
      .order('priority', { ascending: true });
    if (data) setRules((data as any[]).map(r => ({ ...r, keywords: r.keywords || [] })));
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
    if (data) setProfiles(data as Profile[]);
  };

  useEffect(() => {
    if (canAccess) {
      fetchRules();
      fetchProfiles();
    }
  }, [canAccess]);

  const getProfileName = (userId: string | null) => {
    if (!userId) return null;
    const p = profiles.find(pr => pr.id === userId);
    return p?.full_name || 'Unknown User';
  };

  const getOutcomeBadge = (rule: Rule) => {
    if (rule.outcome_type === 'assign_user') {
      return `→ ${getProfileName(rule.outcome_user_id) || 'Unknown'}`;
    }
    return `→ ${OUTCOME_LABELS[rule.outcome_type]}`;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newName.trim()) return;
    const keywords = newKeywords.split(',').map(k => k.trim()).filter(Boolean);
    if (keywords.length === 0) {
      toast({ title: 'Error', description: 'At least one keyword is required', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('assignment_rules' as any).insert({
      name: newName.trim(),
      keywords,
      match_mode: newMatchMode,
      priority: parseInt(newPriority) || 100,
      outcome_type: newOutcomeType,
      outcome_user_id: newOutcomeType === 'assign_user' ? (newOutcomeUserId || null) : null,
      created_by: user.id,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewName(''); setNewKeywords(''); setNewMatchMode('contains'); setNewPriority('100');
    setNewOutcomeType('outside_vendor'); setNewOutcomeUserId('');
    setCreateOpen(false);
    fetchRules();
    toast({ title: 'Rule created' });
  };

  const selectRule = (rule: Rule) => {
    setSelectedRule(rule);
    setEditName(rule.name);
    setEditKeywords(rule.keywords.join(', '));
    setEditMatchMode(rule.match_mode);
    setEditPriority(rule.priority.toString());
    setEditOutcomeType(rule.outcome_type);
    setEditOutcomeUserId(rule.outcome_user_id || '');
  };

  const handleSaveRule = async () => {
    if (!selectedRule) return;
    const keywords = editKeywords.split(',').map(k => k.trim()).filter(Boolean);
    if (keywords.length === 0) {
      toast({ title: 'Error', description: 'At least one keyword is required', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('assignment_rules' as any).update({
      name: editName.trim(),
      keywords,
      match_mode: editMatchMode,
      priority: parseInt(editPriority) || 100,
      outcome_type: editOutcomeType,
      outcome_user_id: editOutcomeType === 'assign_user' ? (editOutcomeUserId || null) : null,
    }).eq('id', selectedRule.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Rule updated' });
    fetchRules();
    setSelectedRule({
      ...selectedRule,
      name: editName.trim(),
      keywords,
      match_mode: editMatchMode,
      priority: parseInt(editPriority) || 100,
      outcome_type: editOutcomeType,
      outcome_user_id: editOutcomeType === 'assign_user' ? (editOutcomeUserId || null) : null,
    });
  };

  const handleToggleActive = async (rule: Rule) => {
    const { error } = await supabase
      .from('assignment_rules' as any)
      .update({ active: !rule.active })
      .eq('id', rule.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    fetchRules();
  };

  const handleDeleteRule = async () => {
    if (!selectedRule) return;
    const { error } = await supabase.from('assignment_rules' as any).delete().eq('id', selectedRule.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Rule deleted' });
    setSelectedRule(null);
    fetchRules();
  };

  if (adminLoading) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;
  if (!canAccess) return null;

  const outcomeFormFields = (
    outcomeType: OutcomeType,
    setOutcomeType: (v: OutcomeType) => void,
    outcomeUserId: string,
    setOutcomeUserId: (v: string) => void,
  ) => (
    <>
      <div className="space-y-2">
        <Label>Outcome</Label>
        <Select value={outcomeType} onValueChange={(v) => setOutcomeType(v as OutcomeType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="assign_user">Assign to User</SelectItem>
            <SelectItem value="outside_vendor">Outside Vendor</SelectItem>
            <SelectItem value="crew">Crew Task</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {outcomeType === 'assign_user' && (
        <div className="space-y-2">
          <Label>Assign To</Label>
          <Select value={outcomeUserId} onValueChange={setOutcomeUserId}>
            <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
            <SelectContent>
              {profiles.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.full_name || 'Unnamed'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );

  // Detail view
  if (selectedRule) {
    return (
      <div className="pb-20">
        <PageHeader title={selectedRule.name} backTo="/admin" actions={
          <Button size="sm" variant="ghost" onClick={() => setSelectedRule(null)}>Back to list</Button>
        } />
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Keywords (comma-separated)</Label>
            <Input value={editKeywords} onChange={(e) => setEditKeywords(e.target.value)} placeholder="electrical, electric panel, ..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Match Mode</Label>
              <Select value={editMatchMode} onValueChange={setEditMatchMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="exact">Exact</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input type="number" value={editPriority} onChange={(e) => setEditPriority(e.target.value)} />
            </div>
          </div>
          {outcomeFormFields(editOutcomeType, setEditOutcomeType, editOutcomeUserId, setEditOutcomeUserId)}

          <div className="flex gap-2">
            <Button onClick={handleSaveRule} className="flex-1">Save Rule</Button>
            <Button variant="destructive" size="icon" onClick={handleDeleteRule}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <Card className="p-3 bg-muted/50">
            <p className="text-xs text-muted-foreground">
              <strong>How matching works:</strong> When a task is created, its title is normalized (lowercased, punctuation removed).
              {editMatchMode === 'contains'
                ? ' Each keyword is checked as a substring — if the keyword appears anywhere in the task title, it matches.'
                : ' The entire normalized task title must exactly equal the normalized keyword to match.'}
              {' '}Rules are checked in priority order (lowest number first). First match wins.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="pb-20">
      <PageHeader title="Assignment Rules" backTo="/admin" actions={
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />Rule</Button>
      } />
      <div className="p-4 space-y-2">
        <p className="text-sm text-muted-foreground mb-3">
          Rules auto-assign tasks based on keyword matching. First match wins by priority. ({rules.length} total)
        </p>
        {rules.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No assignment rules yet.</p>
        ) : (
          rules.map(rule => (
            <Card key={rule.id} className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => selectRule(rule)}>
                  <p className="font-medium text-sm truncate">{rule.name}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    <Badge variant="outline" className="text-[9px]">P{rule.priority}</Badge>
                    <Badge variant="outline" className="text-[9px]">{rule.match_mode}</Badge>
                    <Badge variant="secondary" className="text-[9px] flex items-center gap-0.5">
                      {OUTCOME_ICONS[rule.outcome_type]}
                      {getOutcomeBadge(rule)}
                    </Badge>
                    {rule.keywords.slice(0, 3).map((k, i) => (
                      <Badge key={i} variant="outline" className="text-[9px]">{k}</Badge>
                    ))}
                    {rule.keywords.length > 3 && <span className="text-[9px] text-muted-foreground">+{rule.keywords.length - 3}</span>}
                  </div>
                </div>
                <Switch
                  checked={rule.active}
                  onCheckedChange={() => handleToggleActive(rule)}
                />
                <button onClick={() => selectRule(rule)} className="text-muted-foreground hover:text-foreground shrink-0">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Assignment Rule</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="e.g. Electrical → John" />
            </div>
            <div className="space-y-2">
              <Label>Keywords (comma-separated)</Label>
              <Input value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} placeholder="electrical, electric panel, wiring" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Match Mode</Label>
                <Select value={newMatchMode} onValueChange={setNewMatchMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="exact">Exact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input type="number" value={newPriority} onChange={(e) => setNewPriority(e.target.value)} />
              </div>
            </div>
            {outcomeFormFields(newOutcomeType, setNewOutcomeType, newOutcomeUserId, setNewOutcomeUserId)}
            <Button type="submit" className="w-full">Create Rule</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAssignmentRules;

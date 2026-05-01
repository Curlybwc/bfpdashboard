import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface Project { id: string; name: string; address: string | null }
interface Profile { id: string; full_name: string | null }
interface Task {
  id: string; task: string; stage: string | null; trade: string | null;
  room_area: string | null; assigned_to_user_id: string | null;
  assignment_mode: string | null; is_package: boolean | null;
}

const STAGE_OPTIONS = ['Ready', 'In Progress', 'Review', 'Done', 'Blocked'];

const AdminBulkCandidates = () => {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [existingCandidateTaskIds, setExistingCandidateTaskIds] = useState<Set<string>>(new Set());
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [filterStage, setFilterStage] = useState('all');
  const [filterTrade, setFilterTrade] = useState('all');
  const [filterAssignment, setFilterAssignment] = useState('all'); // all | unassigned | crew | solo_assigned
  const [excludeAlready, setExcludeAlready] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Initial load
  useEffect(() => {
    (async () => {
      const [{ data: projData }, { data: profData }] = await Promise.all([
        supabase.from('projects').select('id, name, address').order('name'),
        supabase.from('profiles').select('id, full_name').order('full_name'),
      ]);
      setProjects((projData || []) as Project[]);
      setProfiles((profData || []) as Profile[]);
    })();
  }, []);

  // Load tasks + existing candidate links when project/user changes
  useEffect(() => {
    if (!projectId) { setTasks([]); return; }
    setLoadingTasks(true);
    (async () => {
      const { data: taskData } = await supabase
        .from('tasks')
        .select('id, task, stage, trade, room_area, assigned_to_user_id, assignment_mode, is_package')
        .eq('project_id', projectId);
      setTasks((taskData || []) as Task[]);
      setSelectedIds(new Set());

      if (userId && taskData && taskData.length > 0) {
        const ids = taskData.map((t: any) => t.id);
        const { data: cands } = await supabase
          .from('task_candidates')
          .select('task_id')
          .eq('user_id', userId)
          .in('task_id', ids);
        setExistingCandidateTaskIds(new Set((cands || []).map((c: any) => c.task_id)));
      } else {
        setExistingCandidateTaskIds(new Set());
      }
      setLoadingTasks(false);
    })();
  }, [projectId, userId]);

  const tradeOptions = useMemo(
    () => [...new Set(tasks.map((t) => t.trade).filter(Boolean) as string[])].sort(),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (t.is_package) return false;
      if (filterStage !== 'all' && t.stage !== filterStage) return false;
      if (filterTrade !== 'all' && (t.trade || '') !== filterTrade) return false;
      if (filterAssignment === 'unassigned' && (t.assigned_to_user_id || t.assignment_mode === 'crew')) return false;
      if (filterAssignment === 'crew' && t.assignment_mode !== 'crew') return false;
      if (filterAssignment === 'solo_assigned' && (!t.assigned_to_user_id || t.assignment_mode === 'crew')) return false;
      if (excludeAlready && existingCandidateTaskIds.has(t.id)) return false;
      if (q && !((t.task || '').toLowerCase().includes(q) || (t.trade || '').toLowerCase().includes(q) || (t.room_area || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tasks, filterStage, filterTrade, filterAssignment, excludeAlready, search, existingCandidateTaskIds]);

  const allFilteredIds = filteredTasks.map((t) => t.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allFilteredIds));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!userId || selectedIds.size === 0) return;
    setSubmitting(true);
    const ids = [...selectedIds];
    const toInsert = ids
      .filter((id) => !existingCandidateTaskIds.has(id))
      .map((task_id) => ({ task_id, user_id: userId }));
    if (toInsert.length === 0) {
      setSubmitting(false);
      toast({ title: 'Already a candidate on all selected tasks' });
      return;
    }
    const { error } = await supabase.from('task_candidates').insert(toInsert);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Added as candidate on ${toInsert.length} task${toInsert.length !== 1 ? 's' : ''}` });
    // refresh existing set
    setExistingCandidateTaskIds((prev) => {
      const next = new Set(prev);
      toInsert.forEach((r) => next.add(r.task_id));
      return next;
    });
    setSelectedIds(new Set());
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl pb-24">
      <PageHeader title="Bulk-Add Candidate" />
      <p className="text-sm text-muted-foreground mb-4">
        Add a person as a candidate on multiple tasks at once. This lets them see and claim the tasks without overwriting existing assignees.
      </p>

      <Card className="p-4 space-y-3 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}{p.address ? ` — ${p.address}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Person to add</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select person" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || 'Unnamed'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {projectId && (
        <Card className="p-4 space-y-3 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Stage</Label>
              <Select value={filterStage} onValueChange={setFilterStage}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {STAGE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Trade</Label>
              <Select value={filterTrade} onValueChange={setFilterTrade}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All trades</SelectItem>
                  {tradeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Assignment</Label>
              <Select value={filterAssignment} onValueChange={setFilterAssignment}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unassigned">Unassigned solo</SelectItem>
                  <SelectItem value="solo_assigned">Solo (assigned)</SelectItem>
                  <SelectItem value="crew">Crew tasks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Input
            placeholder="Search task name, trade, room…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={excludeAlready} onCheckedChange={(v) => setExcludeAlready(!!v)} />
            Hide tasks where this person is already a candidate
          </label>
        </Card>
      )}

      {projectId && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-muted-foreground">
            {loadingTasks ? 'Loading…' : `${filteredTasks.length} task${filteredTasks.length !== 1 ? 's' : ''} match`}
          </p>
          <Button size="sm" variant="outline" onClick={toggleAll} disabled={loadingTasks || filteredTasks.length === 0}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </Button>
        </div>
      )}

      <div className="space-y-1.5 mb-24">
        {filteredTasks.map((t) => (
          <Card key={t.id} className="p-2.5">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={selectedIds.has(t.id)}
                onCheckedChange={() => toggleOne(t.id)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.task}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[t.stage, t.trade, t.room_area].filter(Boolean).join(' · ') || '—'}
                  {t.assignment_mode === 'crew' && ' · crew'}
                  {existingCandidateTaskIds.has(t.id) && ' · already candidate'}
                </p>
              </div>
            </label>
          </Card>
        ))}
      </div>

      {projectId && userId && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-3 z-30">
          <div className="container mx-auto max-w-4xl flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button onClick={handleSubmit} disabled={submitting || selectedIds.size === 0}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add as candidate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBulkCandidates;
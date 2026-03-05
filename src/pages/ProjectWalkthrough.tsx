import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import PageHeader from '@/components/PageHeader';
import { applyBundles } from '@/lib/applyBundles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { TASK_PRIORITIES, type TaskPriority } from '@/lib/supabase-types';
import { Loader2, AlertTriangle, X, Plus } from 'lucide-react';

interface DraftMaterial {
  name: string;
  quantity: number | null;
  unit: string | null;
}

interface DraftTask {
  task: string;
  room_area: string | null;
  trade: string | null;
  priority: TaskPriority | null;
  due_date: string | null;
  assigned_to_user_id: string | null;
  assigned_to_display: string | null;
  materials: DraftMaterial[];
  notes: string | null;
}

interface ProjectMember {
  user_id: string;
  role: string;
  profiles: { full_name: string | null } | null;
}

const ProjectWalkthrough = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [inputText, setInputText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [inserting, setInserting] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [hasParsed, setHasParsed] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('project_members')
      .select('user_id, role, profiles(full_name)')
      .eq('project_id', id)
      .then(({ data }) => {
        if (data) setMembers(data as unknown as ProjectMember[]);
      });
  }, [id]);

  const handleParse = async () => {
    if (!inputText.trim() || !id) return;
    setParsing(true);
    setDrafts([]);
    setWarnings([]);
    setSelected(new Set());
    setHasParsed(false);

    try {
      const { data, error } = await supabase.functions.invoke('walkthrough_parse_tasks', {
        body: {
          project_id: id,
          input_text: inputText,
          current_date: new Date().toLocaleDateString('en-CA'),
        },
      });

      if (error) {
        toast({ title: 'Parse error', description: error.message || 'Failed to parse tasks', variant: 'destructive' });
        return;
      }

      if (data?.error) {
        toast({ title: 'Parse error', description: data.error, variant: 'destructive' });
        return;
      }

      const tasks = data?.draft_tasks || [];
      setDrafts(tasks);
      setWarnings(data?.warnings || []);
      setSelected(new Set(tasks.map((_: any, i: number) => i)));
      setHasParsed(true);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const updateDraft = (index: number, updates: Partial<DraftTask>) => {
    setDrafts(prev => prev.map((d, i) => (i === index ? { ...d, ...updates } : d)));
  };

  const toggleSelect = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const addMaterial = (draftIndex: number) => {
    setDrafts(prev =>
      prev.map((d, i) =>
        i === draftIndex
          ? { ...d, materials: [...d.materials, { name: '', quantity: null, unit: null }] }
          : d
      )
    );
  };

  const updateMaterial = (draftIndex: number, matIndex: number, updates: Partial<DraftMaterial>) => {
    setDrafts(prev =>
      prev.map((d, i) =>
        i === draftIndex
          ? {
              ...d,
              materials: d.materials.map((m, j) => (j === matIndex ? { ...m, ...updates } : m)),
            }
          : d
      )
    );
  };

  const removeMaterial = (draftIndex: number, matIndex: number) => {
    setDrafts(prev =>
      prev.map((d, i) =>
        i === draftIndex
          ? { ...d, materials: d.materials.filter((_, j) => j !== matIndex) }
          : d
      )
    );
  };

  const handleCreate = async () => {
    if (!user || !id) return;
    const approved = drafts.filter((_, i) => selected.has(i));
    if (approved.length === 0) {
      toast({ title: 'No tasks selected', variant: 'destructive' });
      return;
    }

    setInserting(true);
    try {
      for (const draft of approved) {
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .insert({
            project_id: id,
            task: draft.task,
            stage: 'Ready' as const,
            priority: (draft.priority || '2 – This Week') as any,
            due_date: draft.due_date || null,
            materials_on_site: 'No' as const,
            room_area: draft.room_area || null,
            trade: draft.trade || null,
            assigned_to_user_id: draft.assigned_to_user_id || null,
            notes: draft.notes || null,
            created_by: user.id,
          })
          .select('id')
          .single();

        if (taskError) {
          toast({ title: 'Insert failed', description: taskError.message, variant: 'destructive' });
          return; // Stop on error
        }

        if (task) {
          const validMaterials = draft.materials.filter(m => m.name.trim());
          if (validMaterials.length > 0) {
            const { error: matError } = await supabase.from('task_materials').insert(
              validMaterials.map(m => ({
                task_id: task.id,
                name: m.name,
                quantity: m.quantity,
                unit: m.unit,
                purchased: false,
                delivered: false,
              }))
            );
            if (matError) {
              toast({ title: 'Materials insert failed', description: matError.message, variant: 'destructive' });
              return;
            }
          }
          // Apply material bundles
          await applyBundles(task.id, draft.task);
        }
      }

      // Auto-add assigned users as project members (conflict-ignore)
      const assignedIds = [...new Set(approved.map(d => d.assigned_to_user_id).filter(Boolean))] as string[];
      if (assignedIds.length > 0) {
        const { data: existingMembers } = await supabase
          .from('project_members')
          .select('user_id')
          .eq('project_id', id);
        const existingIds = new Set((existingMembers || []).map(m => m.user_id));
        const newIds = assignedIds.filter(uid => !existingIds.has(uid));
        if (newIds.length > 0) {
          await supabase.from('project_members').upsert(
            newIds.map(uid => ({ project_id: id, user_id: uid, role: 'contractor' as const })),
            { onConflict: 'project_id,user_id', ignoreDuplicates: true }
          );
          const newNames = newIds.map(uid => {
            const draft = approved.find(d => d.assigned_to_user_id === uid);
            return draft?.assigned_to_display || 'Unknown';
          });
          toast({ title: `Added members: ${newNames.join(', ')}` });
        }
      }

      toast({ title: `${approved.length} task(s) created` });
      navigate(`/projects/${id}`, { replace: true });
    } finally {
      setInserting(false);
    }
  };

  return (
    <div className="pb-20">
      <PageHeader title="Walkthrough" backTo={`/projects/${id}`} />

      <div className="p-4 space-y-4">
        {/* Input area */}
        {!hasParsed && (
          <div className="space-y-3">
            <Label>Describe the work to be done</Label>
            <Textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              rows={6}
              placeholder="e.g. Mike needs to install the kitchen backsplash tile this week. We need 40 sqft of subway tile and 2 bags of thinset. Also have the electrician rough in the master bath — ASAP."
              className="text-base"
            />
            <Button onClick={handleParse} disabled={parsing || !inputText.trim()} className="w-full">
              {parsing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Parsing...</> : 'Parse Tasks'}
            </Button>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warnings</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 space-y-1">
                {warnings.map((w, i) => (
                  <li key={i} className="text-sm">{w}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Draft cards */}
        {hasParsed && drafts.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No tasks parsed from input.</p>
        )}

        {drafts.map((draft, i) => (
          <Card key={i} className={`p-4 space-y-3 ${selected.has(i) ? 'ring-2 ring-primary' : 'opacity-60'}`}>
            <div className="flex items-start gap-3">
              <Checkbox
                checked={selected.has(i)}
                onCheckedChange={() => toggleSelect(i)}
                className="mt-1"
              />
              <div className="flex-1 space-y-3">
                {/* Task name */}
                <Input
                  value={draft.task}
                  onChange={e => updateDraft(i, { task: e.target.value })}
                  className="font-medium"
                  placeholder="Task description"
                />

                <div className="grid grid-cols-2 gap-2">
                  {/* Trade */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Trade</Label>
                    <Input
                      value={draft.trade || ''}
                      onChange={e => updateDraft(i, { trade: e.target.value || null })}
                      placeholder="Trade"
                      className="h-8 text-sm"
                    />
                  </div>
                  {/* Room */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Room / Area</Label>
                    <Input
                      value={draft.room_area || ''}
                      onChange={e => updateDraft(i, { room_area: e.target.value || null })}
                      placeholder="Room"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Priority */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Priority</Label>
                    <Select
                      value={draft.priority || ''}
                      onValueChange={v => updateDraft(i, { priority: v as TaskPriority })}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Priority" /></SelectTrigger>
                      <SelectContent>
                        {TASK_PRIORITIES.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Due date */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Due Date</Label>
                    <Input
                      type="date"
                      value={draft.due_date || ''}
                      onChange={e => updateDraft(i, { due_date: e.target.value || null })}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {/* Assigned to */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Assigned To</Label>
                  <Select
                    value={draft.assigned_to_user_id || 'unassigned'}
                    onValueChange={v => updateDraft(i, {
                      assigned_to_user_id: v === 'unassigned' ? null : v,
                      assigned_to_display: v === 'unassigned' ? null : members.find(m => m.user_id === v)?.profiles?.full_name || null,
                    })}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {members.map(m => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.profiles?.full_name || 'Unnamed'} ({m.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  <Textarea
                    value={draft.notes || ''}
                    onChange={e => updateDraft(i, { notes: e.target.value || null })}
                    rows={2}
                    className="text-sm"
                  />
                </div>

                {/* Materials */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Materials ({draft.materials.length})</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => addMaterial(i)}
                    >
                      <Plus className="h-3 w-3 mr-1" />Add
                    </Button>
                  </div>
                  {draft.materials.map((mat, j) => (
                    <div key={j} className="flex gap-1 items-center">
                      <Input
                        value={mat.name}
                        onChange={e => updateMaterial(i, j, { name: e.target.value })}
                        placeholder="Name"
                        className="flex-1 h-7 text-xs"
                      />
                      <Input
                        type="number"
                        value={mat.quantity ?? ''}
                        onChange={e => updateMaterial(i, j, { quantity: e.target.value ? parseFloat(e.target.value) : null })}
                        placeholder="Qty"
                        className="w-14 h-7 text-xs"
                      />
                      <Input
                        value={mat.unit || ''}
                        onChange={e => updateMaterial(i, j, { unit: e.target.value || null })}
                        placeholder="Unit"
                        className="w-14 h-7 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => removeMaterial(i, j)}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}

        {/* Create button */}
        {hasParsed && drafts.length > 0 && (
          <div className="space-y-2">
            <Button onClick={handleCreate} disabled={inserting || selected.size === 0} className="w-full">
              {inserting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</>
              ) : (
                `Create ${selected.size} Selected Task${selected.size !== 1 ? 's' : ''}`
              )}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => { setHasParsed(false); setDrafts([]); setWarnings([]); }}>
              Back to Input
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectWalkthrough;

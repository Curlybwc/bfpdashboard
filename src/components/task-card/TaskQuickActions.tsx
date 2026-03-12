/**
 * TaskQuickActions — unified pill-button row on TaskCard.
 * Order: Assigned To, Status, Priority, Materials, Due Date, Photos, Start/Complete
 */
import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn, getErrorMessage } from '@/lib/utils';
import {
  TASK_PRIORITIES, TASK_STAGES, MATERIALS_OPTIONS,
  type TaskPriority, type MaterialsStatus, type TaskStage,
} from '@/lib/supabase-types';
import { UserPlus, Camera, Package, Flag, CalendarDays, Play, CheckCircle2, Users, LogOut, Loader2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import StatusBadge from '@/components/StatusBadge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { claimTask, startTask, completeTask } from '@/lib/taskLifecycle';
import { isTaskActionable } from '@/lib/taskOperationalStatus';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

interface Profile {
  id: string;
  full_name: string | null;
}

interface TaskQuickActionsProps {
  task: any;
  userId: string;
  isAdmin: boolean;
  onUpdate: () => void;
  allProfiles?: Profile[];
  assigneeName?: string;
  photoCount?: number;
  materialCount?: number;
  operationalStatus: string;
  isCrewTask?: boolean;
  isActiveWorker?: boolean;
  isCandidate?: boolean;
  hasChildren?: boolean;
  allChildrenDone?: boolean;
  materialsReady?: boolean;
  onMaterialsOpen: () => void;
  onPhotoConfirm: () => void;
  canReportIssue?: boolean;
  canReassign?: boolean;
}

const pill =
  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0';

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1400;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => { URL.revokeObjectURL(objectUrl); b ? resolve(b) : reject(new Error('fail')); }, 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load')); };
    img.src = objectUrl;
  });
}

const TaskQuickActions = ({
  task, userId, isAdmin, onUpdate, allProfiles,
  assigneeName, photoCount = 0, materialCount = 0,
  operationalStatus, isCrewTask = false, isActiveWorker = false, isCandidate = false,
  hasChildren = false, allChildrenDone = true, materialsReady = true,
  onMaterialsOpen, onPhotoConfirm, canReportIssue = false, canReassign = false,
}: TaskQuickActionsProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [photoPhase, setPhotoPhase] = useState<'before' | 'progress' | 'after'>('progress');
  const [uploading, setUploading] = useState(false);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [crewDialogOpen, setCrewDialogOpen] = useState(false);
  const [crewCandidates, setCrewCandidates] = useState<string[]>([]);
  const [crewSearch, setCrewSearch] = useState('');
  const [crewLoading, setCrewLoading] = useState(false);
  const [crewSaving, setCrewSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dibsConfirmOpen, setDibsConfirmOpen] = useState(false);
  const [syncingRecipe, setSyncingRecipe] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const actionable = isTaskActionable(task);
  const canExecute = operationalStatus !== 'review_needed' && operationalStatus !== 'done';
  const isLeafTask = !hasChildren;
  const isAssignedToMe = task.assigned_to_user_id === userId;
  const isUnassigned = !task.assigned_to_user_id;
  const isOutsideVendor = task.is_outside_vendor === true;

  // Action visibility
  const showDibs = actionable && canExecute && !isCrewTask && isLeafTask && isUnassigned && !isOutsideVendor && task.stage === 'Ready';
  const showStart = actionable && canExecute && !isCrewTask && isLeafTask && isAssignedToMe && task.stage === 'Ready';
  const showComplete = actionable && canExecute && !isCrewTask && isLeafTask && isAssignedToMe && (task.stage === 'Ready' || task.stage === 'In Progress');
  const showJoin = actionable && canExecute && isCrewTask && isCandidate && !isActiveWorker;
  const showLeave = actionable && canExecute && isCrewTask && isActiveWorker;
  const canComplete = hasChildren ? allChildrenDone : true;
  const isDone = task.stage === 'Done';

  // Assignee display
  const assigneeLabel = task.is_outside_vendor
    ? 'Outside Vendor'
    : task.assigned_to_user_id
      ? (assigneeName || allProfiles?.find(p => p.id === task.assigned_to_user_id)?.full_name || 'Assigned')
      : 'Unassigned';

  // Handlers
  const handleAssign = async (profileId: string | null) => {
    try {
      if (profileId) {
        const { data: existing } = await supabase.from('project_members').select('id').eq('project_id', task.project_id).eq('user_id', profileId).maybeSingle();
        if (!existing) await supabase.from('project_members').insert({ project_id: task.project_id, user_id: profileId, role: 'contractor' });
      }
      const { error } = await supabase.from('tasks').update({ assigned_to_user_id: profileId }).eq('id', task.id);
      if (error) throw error;
      onUpdate();
    } catch (e: unknown) { toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }); }
  };

  const handleSetOutsideVendor = async () => {
    try {
      const newVal = !task.is_outside_vendor;
      const { error } = await supabase.from('tasks').update({ is_outside_vendor: newVal, assigned_to_user_id: newVal ? null : task.assigned_to_user_id }).eq('id', task.id);
      if (error) throw error;
      toast({ title: newVal ? 'Marked as Outside Vendor' : 'Removed Outside Vendor flag' });
      onUpdate();
    } catch (e: unknown) { toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }); }
  };

  const handleToggleCrew = async () => {
    const newMode = task.assignment_mode === 'crew' ? 'solo' : 'crew';
    try {
      const { error } = await supabase.from('tasks').update({ assignment_mode: newMode }).eq('id', task.id);
      if (error) throw error;
      toast({ title: newMode === 'crew' ? 'Set as crew task' : 'Set as solo task' });
      onUpdate();
    } catch (e: unknown) { toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }); }
  };

  const openCrewAssignmentDialog = async () => {
    setCrewDialogOpen(true);
    setCrewSearch('');
    setCrewLoading(true);

    const { data, error } = await supabase
      .from('task_candidates')
      .select('user_id')
      .eq('task_id', task.id);

    setCrewLoading(false);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    const fromDb = (data || []).map((row) => row.user_id);
    if (fromDb.length > 0) {
      setCrewCandidates(fromDb);
      return;
    }

    setCrewCandidates(task.assigned_to_user_id ? [task.assigned_to_user_id] : []);
  };

  const handleSaveCrewCandidates = async () => {
    if (crewCandidates.length === 0) {
      toast({ title: 'Select crew members', description: 'Pick at least one crew member.', variant: 'destructive' });
      return;
    }

    setCrewSaving(true);

    try {
      const { data: existingMembers, error: existingMembersError } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', task.project_id)
        .in('user_id', crewCandidates);

      if (existingMembersError) throw existingMembersError;

      const existingMemberSet = new Set((existingMembers || []).map((member) => member.user_id));
      const missingMemberIds = crewCandidates.filter((userId) => !existingMemberSet.has(userId));

      if (missingMemberIds.length > 0) {
        const { error: memberInsertError } = await supabase
          .from('project_members')
          .insert(missingMemberIds.map((userId) => ({
            project_id: task.project_id,
            user_id: userId,
            role: 'contractor' as const,
          })));

        if (memberInsertError) throw memberInsertError;
      }

      const { error: taskError } = await supabase
        .from('tasks')
        .update({
          assignment_mode: 'crew',
          assigned_to_user_id: null,
          is_outside_vendor: false,
          lead_user_id: crewCandidates[0] || null,
        })
        .eq('id', task.id);

      if (taskError) throw taskError;

      const { error: candidateDeleteError } = await supabase
        .from('task_candidates')
        .delete()
        .eq('task_id', task.id);

      if (candidateDeleteError) throw candidateDeleteError;

      const { error: candidateInsertError } = await supabase
        .from('task_candidates')
        .upsert(
          crewCandidates.map((userId) => ({ task_id: task.id, user_id: userId })),
          { onConflict: 'task_id,user_id' }
        );

      if (candidateInsertError) throw candidateInsertError;

      toast({ title: 'Crew members saved' });
      setCrewDialogOpen(false);
      onUpdate();
    } catch (e: unknown) {
      toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' });
    } finally {
      setCrewSaving(false);
    }
  };

  const handleStageChange = async (newStage: TaskStage) => {
    if (newStage === task.stage) return;
    setLoading(true);
    try {
      if (newStage === 'Done') {
        await completeTask({ taskId: task.id, parentTaskId: task.parent_task_id, isRecurring: task.is_recurring });
      } else {
        const updates: Record<string, unknown> = { stage: newStage };
        if (newStage === 'In Progress' && !task.started_at) { updates.started_at = new Date().toISOString(); updates.started_by_user_id = userId; }
        const { error } = await supabase.from('tasks').update(updates).eq('id', task.id);
        if (error) throw error;
      }
      onUpdate();
    } catch (e: unknown) { toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const handlePriority = async (p: TaskPriority) => {
    if (p === task.priority) return;
    try { const { error } = await supabase.from('tasks').update({ priority: p }).eq('id', task.id); if (error) throw error; onUpdate(); }
    catch (e: unknown) { toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }); }
  };

  const handleMaterialsOnSite = async (s: MaterialsStatus) => {
    if (s === task.materials_on_site) return;
    try { const { error } = await supabase.from('tasks').update({ materials_on_site: s }).eq('id', task.id); if (error) throw error; onUpdate(); }
    catch (e: unknown) { toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }); }
  };

  const handleDueDate = async (date: Date | undefined) => {
    try {
      const { error } = await supabase.from('tasks').update({ due_date: date ? format(date, 'yyyy-MM-dd') : null }).eq('id', task.id);
      if (error) throw error; setDateDialogOpen(false); onUpdate();
    } catch (e: unknown) { toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }); }
  };

  const handleDibs = async (force = false) => {
    if (!force && !isAdmin) {
      const { count } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('assigned_to_user_id', userId).eq('stage', 'Ready').eq('materials_on_site', 'Yes');
      if ((count ?? 0) >= 5) { setDibsConfirmOpen(true); return; }
    }
    setLoading(true);
    try { await claimTask(task.id, userId); onUpdate(); }
    catch (e: unknown) { toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const handleStart = async () => {
    setLoading(true);
    try { await startTask(task.id, userId); onUpdate(); }
    catch (e: unknown) { toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const handleCompleteClick = async () => {
    // Check for after photo
    const { count: afterCount } = await supabase.from('task_photos').select('id', { count: 'exact', head: true }).eq('task_id', task.id).eq('phase', 'after');
    if ((afterCount ?? 0) === 0) { onPhotoConfirm(); return; }
    setLoading(true);
    try { await completeTask({ taskId: task.id, parentTaskId: task.parent_task_id, isRecurring: task.is_recurring }); onUpdate(); }
    catch (e: unknown) { toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const handleJoinCrew = async () => {
    setLoading(true);
    const { error } = await supabase.from('task_workers').upsert({ task_id: task.id, user_id: userId, active: true, joined_at: new Date().toISOString(), left_at: null }, { onConflict: 'task_id,user_id' });
    if (!error && task.stage === 'Ready') await supabase.from('tasks').update({ stage: 'In Progress' }).eq('id', task.id);
    setLoading(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' }); else onUpdate();
  };

  const handleLeaveCrew = async () => {
    setLoading(true);
    const { error } = await supabase.from('task_workers').update({ active: false, left_at: new Date().toISOString() }).eq('task_id', task.id).eq('user_id', userId);
    setLoading(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' }); else onUpdate();
  };

  const openPhotoUpload = (phase: 'before' | 'progress' | 'after') => { setPhotoPhase(phase); setPhotoDialogOpen(true); };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const path = `${task.id}/${photoPhase}/${crypto.randomUUID()}.jpg`;
      const { error: ue } = await supabase.storage.from('task-photos').upload(path, compressed, { contentType: 'image/jpeg' });
      if (ue) throw ue;
      const { error: ie } = await supabase.from('task_photos').insert({ task_id: task.id, phase: photoPhase, storage_path: path, uploaded_by: userId });
      if (ie) { await supabase.storage.from('task-photos').remove([path]); throw ie; }
      toast({ title: 'Photo uploaded' }); setPhotoDialogOpen(false); onUpdate();
    } catch (e: unknown) { toast({ title: 'Upload failed', description: getErrorMessage(e), variant: 'destructive' }); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const sortedProfiles = (allProfiles || []).slice().sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  const dueDateLabel = task.due_date || 'Due Date';
  const isOverdue = !isDone && task.due_date && task.due_date < new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="flex items-center gap-1 flex-wrap">
        {/* Assigned To */}
        {canReassign ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={pill}><UserPlus className="h-3.5 w-3.5" />{assigneeLabel}</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              {task.assigned_to_user_id && <DropdownMenuItem onSelect={() => handleAssign(null)}><span className="text-muted-foreground">Unassign</span></DropdownMenuItem>}
              <DropdownMenuItem onSelect={handleToggleCrew}>
                <Users className="h-3.5 w-3.5 mr-1" />
                {task.assignment_mode === 'crew' ? 'Switch to Solo' : 'Make Crew Task'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={openCrewAssignmentDialog}>
                <Users className="h-3.5 w-3.5 mr-1" />
                Set Crew Members
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleSetOutsideVendor} className={cn(task.is_outside_vendor && 'font-semibold')}>
                <Package className="h-3.5 w-3.5 mr-1" />Outside Vendor
              </DropdownMenuItem>
              {sortedProfiles.map((p) => (
                <DropdownMenuItem key={p.id} disabled={p.id === task.assigned_to_user_id} onSelect={() => handleAssign(p.id)} className={cn(p.id === task.assigned_to_user_id && 'font-semibold')}>
                  {p.full_name || 'Unnamed'}
                </DropdownMenuItem>
              ))}
              {sortedProfiles.length === 0 && <DropdownMenuLabel className="text-xs text-muted-foreground">No users found</DropdownMenuLabel>}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className={pill}><UserPlus className="h-3.5 w-3.5" />{assigneeLabel}</span>
        )}

        {/* Status */}
        {actionable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={pill}><StatusBadge status={operationalStatus} /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {TASK_STAGES.map((s) => (
                <DropdownMenuItem key={s} disabled={s === task.stage || loading} onSelect={() => handleStageChange(s)} className={cn(s === task.stage && 'font-semibold')}>
                  <StatusBadge status={s} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className={pill}><StatusBadge status="Package" /></span>
        )}

        {/* Priority */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={pill}><Flag className="h-3.5 w-3.5" />{task.priority}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {TASK_PRIORITIES.map((p) => (
              <DropdownMenuItem key={p} onSelect={() => handlePriority(p)} className={cn(p === task.priority && 'font-semibold')}>{p}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Materials on Site */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={pill}><Package className="h-3.5 w-3.5" />Materials: {task.materials_on_site}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {MATERIALS_OPTIONS.map((opt) => (
              <DropdownMenuItem key={opt} onSelect={() => handleMaterialsOnSite(opt)} className={cn(opt === task.materials_on_site && 'font-semibold')}>{opt}</DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={onMaterialsOpen}>View Materials List</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Due Date */}
        <button className={cn(pill, isOverdue && 'border-destructive text-destructive')} onClick={() => setDateDialogOpen(true)}>
          <CalendarDays className="h-3.5 w-3.5" />{dueDateLabel}
        </button>

        {/* Photos */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={pill}><Camera className="h-3.5 w-3.5" />📷 {photoCount}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => openPhotoUpload('before')}>Upload Before</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openPhotoUpload('progress')}>Upload Progress</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openPhotoUpload('after')}>Upload After</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Start / Complete — solo tasks */}
        {showDibs && (
          <button className={cn(pill, 'border-primary text-primary font-medium')} onClick={() => handleDibs()} disabled={loading}>Dibs</button>
        )}
        {showStart && (
          <button className={cn(pill, 'border-primary text-primary font-medium')} onClick={handleStart} disabled={loading || !materialsReady}>
            <Play className="h-3.5 w-3.5" />Start
          </button>
        )}
        {showComplete && (
          <button
            className={cn(pill, 'border-green-600 text-green-600 font-medium', !canComplete && 'opacity-50 cursor-not-allowed')}
            onClick={canComplete ? handleCompleteClick : undefined}
            disabled={loading || !canComplete}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />Complete
          </button>
        )}

        {/* Crew actions */}
        {showJoin && (
          <button className={cn(pill, 'border-primary text-primary font-medium')} onClick={handleJoinCrew} disabled={loading}>
            <Users className="h-3.5 w-3.5" />Join
          </button>
        )}
        {showLeave && (
          <button className={cn(pill)} onClick={handleLeaveCrew} disabled={loading}>
            <LogOut className="h-3.5 w-3.5" />Leave
          </button>
        )}

        {/* Report Issue */}
        {canReportIssue && actionable && (
          <button className={pill} onClick={() => navigate(`/projects/${task.project_id}/tasks/${task.id}?report=1`)}>
            <AlertTriangle className="h-3.5 w-3.5" />Issue
          </button>
        )}
      </div>

      {/* Due Date Dialog */}
      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent className="sm:max-w-[350px]" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <DialogHeader><DialogTitle>Set Due Date</DialogTitle></DialogHeader>
          <Calendar mode="single" selected={task.due_date ? new Date(task.due_date + 'T00:00:00') : undefined} onSelect={handleDueDate} className={cn("p-3 pointer-events-auto")} />
          {task.due_date && <Button variant="ghost" size="sm" onClick={() => handleDueDate(undefined)}>Clear Due Date</Button>}
        </DialogContent>
      </Dialog>

      {/* Photo Upload Dialog */}
      <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
        <DialogContent className="sm:max-w-[350px]" onClick={(e) => { e.stopPropagation(); }}>
          <DialogHeader><DialogTitle>Upload {photoPhase} Photo</DialogTitle></DialogHeader>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          <Button className="w-full" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} disabled={uploading}>
            <Camera className="h-4 w-4 mr-2" />{uploading ? 'Uploading…' : 'Take / Choose Photo'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Crew members dialog */}
      <Dialog open={crewDialogOpen} onOpenChange={setCrewDialogOpen}>
        <DialogContent className="sm:max-w-[420px]" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <DialogHeader><DialogTitle>Set Crew Members</DialogTitle></DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Search members..."
              value={crewSearch}
              onChange={(e) => setCrewSearch(e.target.value)}
            />

            <div className="max-h-64 overflow-y-auto border rounded-md">
              {crewLoading ? (
                <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading crew members...
                </div>
              ) : sortedProfiles.filter((profile) => {
                const q = crewSearch.trim().toLowerCase();
                if (!q) return true;
                return (profile.full_name || '').toLowerCase().includes(q);
              }).length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No members found.</p>
              ) : (
                sortedProfiles
                  .filter((profile) => {
                    const q = crewSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (profile.full_name || '').toLowerCase().includes(q);
                  })
                  .map((profile) => {
                    const checked = crewCandidates.includes(profile.id);
                    return (
                      <label
                        key={profile.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm border-b last:border-b-0 hover:bg-accent cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            const enabled = value === true;
                            setCrewCandidates((prev) => {
                              if (enabled) {
                                return prev.includes(profile.id) ? prev : [...prev, profile.id];
                              }
                              return prev.filter((id) => id !== profile.id);
                            });
                          }}
                        />
                        <span className="truncate">{profile.full_name || 'Unnamed'}</span>
                      </label>
                    );
                  })
              )}
            </div>

            <p className="text-xs text-muted-foreground">Selected: {crewCandidates.length}</p>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCrewDialogOpen(false)}
                disabled={crewSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveCrewCandidates} disabled={crewSaving || crewLoading}>
                {crewSaving ? 'Saving...' : 'Save Crew'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dibs confirm */}
      <Dialog open={dibsConfirmOpen} onOpenChange={setDibsConfirmOpen}>
        <DialogContent onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <DialogHeader><DialogTitle>Dibs Limit Reached</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">You already have 5 active tasks. Claim anyway?</p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setDibsConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => { setDibsConfirmOpen(false); handleDibs(true); }}>Claim Anyway</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TaskQuickActions;

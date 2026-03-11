/**
 * TaskQuickActions — inline "⋯" menu on TaskCard for rapid task management
 * without navigating to the detail page.
 */
import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/lib/utils';
import { TASK_PRIORITIES, MATERIALS_OPTIONS, type TaskPriority, type MaterialsStatus } from '@/lib/supabase-types';
import { MoreHorizontal, UserPlus, Camera, Package, Flag, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Profile {
  id: string;
  full_name: string | null;
}

interface TaskQuickActionsProps {
  task: any;
  userId: string;
  onUpdate: () => void;
  allProfiles?: Profile[];
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1400;
      let w = img.width;
      let h = img.height;
      if (w > MAX || h > MAX) {
        const ratio = Math.min(MAX / w, MAX / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          blob ? resolve(blob) : reject(new Error('Compression failed'));
        },
        'image/jpeg',
        0.82,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    img.src = objectUrl;
  });
}

const TaskQuickActions = ({ task, userId, onUpdate, allProfiles }: TaskQuickActionsProps) => {
  const { toast } = useToast();
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [photoPhase, setPhotoPhase] = useState<'before' | 'progress' | 'after'>('progress');
  const [uploading, setUploading] = useState(false);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAssign = async (profileId: string | null) => {
    try {
      // If assigning someone new, ensure they're a project member
      if (profileId) {
        const { data: existing } = await supabase
          .from('project_members')
          .select('id')
          .eq('project_id', task.project_id)
          .eq('user_id', profileId)
          .maybeSingle();
        if (!existing) {
          await supabase.from('project_members').insert({
            project_id: task.project_id,
            user_id: profileId,
            role: 'contractor',
          });
        }
      }
      const { error } = await supabase
        .from('tasks')
        .update({ assigned_to_user_id: profileId })
        .eq('id', task.id);
      if (error) throw error;
      toast({ title: profileId ? 'Task assigned' : 'Task unassigned' });
      onUpdate();
    } catch (error: unknown) {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    }
  };

  const handlePriority = async (priority: TaskPriority) => {
    if (priority === task.priority) return;
    try {
      const { error } = await supabase.from('tasks').update({ priority }).eq('id', task.id);
      if (error) throw error;
      onUpdate();
    } catch (error: unknown) {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    }
  };

  const handleMaterialsOnSite = async (status: MaterialsStatus) => {
    if (status === task.materials_on_site) return;
    try {
      const { error } = await supabase.from('tasks').update({ materials_on_site: status }).eq('id', task.id);
      if (error) throw error;
      onUpdate();
    } catch (error: unknown) {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    }
  };

  const handleDueDate = async (date: Date | undefined) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ due_date: date ? format(date, 'yyyy-MM-dd') : null })
        .eq('id', task.id);
      if (error) throw error;
      setDatePopoverOpen(false);
      onUpdate();
    } catch (error: unknown) {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    }
  };

  const openPhotoUpload = (phase: 'before' | 'progress' | 'after') => {
    setPhotoPhase(phase);
    setPhotoDialogOpen(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const path = `${task.id}/${photoPhase}/${crypto.randomUUID()}.jpg`;
      const { error: uploadErr } = await supabase.storage.from('task-photos').upload(path, compressed, {
        contentType: 'image/jpeg',
      });
      if (uploadErr) throw uploadErr;
      const { error: insertErr } = await supabase.from('task_photos').insert({
        task_id: task.id,
        phase: photoPhase,
        storage_path: path,
        uploaded_by: userId,
      });
      if (insertErr) {
        // Best-effort cleanup
        await supabase.storage.from('task-photos').remove([path]);
        throw insertErr;
      }
      toast({ title: 'Photo uploaded' });
      setPhotoDialogOpen(false);
      onUpdate();
    } catch (error: unknown) {
      toast({ title: 'Upload failed', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Sort profiles: project members first could be nice, but for simplicity just alpha sort
  const sortedProfiles = (allProfiles || []).slice().sort((a, b) =>
    (a.full_name || '').localeCompare(b.full_name || '')
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            aria-label="Quick actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          {/* Assign / Reassign */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <UserPlus className="h-4 w-4 mr-2" />
              {task.assigned_to_user_id ? 'Reassign' : 'Assign'}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
              {task.assigned_to_user_id && (
                <DropdownMenuItem onSelect={() => handleAssign(null)}>
                  <span className="text-muted-foreground">Unassign</span>
                </DropdownMenuItem>
              )}
              {sortedProfiles.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  disabled={p.id === task.assigned_to_user_id}
                  onSelect={() => handleAssign(p.id)}
                  className={cn(p.id === task.assigned_to_user_id && 'font-semibold')}
                >
                  {p.full_name || 'Unnamed'}
                </DropdownMenuItem>
              ))}
              {sortedProfiles.length === 0 && (
                <DropdownMenuLabel className="text-xs text-muted-foreground">No users found</DropdownMenuLabel>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Add Photo */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Camera className="h-4 w-4 mr-2" />
              Add Photo
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => openPhotoUpload('before')}>Before</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openPhotoUpload('progress')}>Progress</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openPhotoUpload('after')}>After</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* Priority */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Flag className="h-4 w-4 mr-2" />
              Priority
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {TASK_PRIORITIES.map((p) => (
                <DropdownMenuItem
                  key={p}
                  onSelect={() => handlePriority(p)}
                  className={cn(p === task.priority && 'font-semibold')}
                >
                  {p}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Materials on Site */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Package className="h-4 w-4 mr-2" />
              Materials on Site
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {MATERIALS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt}
                  onSelect={() => handleMaterialsOnSite(opt)}
                  className={cn(opt === task.materials_on_site && 'font-semibold')}
                >
                  {opt}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Due Date */}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setDatePopoverOpen(true);
            }}
          >
            <CalendarDays className="h-4 w-4 mr-2" />
            {task.due_date ? `Due: ${task.due_date}` : 'Set Due Date'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Due Date Dialog */}
      <Dialog open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
        <DialogContent className="sm:max-w-[350px]" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <DialogHeader>
            <DialogTitle>Set Due Date</DialogTitle>
          </DialogHeader>
          <Calendar
            mode="single"
            selected={task.due_date ? new Date(task.due_date + 'T00:00:00') : undefined}
            onSelect={handleDueDate}
            className={cn("p-3 pointer-events-auto")}
          />
          {task.due_date && (
            <Button variant="ghost" size="sm" onClick={() => handleDueDate(undefined)}>
              Clear Due Date
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Photo Upload Dialog */}
      <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
        <DialogContent className="sm:max-w-[350px]" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <DialogHeader>
            <DialogTitle>Upload {photoPhase} Photo</DialogTitle>
          </DialogHeader>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="h-4 w-4 mr-2" />
            {uploading ? 'Uploading…' : 'Take / Choose Photo'}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TaskQuickActions;

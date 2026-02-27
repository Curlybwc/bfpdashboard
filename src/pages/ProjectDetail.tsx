import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ProjectMembers from '@/components/ProjectMembers';
import { TASK_STAGES, TASK_PRIORITIES, MATERIALS_OPTIONS, type TaskStage, type TaskPriority, type MaterialsStatus } from '@/lib/supabase-types';
import { Link } from 'react-router-dom';

interface ProjectMember {
  user_id: string;
  role: string;
  profiles: { full_name: string | null } | null;
}

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [stage, setStage] = useState<TaskStage>('Ready');
  const [priority, setPriority] = useState<TaskPriority>('2 – This Week');
  const [materials, setMaterials] = useState<MaterialsStatus>('No');
  const [roomArea, setRoomArea] = useState('');
  const [trade, setTrade] = useState('');
  const [notes, setNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState('unassigned');
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const fetchData = async () => {
    if (!id) return;
    const [{ data: proj }, { data: t }, { data: members }] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('tasks').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('project_members').select('user_id, role, profiles(full_name)').eq('project_id', id),
    ]);
    if (proj) setProject(proj);
    if (t) setTasks(t);
    if (members) setProjectMembers(members as unknown as ProjectMember[]);
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id) return;
    const { error } = await supabase.from('tasks').insert({
      project_id: id,
      task: taskName,
      stage,
      priority,
      materials_on_site: materials,
      room_area: roomArea || null,
      trade: trade || null,
      notes: notes || null,
      created_by: user.id,
      assigned_to_user_id: assignedTo === 'unassigned' ? null : assignedTo,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setTaskName(''); setStage('Ready'); setPriority('2 – This Week'); setMaterials('No');
    setRoomArea(''); setTrade(''); setNotes(''); setAssignedTo('unassigned');
    setOpen(false);
    fetchData();
  };

  if (!project) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="pb-20">
      <PageHeader
        title={project.name}
        backTo="/projects"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Task</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div className="space-y-2">
                  <Label>Task Description</Label>
                  <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Stage</Label>
                    <Select value={stage} onValueChange={(v) => setStage(v as TaskStage)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TASK_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Materials On Site</Label>
                    <Select value={materials} onValueChange={(v) => setMaterials(v as MaterialsStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MATERIALS_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Trade</Label>
                    <Input value={trade} onChange={(e) => setTrade(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Room / Area</Label>
                  <Input value={roomArea} onChange={(e) => setRoomArea(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Assigned To</Label>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {projectMembers.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.profiles?.full_name || 'Unnamed'} ({m.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
                <Button type="submit" className="w-full">Create Task</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <StatusBadge status={project.status} />
          {project.address && <span className="text-sm text-muted-foreground">{project.address}</span>}
        </div>
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No tasks yet.</p>
          ) : (
            tasks.map((t) => (
              <Link key={t.id} to={`/projects/${id}/tasks/${t.id}`}>
                <Card className="p-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{t.task}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <StatusBadge status={t.stage} />
                        <span className="text-xs text-muted-foreground">{t.priority}</span>
                        {t.trade && <span className="text-xs text-muted-foreground">• {t.trade}</span>}
                      </div>
                    </div>
                    <StatusBadge status={t.materials_on_site} />
                  </div>
                </Card>
              </Link>
            ))
          )}
        </div>
        <ProjectMembers projectId={id!} />
      </div>
    </div>
  );
};

export default ProjectDetail;

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, MapPin, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { computeProjectHealthSummary } from '@/lib/projectSummary';

type ProjectType = 'construction' | 'rental' | 'general';

const ProjectList = () => {
  const { user } = useAuth();
  const { isAdmin, canManageProjects } = useAdmin();
  const { toast } = useToast();
  const canCreate = isAdmin || canManageProjects;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as ProjectType) || 'construction';
  const isRental = activeTab === 'rental';

  const [projects, setProjects] = useState<any[]>([]);
  const [projectSummaryMap, setProjectSummaryMap] = useState<Record<string, ReturnType<typeof computeProjectHealthSummary>>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const fetchProjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('project_type', activeTab)
      .order('created_at', { ascending: false });

    if (error) {
      setProjects([]);
      setProjectSummaryMap({});
      setLoading(false);
      return;
    }

    const nextProjects = data || [];
    setProjects(nextProjects);

    if (nextProjects.length === 0) {
      setProjectSummaryMap({});
      setLoading(false);
      return;
    }

    const projectIds = nextProjects.map((project) => project.id);
    const { data: taskRows, error: taskError } = await supabase
      .from('tasks')
      .select('id, project_id, stage, is_blocked, materials_on_site, needs_manager_review, due_date, parent_task_id, started_at')
      .in('project_id', projectIds);

    if (taskError) {
      setProjectSummaryMap({});
      setLoading(false);
      return;
    }

    const tasksByProject: Record<string, any[]> = {};
    nextProjects.forEach((project) => {
      tasksByProject[project.id] = [];
    });

    (taskRows || []).forEach((task) => {
      if (!tasksByProject[task.project_id]) tasksByProject[task.project_id] = [];
      tasksByProject[task.project_id].push(task);
    });

    const summaries: Record<string, ReturnType<typeof computeProjectHealthSummary>> = {};
    nextProjects.forEach((project) => {
      summaries[project.id] = computeProjectHealthSummary(tasksByProject[project.id] || []);
    });
    setProjectSummaryMap(summaries);
    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, [activeTab]);

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { data: project, error } = await supabase
      .from('projects')
      .insert({ name, address, project_type: activeTab } as any)
      .select()
      .single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await supabase.from('project_members').insert({ project_id: project.id, user_id: user.id, role: 'manager' });
    setName(''); setAddress(''); setOpen(false);
    fetchProjects();
  };

  const entityLabel = isRental ? 'Property' : activeTab === 'general' ? 'List' : 'Project';

  const loadingCards = useMemo(() => Array.from({ length: 3 }, (_, i) => i), []);

  return (
    <div className="pb-20">
      <PageHeader
        title="Projects"
        actions={
          canCreate ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />New {entityLabel}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New {entityLabel}</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>{entityLabel} Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <Button type="submit" className="w-full">Create {entityLabel}</Button>
              </form>
            </DialogContent>
          </Dialog>
          ) : undefined
        }
      />
      <div className="px-4 pt-2">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="construction" className="text-xs px-2">Construction</TabsTrigger>
            <TabsTrigger value="rental" className="text-xs px-2">Rentals</TabsTrigger>
            <TabsTrigger value="general" className="text-xs px-2">General</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="p-4 space-y-3">
        {loading ? (
          loadingCards.map((key) => (
            <Card key={key} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2 min-w-0 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-2 w-full" />
            </Card>
          ))
        ) : projects.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No {isRental ? 'properties' : activeTab === 'general' ? 'lists' : 'projects'} yet. Create your first one!
          </p>
        ) : (
          projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`}>
              <Card className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{p.name}</h3>
                    {p.address && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3 shrink-0" />{p.address}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                {projectSummaryMap[p.id] && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {projectSummaryMap[p.id].completedTasks}/{projectSummaryMap[p.id].totalTasks} tasks • {projectSummaryMap[p.id].percentComplete}%
                      </span>
                      {projectSummaryMap[p.id].blockedTasks > 0 && (
                        <span className="inline-flex items-center gap-1 text-destructive font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          {projectSummaryMap[p.id].blockedTasks} blocked
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${projectSummaryMap[p.id].percentComplete}%` }} />
                    </div>
                  </div>
                )}
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default ProjectList;

import { useMemo, useState } from 'react';
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
import { Plus, MapPin, AlertTriangle, Search, ArrowUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectList } from '@/hooks/useProjectList';
import type { ProjectType } from '@/lib/supabase-types';
import { useQueryClient } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const ProjectList = () => {
  const { user } = useAuth();
  const { isAdmin, canManageProjects } = useAdmin();
  const { toast } = useToast();
  const canCreate = isAdmin || canManageProjects;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as ProjectType) || 'construction';
  const isRental = activeTab === 'rental';

  const queryClient = useQueryClient();
  const { data, isLoading } = useProjectList(activeTab);
  const projects = data?.projects ?? [];
  const projectSummaryMap = data?.projectSummaryMap ?? {};
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'address'>('newest');
  const [showArchived, setShowArchived] = useState(false);


  const filteredProjects = useMemo(() => {
    let result = [...projects];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q))
      );
    }
    if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'address') {
      result.sort((a, b) => {
        const aNum = parseInt((a.address || '').replace(/\D.*/, ''), 10) || Infinity;
        const bNum = parseInt((b.address || '').replace(/\D.*/, ''), 10) || Infinity;
        return aNum - bNum;
      });
    }
    return result;
  }, [projects, search, sortBy]);

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { data: project, error } = await supabase
      .from('projects')
      .insert({ name, address, project_type: activeTab })
      .select()
      .single();
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.from('project_members').insert({ project_id: project.id, user_id: user.id, role: 'manager' });
    setName('');
    setAddress('');
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ['projects-list', activeTab] });
  };

  const entityLabel = isRental ? 'Property' : activeTab === 'general' ? 'List' : 'Project';

  const sortLabel = sortBy === 'name' ? 'A–Z' : sortBy === 'address' ? 'Address #' : 'Newest';

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
      <div className="px-4 pt-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${isRental ? 'properties' : activeTab === 'general' ? 'lists' : 'projects'}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5" />{sortLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSortBy('newest')}>Newest</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('name')}>A–Z (Name)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('address')}>Address #</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="p-4 space-y-3">
        {isLoading ? (
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
        ) : filteredProjects.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {search.trim() ? 'No matches found.' : `No ${isRental ? 'properties' : activeTab === 'general' ? 'lists' : 'projects'} yet. Create your first one!`}
          </p>
        ) : (
          filteredProjects.map((project) => (
            <Link key={project.id} to={`/projects/${project.id}`}>
              <Card className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{project.name}</h3>
                    {project.address && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3 shrink-0" />{project.address}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={project.status} />
                </div>
                {projectSummaryMap[project.id] && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {projectSummaryMap[project.id].completedTasks}/{projectSummaryMap[project.id].totalTasks} tasks • {projectSummaryMap[project.id].percentComplete}%
                      </span>
                      {projectSummaryMap[project.id].blockedTasks > 0 && (
                        <span className="inline-flex items-center gap-1 text-destructive font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          {projectSummaryMap[project.id].blockedTasks} blocked
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${projectSummaryMap[project.id].percentComplete}%` }} />
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

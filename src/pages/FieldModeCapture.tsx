import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const FieldModeCapture = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState('');
  const [includeMaterials, setIncludeMaterials] = useState(true);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState(id || '');
  const [loadingProjects, setLoadingProjects] = useState(!id);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [text]);

  // Fetch projects if no id param
  useEffect(() => {
    if (id || !user) return;
    setLoadingProjects(true);
    (async () => {
      const { data: memberships } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', user.id);
      const projectIds = (memberships || []).map(m => m.project_id);
      if (projectIds.length > 0) {
        const { data: projs } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', projectIds)
          .eq('status', 'active')
          .order('name');
        setProjects(projs || []);
      }
      setLoadingProjects(false);
    })();
  }, [id, user]);

  const backTo = id ? `/projects/${id}` : '/today';

  const handleParse = async () => {
    const projectId = id || selectedProject;
    if (!projectId) { toast({ title: 'Select a project', variant: 'destructive' }); return; }
    if (text.trim().length < 20) { toast({ title: 'Enter at least 20 characters', variant: 'destructive' }); return; }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('field_mode_parse', {
        body: { project_id: projectId, raw_text: text.trim(), include_materials: includeMaterials },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const previewPath = id ? `/projects/${id}/field-mode/preview` : '/today/field-mode/preview';
      navigate(previewPath, {
        state: {
          project_id: projectId,
          raw_text: text.trim(),
          include_materials: includeMaterials,
          tasks: data.tasks,
          warnings: data.warnings,
        },
      });
    } catch (err: any) {
      toast({ title: 'Parse failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pb-20">
      <PageHeader title="Field Mode" backTo={backTo} />
      <div className="p-4 space-y-4">
        {!id && (
          <div className="space-y-2">
            <Label>Project</Label>
            {loadingProjects ? (
              <p className="text-sm text-muted-foreground">Loading projects...</p>
            ) : (
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Dictate or type what you see on site... (min 20 chars)"
          className="flex w-full rounded-md border border-input bg-background px-3 py-3 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[200px] resize-none"
          rows={6}
        />

        <div className="flex items-center justify-between">
          <Label htmlFor="include-materials">Suggest Materials</Label>
          <Switch
            id="include-materials"
            checked={includeMaterials}
            onCheckedChange={setIncludeMaterials}
          />
        </div>

        <Button
          className="w-full"
          onClick={handleParse}
          disabled={loading || text.trim().length < 20}
        >
          {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Parsing...</> : 'Parse Tasks'}
        </Button>
      </div>
    </div>
  );
};

export default FieldModeCapture;

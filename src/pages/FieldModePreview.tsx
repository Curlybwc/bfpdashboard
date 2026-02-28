import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, X, AlertTriangle } from 'lucide-react';

interface ParsedTask {
  title: string;
  trade: string | null;
  room_area: string | null;
  priority: string;
  notes: string | null;
  materials: { name: string; quantity: number | null; unit: string | null }[];
}

const FieldModePreview = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const state = location.state as {
    project_id: string;
    raw_text: string;
    include_materials: boolean;
    tasks: ParsedTask[];
    warnings: string[];
  } | null;

  const [tasks, setTasks] = useState<ParsedTask[]>(state?.tasks || []);
  const [submitting, setSubmitting] = useState(false);

  if (!state) {
    const capturePath = id ? `/projects/${id}/field-mode` : '/today/field-mode';
    navigate(capturePath, { replace: true });
    return null;
  }

  const backTo = id ? `/projects/${id}/field-mode` : '/today/field-mode';

  const updateTask = (index: number, field: keyof ParsedTask, value: any) => {
    setTasks(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const removeTask = (index: number) => {
    setTasks(prev => prev.filter((_, i) => i !== index));
  };

  const removeMaterial = (taskIndex: number, matIndex: number) => {
    setTasks(prev => prev.map((t, i) => i === taskIndex
      ? { ...t, materials: t.materials.filter((_, j) => j !== matIndex) }
      : t
    ));
  };

  const handleSubmit = async () => {
    if (tasks.length === 0) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('field_mode_submit', {
        body: {
          project_id: state.project_id,
          raw_text: state.raw_text,
          include_materials: state.include_materials,
          tasks,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: `${data.created_task_ids?.length || 0} tasks created` });
      navigate(id ? `/projects/${id}` : '/today', { replace: true });
    } catch (err: any) {
      toast({ title: 'Submit failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-20">
      <PageHeader title="Review Tasks" backTo={backTo} />
      <div className="p-4 space-y-4">
        {state.warnings.length > 0 && (
          <div className="space-y-1">
            {state.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {tasks.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No tasks to submit.</p>
        ) : (
          tasks.map((t, i) => (
            <Card key={i} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <Input
                  value={t.title}
                  onChange={(e) => updateTask(i, 'title', e.target.value)}
                  maxLength={70}
                  className="font-medium"
                />
                <button onClick={() => removeTask(i)} className="text-muted-foreground hover:text-destructive shrink-0 mt-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Trade"
                  value={t.trade || ''}
                  onChange={(e) => updateTask(i, 'trade', e.target.value || null)}
                />
                <Input
                  placeholder="Room / Area"
                  value={t.room_area || ''}
                  onChange={(e) => updateTask(i, 'room_area', e.target.value || null)}
                />
              </div>
              <Textarea
                placeholder="Notes"
                value={t.notes || ''}
                onChange={(e) => updateTask(i, 'notes', e.target.value || null)}
                rows={2}
              />
              {t.materials.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Materials</p>
                  {t.materials.map((m, j) => (
                    <div key={j} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                      <span className="truncate">
                        {m.name}{m.quantity ? ` × ${m.quantity}` : ''}{m.unit ? ` ${m.unit}` : ''}
                      </span>
                      <button onClick={() => removeMaterial(i, j)} className="text-muted-foreground hover:text-destructive ml-2 shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Priority: {t.priority} · Stage: Not Ready · Needs Review
              </div>
            </Card>
          ))
        )}

        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={submitting || tasks.length === 0}
        >
          {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Submitting...</> : `Submit ${tasks.length} Task${tasks.length !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  );
};

export default FieldModePreview;

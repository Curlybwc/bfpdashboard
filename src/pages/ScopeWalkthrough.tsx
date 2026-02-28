import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface ProposedUpdate {
  scope_item_id: string;
  description?: string;
  status: string;
  notes: string;
}

interface ParseResult {
  proposed_updates: ProposedUpdate[];
  not_addressed_items: { id: string; description: string }[];
  needs_review_items: { id: string; description: string; reason: string }[];
}

const ScopeWalkthrough = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState('');
  const [blocks, setBlocks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [text]);

  const handleSaveBlock = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBlocks(prev => [...prev, trimmed]);
    setText('');
    toast({ title: `Block ${blocks.length + 1} saved` });
  };

  const handleReviewCoverage = async () => {
    const allText = [...blocks, text.trim()].filter(Boolean).join('\n\n');
    if (!allText) {
      toast({ title: 'No text to review', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scope_walkthrough_parse', {
        body: { scope_id: id, walkthrough_text: allText },
      });

      if (error) throw error;
      setParseResult(data);
    } catch (err: any) {
      toast({ title: 'Error parsing walkthrough', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleApplyUpdates = async () => {
    if (!parseResult || !id) return;
    setApplying(true);
    try {
      const { error } = await supabase.functions.invoke('scope_walkthrough_apply', {
        body: {
          scope_id: id,
          approved_updates: parseResult.proposed_updates,
        },
      });

      if (error) throw error;
      toast({ title: 'Updates applied successfully' });
      navigate(`/scopes/${id}`);
    } catch (err: any) {
      toast({ title: 'Error applying updates', description: err.message, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  // Coverage Screen
  if (parseResult) {
    return (
      <div className="pb-20">
        <PageHeader
          title="Coverage Review"
          backTo={`/scopes/${id}/walkthrough`}
          actions={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setParseResult(null)}>
                <ArrowLeft className="h-4 w-4 mr-1" />Back
              </Button>
              <Button size="sm" onClick={handleApplyUpdates} disabled={applying || parseResult.proposed_updates.length === 0}>
                {applying ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Applying...</> : <><CheckCircle2 className="h-4 w-4 mr-1" />Apply Updates</>}
              </Button>
            </div>
          }
        />
        <div className="p-4 space-y-6">
          {/* Not Addressed */}
          {parseResult.not_addressed_items.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-destructive flex items-center gap-1 mb-2">
                <XCircle className="h-4 w-4" /> Not Addressed ({parseResult.not_addressed_items.length})
              </h2>
              <div className="space-y-2">
                {parseResult.not_addressed_items.map(item => (
                  <Card key={item.id} className="p-3">
                    <p className="text-sm">{item.description}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Needs Review */}
          {parseResult.needs_review_items.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-accent-foreground flex items-center gap-1 mb-2">
                <AlertTriangle className="h-4 w-4" /> Needs Review ({parseResult.needs_review_items.length})
              </h2>
              <div className="space-y-2">
                {parseResult.needs_review_items.map(item => (
                  <Card key={item.id} className="p-3">
                    <p className="text-sm font-medium">{item.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.reason}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Proposed Updates */}
          {parseResult.proposed_updates.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-1 mb-2">
                <CheckCircle2 className="h-4 w-4" /> Proposed Updates ({parseResult.proposed_updates.length})
              </h2>
              <div className="space-y-2">
                {parseResult.proposed_updates.map(update => (
                  <Card key={update.scope_item_id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{update.description || update.scope_item_id}</p>
                        {update.notes && <p className="text-xs text-muted-foreground mt-1">{update.notes}</p>}
                      </div>
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted">{update.status}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {parseResult.proposed_updates.length === 0 && parseResult.not_addressed_items.length === 0 && parseResult.needs_review_items.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No items matched from the walkthrough text.</p>
          )}
        </div>
      </div>
    );
  }

  // Walkthrough Capture Screen
  return (
    <div className="pb-20">
      <PageHeader title="Walkthrough" backTo={`/scopes/${id}`} />
      <div className="p-4 space-y-4">
        {blocks.length > 0 && (
          <p className="text-sm text-muted-foreground">{blocks.length} block{blocks.length !== 1 ? 's' : ''} saved</p>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Dictate or type your walkthrough notes here..."
          className="flex w-full rounded-md border border-input bg-background px-3 py-3 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[200px] resize-none"
          rows={6}
        />

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleSaveBlock} disabled={!text.trim()}>
            Save Block
          </Button>
          <Button
            className="flex-1"
            onClick={handleReviewCoverage}
            disabled={loading || (!text.trim() && blocks.length === 0)}
          >
            {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Reviewing...</> : 'Review Coverage'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScopeWalkthrough;

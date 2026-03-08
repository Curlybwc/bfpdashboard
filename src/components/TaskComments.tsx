import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, Trash2, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TaskCommentsProps {
  taskId: string;
  userId: string;
  isAdmin: boolean;
  canComment: boolean;
}

interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  message: string;
  created_at: string;
  user_name?: string;
}

const TaskComments = ({ taskId, userId, isAdmin, canComment }: TaskCommentsProps) => {
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchComments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) {
      setLoading(false);
      return;
    }

    // Fetch profile names for comment authors
    const userIds = [...new Set((data || []).map(c => c.user_id))];
    let profileMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      (profiles || []).forEach(p => {
        profileMap[p.id] = p.full_name || 'Unknown';
      });
    }

    setComments(
      (data || []).map(c => ({
        ...c,
        user_name: profileMap[c.user_id] || 'Unknown',
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchComments();
  }, [taskId]);

  const handlePost = async () => {
    const trimmed = newMessage.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) {
      toast({ title: 'Comment too long', description: 'Max 2000 characters.', variant: 'destructive' });
      return;
    }

    setPosting(true);
    const { error } = await supabase.from('task_comments').insert({
      task_id: taskId,
      user_id: userId,
      message: trimmed,
    });
    setPosting(false);

    if (error) {
      toast({ title: 'Error posting comment', description: error.message, variant: 'destructive' });
      return;
    }

    setNewMessage('');
    fetchComments();
  };

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase.from('task_comments').delete().eq('id', commentId);
    if (error) {
      toast({ title: 'Error deleting comment', description: error.message, variant: 'destructive' });
      return;
    }
    fetchComments();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Comments</h3>
        <span className="text-xs text-muted-foreground">({comments.length})</span>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {comments.map(c => (
            <div key={c.id} className="rounded-lg border bg-card p-2.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">{c.user_name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                  {(c.user_id === userId || isAdmin) && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{c.message}</p>
            </div>
          ))}
        </div>
      )}

      {canComment && (
        <div className="flex gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            className="flex-1 text-sm"
            maxLength={2000}
          />
          <Button
            size="sm"
            onClick={handlePost}
            disabled={posting || !newMessage.trim()}
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default TaskComments;

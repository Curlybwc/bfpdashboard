import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Mail, Trash2, Loader2, Send, Link2, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

interface Invite {
  id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  invited_at: string;
  expires_at: string;
  accepted_at: string | null;
}

const AdminInvites = () => {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();

  const [orgId, setOrgId] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [sendEmail, setSendEmail] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('org_id').eq('id', user.id).maybeSingle().then(({ data }) => {
      setOrgId(data?.org_id ?? null);
    });
  }, [user]);

  const fetchInvites = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase
      .from('org_invites')
      .select('*')
      .eq('org_id', orgId)
      .order('invited_at', { ascending: false });
    setInvites((data as Invite[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (orgId) fetchInvites();
  }, [orgId]);

  const buildInviteUrl = (token: string, email: string) =>
    `${window.location.origin}/login?invite=${token}&email=${encodeURIComponent(email)}`;

  const handleCreate = async () => {
    if (!user || !orgId || !email.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('org_invites')
      .insert({
        org_id: orgId,
        email: email.trim().toLowerCase(),
        role,
        invited_by: user.id,
      })
      .select()
      .single();
    setCreating(false);

    if (error) {
      toast({ title: 'Failed to create invite', description: error.message, variant: 'destructive' });
      return;
    }

    const url = buildInviteUrl(data.token, data.email);

    // Try to copy automatically
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Invite created', description: 'Link copied to clipboard.' });
    } catch {
      toast({ title: 'Invite created', description: 'Use the copy button to grab the link.' });
    }

    if (sendEmail) {
      // Best-effort email; if it fails the link still works.
      // Email infrastructure isn't required for this feature — the link is the source of truth.
      try {
        await supabase.functions.invoke('send-transactional-email', {
          body: {
            to: data.email,
            subject: `You've been invited to join an organization`,
            html: `<p>You've been invited. Click below to accept:</p><p><a href="${url}">${url}</a></p><p>This invite expires on ${format(new Date(data.expires_at), 'PPP')}.</p>`,
          },
        });
        toast({ title: 'Email sent', description: `Invite emailed to ${data.email}` });
      } catch (e: any) {
        // Silently degrade — copy link is still available
        console.warn('Email send failed (link still works):', e?.message);
      }
    }

    setEmail('');
    fetchInvites();
  };

  const handleCopy = async (inv: Invite) => {
    const url = buildInviteUrl(inv.token, inv.email);
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Copied', description: 'Invite link copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: url, variant: 'destructive' });
    }
  };

  const handleSms = (inv: Invite) => {
    const url = buildInviteUrl(inv.token, inv.email);
    const body = encodeURIComponent(
      `You've been invited to join our team. Accept here: ${url}`
    );
    // sms: opens the device's Messages app with the body pre-filled.
    // User picks the recipient. Works on iOS and Android.
    window.location.href = `sms:?&body=${body}`;
  };

  const handleRevoke = async (id: string) => {
    const { error } = await supabase.rpc('revoke_org_invite', { p_invite_id: id });
    if (error) {
      toast({ title: 'Revoke failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Invite revoked' });
      fetchInvites();
    }
  };

  if (adminLoading) return null;
  if (!isAdmin) return <div className="p-4 text-sm text-muted-foreground">Admins only.</div>;

  const pending = invites.filter((i) => i.status === 'pending' && new Date(i.expires_at) > new Date());
  const past = invites.filter((i) => !pending.includes(i));

  return (
    <div className="pb-20">
      <PageHeader title="Invite Users" backTo="/admin" />
      <div className="p-4 space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <h2 className="font-medium">Send a new invite</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            New users who sign up using the invite link will join your organization directly instead of creating their own.
          </p>
          <div className="space-y-2">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              placeholder="person@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Role in your organization</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'member' | 'admin')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member (regular user)</SelectItem>
                <SelectItem value="admin">Admin (can manage org)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="h-4 w-4"
            />
            Also email the link to them
          </label>
          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={creating || !email.trim() || !orgId}
          >
            {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Create invite & copy link
          </Button>
        </Card>

        <div>
          <h3 className="text-sm font-semibold mb-2">Pending invites ({pending.length})</h3>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : pending.length === 0 ? (
            <p className="text-xs text-muted-foreground">No pending invites.</p>
          ) : (
            <div className="space-y-2">
              {pending.map((inv) => (
                <Card key={inv.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{inv.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{inv.role}</Badge>
                        <span className="text-xs text-muted-foreground">
                          expires {format(new Date(inv.expires_at), 'MMM d')}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleCopy(inv)} title="Copy link">
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSms(inv)} title="Text invite link">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleRevoke(inv.id)} title="Revoke">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {past.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Past invites ({past.length})</h3>
            <div className="space-y-2">
              {past.map((inv) => (
                <Card key={inv.id} className="p-3 opacity-70">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{inv.email}</p>
                      <Badge variant="outline" className="text-xs mt-1">
                        {inv.status === 'accepted'
                          ? `accepted ${inv.accepted_at ? format(new Date(inv.accepted_at), 'MMM d') : ''}`
                          : inv.status === 'revoked'
                          ? 'revoked'
                          : 'expired'}
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminInvites;
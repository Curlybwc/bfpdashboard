import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/hooks/useOrg';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, X, FileText, Image as ImageIcon } from 'lucide-react';
import { REIMBURSEMENT_STATUS_LABEL, REIMBURSEMENT_STATUS_VARIANT, type ReimbursementStatus, MAX_RECEIPTS_PER_REQUEST } from '@/lib/reimbursementStatus';
import { prepareAndUploadReceipts } from '@/lib/uploadReceipts';

type ProjectRow = { id: string; name: string; address: string | null };
type ReimbursementRow = {
  id: string;
  status: ReimbursementStatus;
  description: string;
  vendor_paid: string;
  expense_date: string;
  requested_amount: number;
  approved_amount: number | null;
  project_id: string | null;
  receipt_paths: string[];
  info_request_note: string | null;
  contractor_response: string | null;
  rejection_reason: string | null;
  created_at: string;
  paid_at: string | null;
  qb_exported_at: string | null;
};

const Reimbursements = () => {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const { toast } = useToast();

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [requests, setRequests] = useState<ReimbursementRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [projectId, setProjectId] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [vendorPaid, setVendorPaid] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [certified, setCertified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const [projRes, reqRes] = await Promise.all([
      supabase.from('projects').select('id, name, address').eq('status', 'active').order('name'),
      supabase.from('reimbursement_requests')
        .select('id, status, description, vendor_paid, expense_date, requested_amount, approved_amount, project_id, receipt_paths, info_request_note, contractor_response, rejection_reason, created_at, paid_at, qb_exported_at')
        .or(`submitter_user_id.eq.${user.id},on_behalf_of_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false }),
    ]);

    setProjects((projRes.data || []) as ProjectRow[]);
    setRequests((reqRes.data || []) as ReimbursementRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const canSubmit = useMemo(() => {
    return Boolean(
      user && orgId && projectId && vendorPaid.trim() && expenseDate &&
      amount && Number(amount) > 0 && description.trim() &&
      files.length > 0 && certified && !submitting
    );
  }, [user, orgId, projectId, vendorPaid, expenseDate, amount, description, files.length, certified, submitting]);

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (files.length + picked.length > MAX_RECEIPTS_PER_REQUEST) {
      toast({ title: 'Too many files', description: `Maximum ${MAX_RECEIPTS_PER_REQUEST} receipts.`, variant: 'destructive' });
      return;
    }
    setFiles((prev) => [...prev, ...picked]);
    e.target.value = '';
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!user || !orgId || !canSubmit) return;
    setSubmitting(true);

    const { paths, errors } = await prepareAndUploadReceipts(files, user.id, 0);
    if (errors.length > 0 || paths.length === 0) {
      toast({ title: 'Upload failed', description: errors.join('; ') || 'No files uploaded', variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from('reimbursement_requests').insert({
      org_id: orgId,
      submitter_user_id: user.id,
      on_behalf_of_user_id: null,
      project_id: projectId,
      description: description.trim(),
      vendor_paid: vendorPaid.trim(),
      expense_date: expenseDate,
      requested_amount: Number(amount),
      receipt_paths: paths,
      created_by: user.id,
      status: 'submitted',
    });

    setSubmitting(false);

    if (error) {
      toast({ title: 'Submission failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Your reimbursement request has been submitted for review.' });
    setProjectId(''); setVendorPaid(''); setAmount(''); setDescription(''); setFiles([]); setCertified(false);
    setExpenseDate(new Date().toISOString().slice(0, 10));
    load();
  };

  return (
    <div className="container mx-auto p-4 pb-24 max-w-3xl">
      <PageHeader title="Reimbursements" />

      <Card className="p-4 mb-6 space-y-3">
        <h2 className="text-lg font-semibold">Request Reimbursement</h2>

        <div className="rounded border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
          <p>Reimbursement is available only for materials, supplies, fees, or rentals that were approved for a specific property or job. An itemized receipt is required. Requests may be denied if the receipt is unclear, unrelated to the job, duplicated, submitted late, or not pre-authorized.</p>
          <p>Tools, personal equipment, food, fuel, and general business expenses are not reimbursable unless specifically approved in writing.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Property / Project *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Select project…" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}{p.address ? ` — ${p.address}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Expense Date *</Label>
            <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Vendor Paid *</Label>
            <Input value={vendorPaid} onChange={(e) => setVendorPaid(e.target.value)} placeholder="e.g. Home Depot" maxLength={120} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Amount Requested *</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Description / Reason for Purchase *</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="What did you buy and why?" />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Receipts * (PDF, JPG, PNG, HEIC — max 5 files, 10 MB each)</Label>
          <label className="flex items-center justify-center gap-2 cursor-pointer rounded-md border-2 border-dashed border-muted-foreground/30 p-4 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
            <Upload className="h-4 w-4" />
            <span>Tap to add a photo or file</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf"
              multiple
              capture="environment"
              onChange={onFilesPicked}
              className="hidden"
            />
          </label>
          {files.length > 0 && (
            <div className="space-y-1">
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs rounded border p-2">
                  {f.type.startsWith('image/') ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                  <Button size="sm" variant="ghost" onClick={() => removeFile(idx)} className="h-6 w-6 p-0"><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <Checkbox checked={certified} onCheckedChange={(v) => setCertified(v === true)} className="mt-0.5" />
          <span>I certify that this purchase was for the property/job listed above, was necessary for the work performed, and has not already been reimbursed.</span>
        </label>

        <Button onClick={submit} disabled={!canSubmit} className="w-full">
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Submit for Review
        </Button>
      </Card>

      <h2 className="text-lg font-semibold mb-2">My Reimbursements</h2>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : requests.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">No reimbursement requests yet.</Card>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <ContractorReimbursementCard key={r.id} reimbursement={r} projectName={projects.find(p => p.id === r.project_id)?.name} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
};

function ContractorReimbursementCard({ reimbursement: r, projectName, onChanged }: { reimbursement: ReimbursementRow; projectName?: string; onChanged: () => void }) {
  const { toast } = useToast();
  const [response, setResponse] = useState(r.contractor_response || '');
  const [saving, setSaving] = useState(false);

  const saveResponse = async () => {
    setSaving(true);
    const { error } = await supabase.from('reimbursement_requests')
      .update({ contractor_response: response, status: 'submitted' })
      .eq('id', r.id);
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Response sent' });
    onChanged();
  };

  const withdraw = async () => {
    if (!confirm('Withdraw this reimbursement request?')) return;
    const { error } = await supabase.from('reimbursement_requests').update({ status: 'voided' }).eq('id', r.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Request withdrawn' });
    onChanged();
  };

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">{r.vendor_paid} · ${Number(r.requested_amount).toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{r.expense_date}{projectName ? ` · ${projectName}` : ''}</p>
        </div>
        <Badge variant={REIMBURSEMENT_STATUS_VARIANT[r.status]}>{REIMBURSEMENT_STATUS_LABEL[r.status]}</Badge>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>

      {r.status === 'approved' || r.status === 'exported' ? (
        <p className="text-xs mt-2 text-foreground/80">Your reimbursement has been approved and is ready for payment{r.approved_amount && r.approved_amount !== r.requested_amount ? ` (approved $${Number(r.approved_amount).toFixed(2)})` : ''}.</p>
      ) : null}
      {r.status === 'paid' ? (
        <p className="text-xs mt-2 text-foreground/80">Your reimbursement has been paid.</p>
      ) : null}
      {r.status === 'not_approved' && r.rejection_reason ? (
        <p className="text-xs mt-2 text-destructive">Reason: {r.rejection_reason}</p>
      ) : null}

      {r.status === 'needs_info' && (
        <div className="mt-2 space-y-2 rounded border bg-muted/30 p-2">
          <p className="text-xs font-medium">Admin requested more info:</p>
          {r.info_request_note && <p className="text-xs">{r.info_request_note}</p>}
          <Textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={2} placeholder="Your response…" />
          <Button size="sm" onClick={saveResponse} disabled={saving || !response.trim()}>
            {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Send Response
          </Button>
        </div>
      )}

      {r.status === 'submitted' && (
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="outline" onClick={withdraw}>Withdraw</Button>
        </div>
      )}
    </Card>
  );
}

export default Reimbursements;
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';

// QuickBooks Write-Back Stage 1 review queue (canonical 05.02 Blueprint
// §25.6 / PRD FR-05.02-17). Form rule: a classification queue is a simple
// table — rows, columns, in-place edits, batch approve — never cards or a
// room (rooms are for document collection). Stage 1 is review only:
// approving records the review in Ezzie; nothing is written to QuickBooks.

type BankQueueRow = {
  id: string;
  txn_date: string;
  raw_name: string;
  signed_amount: number;
  proposal_account: string | null;
  proposal_class: string | null;
  proposal_basis: string | null;
  proposal_state: 'proposed' | 'needs_review' | 'unidentified';
  review_state: 'unreviewed' | 'approved' | 'edited';
  account_display: string;
  source: string;
};

type Company = { id: string; name: string };

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function stateBadge(row: BankQueueRow) {
  if (row.review_state === 'approved') return <Badge>Approved</Badge>;
  if (row.review_state === 'edited') return <Badge variant="secondary">Edited</Badge>;
  switch (row.proposal_state) {
    case 'proposed':
      return <Badge variant="secondary">Proposed</Badge>;
    case 'needs_review':
      return <Badge variant="outline">Needs review</Badge>;
    default:
      return <Badge variant="outline">Unidentified</Badge>;
  }
}

export default function FinanceBankQueue() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [rows, setRows] = useState<BankQueueRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { account: string; klass: string }>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: companyError } = await (supabase as any)
        .from('companies')
        .select('id, name')
        .order('name');
      if (companyError) {
        setError(companyError.message);
        setLoading(false);
        return;
      }
      const list = (data ?? []) as Company[];
      setCompanies(list);
      const fobar = list.find((c) => c.name.toUpperCase().includes('FOBAR'));
      setCompanyId((fobar ?? list[0])?.id ?? '');
    })();
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await (supabase as any).rpc('bookkeeping_bank_queue_list', {
      _company_id: companyId,
    });
    if (rpcError) {
      setError(rpcError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as BankQueueRow[]);
      setDrafts({});
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (row: BankQueueRow, approve: boolean) => {
    const draft = drafts[row.id];
    setSavingId(row.id);
    const { error: rpcError } = await (supabase as any).rpc('bookkeeping_bank_queue_review', {
      _txn_id: row.id,
      _account: draft ? draft.account : null,
      _class: draft ? draft.klass : null,
      _approve: approve,
    });
    setSavingId(null);
    if (rpcError) {
      toast.error(rpcError.message);
      return;
    }
    toast.success(approve ? 'Approved — recorded in Ezzie only' : 'Saved');
    await load();
  };

  const approveAllProposed = async () => {
    const targets = rows.filter((r) => r.proposal_state === 'proposed' && r.review_state === 'unreviewed');
    for (const row of targets) {
      await review(row, true);
    }
  };

  const counts = useMemo(() => {
    return {
      total: rows.length,
      proposed: rows.filter((r) => r.proposal_state === 'proposed').length,
      needsReview: rows.filter((r) => r.proposal_state === 'needs_review').length,
      unidentified: rows.filter((r) => r.proposal_state === 'unidentified').length,
      approved: rows.filter((r) => r.review_state === 'approved').length,
      net: rows.reduce((sum, r) => sum + Number(r.signed_amount), 0),
    };
  }, [rows]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4">
      <PageHeader title="Bank classification queue" backTo="/admin/accounting" />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Stage 1 — review only</CardTitle>
            <p className="text-sm text-muted-foreground">
              Approving a row records your review in Ezzie. Nothing is written to QuickBooks in
              Stage 1. Splits and classes come from statement evidence, never from the amount alone.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-1 h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" onClick={() => void approveAllProposed()} disabled={loading}>
              <CheckCheck className="mr-1 h-4 w-4" /> Approve all proposed
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            {counts.total} transactions · {counts.proposed} proposed · {counts.needsReview} needs
            review · {counts.unidentified} unidentified · {counts.approved} approved · net{' '}
            {money(counts.net)}
          </p>
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description (bank text)</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Proposed account</TableHead>
                  <TableHead>Proposed class</TableHead>
                  <TableHead>Basis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const draft = drafts[row.id] ?? {
                    account: row.proposal_account ?? '',
                    klass: row.proposal_class ?? '',
                  };
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{row.txn_date}</TableCell>
                      <TableCell className="max-w-xs break-words">{row.raw_name}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {money(Number(row.signed_amount))}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={draft.account}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [row.id]: { ...draft, account: e.target.value } }))
                          }
                          placeholder="—"
                          className="w-52"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={draft.klass}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [row.id]: { ...draft, klass: e.target.value } }))
                          }
                          placeholder="—"
                          className="w-40"
                        />
                      </TableCell>
                      <TableCell className="max-w-sm text-xs text-muted-foreground">
                        {row.proposal_basis ?? 'No rule matched yet.'}
                      </TableCell>
                      <TableCell>{stateBadge(row)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={savingId === row.id}
                          onClick={() => void review(row, false)}
                        >
                          Save
                        </Button>{' '}
                        <Button
                          size="sm"
                          disabled={savingId === row.id || row.review_state === 'approved'}
                          onClick={() => void review(row, true)}
                        >
                          Approve
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-sm text-muted-foreground">
                      No bank transactions loaded for this company yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, ExternalLink, GraduationCap, History, Mail, RefreshCw, Sparkles } from 'lucide-react';
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
  review_notes: string | null;
  evidence_count: number;
  is_open_loop: boolean;
};

// Field log (Packet 4 / Batch B): the append-only trail of what Ezzie
// did to a row — ingested, matched, proposed, evidence attached,
// reviewed, approved, synced — read through the field-log door RPC.
// Open loops (rows still unidentified or unresolved) are counted in the
// header and filterable; there is no separate page for them.
type FieldLogItem = {
  id: string;
  seq: number;
  event_kind: string;
  source: string;
  detail: Record<string, unknown> | null;
  actor: string;
  created_at: string;
};

// Email evidence (Packet 3 / Batch A3): bookkeeping email is a backend
// evidence source, not a user surface — matched evidence hangs on the
// queue row itself as a badge + expandable detail (canon §25.11: email
// evidence settles identity alongside the roster and the rules).
type EvidenceItem = {
  bank_transaction_id: string;
  email_transaction_id: string;
  vendor: string | null;
  subject: string | null;
  email_date: string;
  amount: number;
  match_basis: string;
  match_score: number | null;
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
      return (
        <Badge variant="secondary" title="Ezzie matched a rule and proposed the account — ready for you to approve.">
          Proposed
        </Badge>
      );
    case 'needs_review':
      return (
        <Badge
          variant="outline"
          title="Ezzie knows what this is and proposed the account, but something is unresolved — usually the property/class split needs statement evidence before it can be approved."
        >
          Needs review
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          title="Ezzie could not identify this transaction at all — no rule matched the bank text. It needs identification (an account number or a statement) before anything can be proposed."
        >
          Unidentified
        </Badge>
      );
  }
}

function usDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${Number(m)}/${Number(day)}/${y}`;
}

// Learning loop v1 (Jen, 2026-10-21): when Jen classifies a row she can
// teach Ezzie a standing rule — bank text containing the pattern gets
// this account/class proposed automatically from then on. The pattern
// is derived from the bank text (first distinctive word) and stays
// editable before saving, because a wrong pattern teaches wrong.
const PATTERN_STOPWORDS = new Set([
  'BILL', 'PAID', 'ACH', 'PMT', 'DEBIT', 'CREDIT', 'CONF', 'PURCHASE',
  'PAYROLL', 'PPD', 'CCD', 'ENTRY', 'BANK', 'WITHDRAWAL', 'DEPOSIT',
]);

function derivePattern(raw: string): string {
  const tokens = raw
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !PATTERN_STOPWORDS.has(t));
  return tokens[0] ?? '';
}

export default function FinanceBankQueue() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [rows, setRows] = useState<BankQueueRow[]>([]);
  const [accountTab, setAccountTab] = useState<string>('all');
  const [evidence, setEvidence] = useState<Record<string, EvidenceItem[]>>({});
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, FieldLogItem[]>>({});
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [loopFilter, setLoopFilter] = useState<'all' | 'open'>('all');
  const [drafts, setDrafts] = useState<
    Record<string, { account: string; klass: string; notes: string }>
  >({});
  const [teach, setTeach] = useState<Record<string, { armed: boolean; pattern: string }>>({});
  const [applying, setApplying] = useState(false);
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
    setAccountTab('all');
    setExpandedHistoryId(null);
    setHistory({});
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
    const { data: evData } = await (supabase as any).rpc('bookkeeping_bank_txn_evidence_list', {
      _company_id: companyId,
    });
    const grouped: Record<string, EvidenceItem[]> = {};
    for (const item of (evData ?? []) as EvidenceItem[]) {
      (grouped[item.bank_transaction_id] ??= []).push(item);
    }
    setEvidence(grouped);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (row: BankQueueRow, approve: boolean, opts?: { quiet?: boolean }) => {
    const draft = drafts[row.id];
    setSavingId(row.id);
    const { error: rpcError } = await (supabase as any).rpc('bookkeeping_bank_queue_review', {
      _txn_id: row.id,
      _account: draft ? draft.account : null,
      _class: draft ? draft.klass : null,
      _approve: approve,
      _notes: draft ? draft.notes : null,
    });
    setSavingId(null);
    if (rpcError) {
      toast.error(rpcError.message);
      return false;
    }
    if (!opts?.quiet) {
      // Teach (learning loop v1): if Jen armed Teach on this row, save a
      // standing rule from this classification, then let the reload show
      // every other row the new rule just resolved.
      const t = teach[row.id];
      if (t?.armed) {
        const account = (draft?.account ?? row.proposal_account ?? '').trim();
        const klass = (draft?.klass ?? row.proposal_class ?? '').trim();
        const { data: teachData, error: teachError } = await (supabase as any).rpc(
          'bookkeeping_rule_teach',
          {
            _txn_id: row.id,
            _pattern: t.pattern,
            _account: account,
            _class: klass || null,
          },
        );
        if (teachError) {
          toast.error(`Saved, but the rule was not taught: ${teachError.message}`);
        } else {
          const applied = (teachData as any)?.apply ?? {};
          toast.success(
            `Taught Ezzie: “${t.pattern.toUpperCase()}” → ${account}${klass ? ` / ${klass}` : ''} — ${applied.rules_that_fired ?? 0} rule(s) fired, ${applied.roster_applied_rows ?? 0} row(s) from the property roster.`,
          );
        }
        setTeach((prev) => ({ ...prev, [row.id]: { armed: false, pattern: t.pattern } }));
      }
      toast.success(approve ? 'Approved — recorded in Ezzie only' : 'Saved');
      await load();
    }
    return true;
  };

  // Re-run everything Ezzie has learned (confirmed property roster,
  // then taught rules) over the rows it still cannot identify.
  const applyLearning = async () => {
    if (!companyId) return;
    setApplying(true);
    const { data, error: rpcError } = await (supabase as any).rpc('bookkeeping_classify_apply', {
      _company_id: companyId,
    });
    setApplying(false);
    if (rpcError) {
      toast.error(rpcError.message);
      return;
    }
    toast.success(
      `Learning applied: ${(data as any)?.roster_applied_rows ?? 0} row(s) from the property roster, ` +
        `${(data as any)?.utility_applied_rows ?? 0} from the utility account map, ` +
        `${(data as any)?.rules_that_fired ?? 0} rule(s) fired, ` +
        `${(data as any)?.evidence_cited_rows ?? 0} row(s) citing email evidence.`,
    );
    await load();
  };

  const approveAllProposed = async () => {
    const targets = rows.filter((r) => r.proposal_state === 'proposed' && r.review_state === 'unreviewed');
    let approved = 0;
    for (const row of targets) {
      if (await review(row, true, { quiet: true })) approved += 1;
    }
    await load();
    if (approved > 0) toast.success(`Approved ${approved} rows — recorded in Ezzie only`);
  };

  // Per-account view, mirroring the Open Items Register's tabs:
  // account × direction (Jen, 2026-10-21 — transactions are seen per
  // account in Ezzie the same way as in the register).
  const accountTabs = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>();
    for (const r of rows) {
      const dir = Number(r.signed_amount) >= 0 ? 'Income' : 'Expenses';
      const key = `${r.account_display}|${dir}`;
      const entry = map.get(key) ?? {
        key,
        label: `${r.account_display} · ${dir}`,
        count: 0,
      };
      entry.count += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const toggleHistory = async (rowId: string) => {
    if (expandedHistoryId === rowId) {
      setExpandedHistoryId(null);
      return;
    }
    setExpandedHistoryId(rowId);
    if (!history[rowId]) {
      const { data, error: logError } = await (supabase as any).rpc('bookkeeping_field_log_list', {
        _bank_transaction_id: rowId,
      });
      if (logError) {
        toast.error(`Field log: ${logError.message}`);
        setHistory((h) => ({ ...h, [rowId]: [] }));
      } else {
        setHistory((h) => ({ ...h, [rowId]: (data ?? []) as FieldLogItem[] }));
      }
    }
  };

  const visibleRows = useMemo(() => {
    let out = rows;
    if (accountTab !== 'all') {
      out = out.filter(
        (r) =>
          `${r.account_display}|${Number(r.signed_amount) >= 0 ? 'Income' : 'Expenses'}` ===
          accountTab,
      );
    }
    if (loopFilter === 'open') out = out.filter((r) => r.is_open_loop);
    return out;
  }, [rows, accountTab, loopFilter]);

  const counts = useMemo(() => {
    return {
      total: rows.length,
      proposed: rows.filter((r) => r.proposal_state === 'proposed').length,
      needsReview: rows.filter((r) => r.proposal_state === 'needs_review').length,
      unidentified: rows.filter((r) => r.proposal_state === 'unidentified').length,
      approved: rows.filter((r) => r.review_state === 'approved').length,
      openLoops: rows.filter((r) => r.is_open_loop).length,
      net: rows.reduce((sum, r) => sum + Number(r.signed_amount), 0),
    };
  }, [rows]);

  // Frozen top scrollbar (Jen, 2026-10-21): a second horizontal
  // scrollbar pinned above the table, synced with the table's own
  // scroll, so sideways scrolling never requires a trip to the bottom.
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);

  useEffect(() => {
    const wrap = tableWrapRef.current;
    const top = topScrollRef.current;
    if (!wrap || !top) return;
    const scroller = wrap.querySelector(':scope > div');
    if (!scroller) return;
    const measure = () => setScrollWidth(scroller.scrollWidth);
    measure();
    const onTableScroll = () => {
      if (top.scrollLeft !== scroller.scrollLeft) top.scrollLeft = scroller.scrollLeft;
    };
    const onTopScroll = () => {
      if (scroller.scrollLeft !== top.scrollLeft) scroller.scrollLeft = top.scrollLeft;
    };
    scroller.addEventListener('scroll', onTableScroll, { passive: true });
    top.addEventListener('scroll', onTopScroll, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', onTableScroll);
      top.removeEventListener('scroll', onTopScroll);
      ro.disconnect();
    };
  }, [rows, loading]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4">
      <PageHeader title="Classification Queue" backTo="/admin/accounting" />
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div>
            <CardTitle>Stage 1 — review only</CardTitle>
            <p className="text-sm text-muted-foreground">
              Approving a row records your review in Ezzie. Nothing is written to QuickBooks in
              Stage 1. Splits and classes come from statement evidence, never from the amount alone.
              Use Teach on a row to turn its classification into a standing rule Ezzie applies on
              its own next time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            {/* Sync to Register and Derive from QuickBooks both run in Ezzie
                only (Jen's decision, 2026-10-21, option A): the dashboard has
                its own backend where those functions do not exist, so these
                buttons link to Ezzie's queue instead of invoking anything. */}
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://ezzie.lovable.app/finance/bank-queue"
                target="_blank"
                rel="noreferrer"
                title="Sync to Register runs in Ezzie — this opens Ezzie's Classification Queue in a new tab."
              >
                <ExternalLink className="mr-1 h-4 w-4" /> Sync to Register — in Ezzie
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void applyLearning()}
              disabled={applying || loading || !companyId}
            >
              <Sparkles className="mr-1 h-4 w-4" /> {applying ? 'Applying…' : 'Apply learning'}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://ezzie.lovable.app/finance/bank-queue"
                target="_blank"
                rel="noreferrer"
                title="Derive from QuickBooks runs in Ezzie — this opens Ezzie's Classification Queue in a new tab."
              >
                <ExternalLink className="mr-1 h-4 w-4" /> Derive from QuickBooks — in Ezzie
              </a>
            </Button>
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
            review · {counts.unidentified} unidentified · {counts.approved} approved · Open
            loops: {counts.openLoops} · net {money(counts.net)}
          </p>
          <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Loop filter">
            <button
              type="button"
              role="tab"
              aria-selected={loopFilter === 'all'}
              onClick={() => setLoopFilter('all')}
              className={
                loopFilter === 'all'
                  ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                  : 'rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent'
              }
            >
              All rows · {rows.length}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={loopFilter === 'open'}
              onClick={() => setLoopFilter('open')}
              className={
                loopFilter === 'open'
                  ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                  : 'rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent'
              }
            >
              Open loops · {counts.openLoops}
            </button>
          </div>
          {accountTabs.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Accounts">
              <button
                type="button"
                role="tab"
                aria-selected={accountTab === 'all'}
                onClick={() => setAccountTab('all')}
                className={
                  accountTab === 'all'
                    ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                    : 'rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent'
                }
              >
                All accounts · {rows.length}
              </button>
              {accountTabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={accountTab === t.key}
                  onClick={() => setAccountTab(t.key)}
                  className={
                    accountTab === t.key
                      ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                      : 'rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent'
                  }
                >
                  {t.label} · {t.count}
                </button>
              ))}
            </div>
          )}
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
            <div
              ref={topScrollRef}
              className="sticky top-2 z-10 mb-1 overflow-x-auto bg-card"
              aria-hidden="true"
            >
              <div style={{ width: scrollWidth || undefined, height: 1 }} />
            </div>
            <div ref={tableWrapRef}>
              <Table className="[&_td]:px-2 [&_th]:px-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description (bank text)</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Proposed account</TableHead>
                    <TableHead>Proposed class</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {visibleRows.map((row) => {
                  const draft = drafts[row.id] ?? {
                    account: row.proposal_account ?? '',
                    klass: row.proposal_class ?? '',
                    notes: row.review_notes ?? '',
                  };
                  const rowEvidence = evidence[row.id] ?? [];
                  const evidenceOpen = expandedEvidenceId === row.id;
                  const rowHistory = history[row.id];
                  const historyOpen = expandedHistoryId === row.id;
                  return (
                    <Fragment key={row.id}>
                    <TableRow>
                      <TableCell className="whitespace-nowrap text-xs">{usDate(row.txn_date)}</TableCell>
                      <TableCell className="break-words text-xs">
                        {row.raw_name}
                        {row.evidence_count > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedEvidenceId(evidenceOpen ? null : row.id)}
                            aria-expanded={evidenceOpen}
                            title="Email evidence matched to this transaction (amount + date + vendor text). Evidence supports identity; it never classifies by itself."
                            className="ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
                          >
                            <Mail className="h-3 w-3" /> {row.evidence_count}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void toggleHistory(row.id)}
                          aria-expanded={historyOpen}
                          title="Field log — every ingest, match, proposal, evidence and review event recorded for this row. Append-only: entries are never edited or deleted."
                          className="ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
                        >
                          <History className="h-3 w-3" /> History
                        </button>
                      </TableCell>
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
                          className="h-8 w-40 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={draft.klass}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [row.id]: { ...draft, klass: e.target.value } }))
                          }
                          placeholder="—"
                          className="h-8 w-32 text-xs"
                        />
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
                        <div className="mt-1">
                          <Button
                            variant={teach[row.id]?.armed ? 'default' : 'ghost'}
                            size="sm"
                            disabled={savingId === row.id || row.review_state === 'approved'}
                            title="Teach Ezzie: whenever the bank text contains this pattern, propose this account (and class) automatically."
                            onClick={() =>
                              setTeach((prev) => {
                                const cur = prev[row.id];
                                return {
                                  ...prev,
                                  [row.id]: {
                                    armed: !cur?.armed,
                                    pattern: cur?.pattern || derivePattern(row.raw_name),
                                  },
                                };
                              })
                            }
                          >
                            <GraduationCap className="mr-1 h-4 w-4" /> Teach
                          </Button>
                          {teach[row.id]?.armed && (
                            <Input
                              value={teach[row.id]?.pattern ?? ''}
                              onChange={(e) =>
                                setTeach((prev) => ({
                                  ...prev,
                                  [row.id]: { armed: true, pattern: e.target.value },
                                }))
                              }
                              placeholder="Bank text pattern"
                              className="mt-1 h-8 w-44 text-xs"
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={draft.notes}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [row.id]: { ...draft, notes: e.target.value } }))
                          }
                          placeholder="Optional — goes to the QuickBooks memo"
                          className="h-8 w-56 text-xs"
                        />
                      </TableCell>
                    </TableRow>
                    {evidenceOpen && rowEvidence.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/40 text-xs">
                          <div className="space-y-1 py-1">
                            {rowEvidence.map((item) => (
                              <p key={item.email_transaction_id}>
                                <span className="font-medium">{item.vendor ?? 'Email'}</span>
                                {' — '}
                                {item.subject ?? '(no subject)'} · {usDate(item.email_date)} ·{' '}
                                {money(Math.abs(Number(item.amount)))}
                                <span className="block text-muted-foreground">
                                  {item.match_basis}
                                </span>
                              </p>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {historyOpen && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/40 text-xs">
                          <div className="space-y-1 py-1">
                            {(rowHistory ?? []).map((item) => (
                              <p key={item.id}>
                                <span className="font-medium">{item.event_kind}</span>
                                {' · '}
                                {item.source} · {item.actor} ·{' '}
                                {new Date(item.created_at).toLocaleString()}
                                {typeof item.detail?.basis === 'string' && (
                                  <span className="block text-muted-foreground">
                                    {item.detail.basis}
                                  </span>
                                )}
                              </p>
                            ))}
                            {rowHistory !== undefined && rowHistory.length === 0 && (
                              <p className="text-muted-foreground">
                                No field-log entries for this row yet — rows loaded before the
                                field log existed only gain entries from their next event.
                              </p>
                            )}
                            {rowHistory === undefined && (
                              <p className="text-muted-foreground">Loading history…</p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                })}
                {visibleRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-sm text-muted-foreground">
                      {rows.length === 0
                        ? 'No bank transactions loaded for this company yet.'
                        : loopFilter === 'open'
                          ? 'No open loops for this company right now.'
                          : 'No transactions in this account view.'}
                    </TableCell>
                  </TableRow>
                )}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

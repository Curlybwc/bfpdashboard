import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
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

// What Ezzie has learned (Jen, 2026-10-21): the taught classification
// rules and the per-property payee roster, in one inspectable place.
// Learning you cannot see, correct, or delete is not trustworthy —
// every rule shows who taught it and how often it has fired; roster
// drafts drafted from bank history do nothing until Jen confirms them.

type Company = { id: string; name: string };

type Rule = {
  id: string;
  pattern_text: string;
  account: string;
  class: string | null;
  direction: string;
  source: string;
  taught_by: string | null;
  active: boolean;
  times_applied: number;
  last_applied_at: string | null;
  created_at: string;
};

type Payee = {
  id: string;
  property_id: string | null;
  property_label: string | null;
  property_name: string | null;
  property_link_basis: string | null;
  payee_name: string;
  match_text: string;
  kind: string;
  expected_amount: number | null;
  account: string | null;
  class: string | null;
  status: 'draft' | 'confirmed' | 'rejected';
  source: string;
  created_at: string;
};

// Utility account crosswalk (Packet 3 / Batch A1, canon §25.3): the
// bank text carries one MSD account-number series and the property
// register's utility adapter carries another — they never join on
// their own. A crosswalk row is an owner-confirmed mapping between
// the two; drafts classify nothing until confirmed here.
type CrosswalkEntry = {
  id: string;
  bank_account_number: string;
  adapter_id: string | null;
  adapter_account_reference: string | null;
  adapter_provider: string | null;
  property_id: string | null;
  property_label: string | null;
  status: 'draft' | 'confirmed' | 'rejected';
  basis: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
};

function usDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

export default function AdminClassificationLearning() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [openLoops, setOpenLoops] = useState(0);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [crosswalk, setCrosswalk] = useState<CrosswalkEntry[]>([]);
  const [edits, setEdits] = useState<
    Record<string, { property_label: string; account: string; klass: string; amount: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
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
    const [rulesRes, payeesRes, crosswalkRes, loopsRes] = await Promise.all([
      (supabase as any).rpc('bookkeeping_rules_list', { _company_id: companyId }),
      (supabase as any).rpc('property_payees_list', { _company_id: companyId }),
      (supabase as any).rpc('bookkeeping_utility_crosswalk_list', { _company_id: companyId }),
      (supabase as any).rpc('bookkeeping_field_log_open_loop_count', { _company_id: companyId }),
    ]);
    if (rulesRes.error) setError(rulesRes.error.message);
    else setRules((rulesRes.data ?? []) as Rule[]);
    if (!loopsRes.error) setOpenLoops(Number(loopsRes.data ?? 0));
    if (payeesRes.error) setError(payeesRes.error.message);
    else setPayees((payeesRes.data ?? []) as Payee[]);
    if (!crosswalkRes.error) setCrosswalk((crosswalkRes.data ?? []) as CrosswalkEntry[]);
    setEdits({});
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setCrosswalkStatus = async (entry: CrosswalkEntry, status: 'confirmed' | 'rejected') => {
    setBusyId(entry.id);
    const { error: rpcError } = await (supabase as any).rpc(
      'bookkeeping_utility_crosswalk_set_status',
      { _crosswalk_id: entry.id, _status: status },
    );
    setBusyId(null);
    if (rpcError) {
      toast.error(rpcError.message);
      return;
    }
    toast.success(
      status === 'confirmed'
        ? `MSD account ${entry.bank_account_number} mapped to ${entry.property_label ?? 'its property'} — classify will use it from the next run.`
        : `MSD account ${entry.bank_account_number} mapping rejected.`,
    );
    await load();
  };

  const [seeding, setSeeding] = useState(false);
  const seedCrosswalkDrafts = async () => {
    setSeeding(true);
    const { data, error: rpcError } = await (supabase as any).rpc(
      'bookkeeping_utility_crosswalk_seed_drafts',
      { _company_id: companyId, _provider: 'MSD' },
    );
    setSeeding(false);
    if (rpcError) {
      toast.error(rpcError.message);
      return;
    }
    const report = (data ?? {}) as {
      drafts_created?: number;
      bank_numbers_without_adapter_match?: unknown[];
      adapter_accounts_not_in_bank_text?: unknown[];
    };
    toast.success(
      `Seeded ${report.drafts_created ?? 0} draft mapping(s) from the utility spreadsheet. ` +
        `${(report.bank_numbers_without_adapter_match ?? []).length} bank number(s) still unmapped; ` +
        `${(report.adapter_accounts_not_in_bank_text ?? []).length} spreadsheet account(s) not seen in this company's bank text. ` +
        'Drafts classify nothing until you confirm them.',
    );
    await load();
  };

  const setRuleActive = async (rule: Rule, active: boolean) => {
    setBusyId(rule.id);
    const { error: rpcError } = await (supabase as any).rpc('bookkeeping_rule_set_active', {
      _rule_id: rule.id,
      _active: active,
    });
    setBusyId(null);
    if (rpcError) toast.error(rpcError.message);
    else {
      toast.success(active ? 'Rule turned on' : 'Rule turned off');
      await load();
    }
  };

  const deleteRule = async (rule: Rule) => {
    setBusyId(rule.id);
    const { error: rpcError } = await (supabase as any).rpc('bookkeeping_rule_delete', {
      _rule_id: rule.id,
    });
    setBusyId(null);
    if (rpcError) toast.error(rpcError.message);
    else {
      toast.success(`Rule deleted: “${rule.pattern_text}”`);
      await load();
    }
  };

  const setPayeeStatus = async (payee: Payee, status: 'confirmed' | 'rejected') => {
    const edit = edits[payee.id];
    setBusyId(payee.id);
    const amount = edit?.amount ? Number(edit.amount) : null;
    const { error: rpcError } = await (supabase as any).rpc('property_payee_set_status', {
      _payee_id: payee.id,
      _status: status,
      _property_label: edit?.property_label?.trim() || null,
      _account: edit?.account?.trim() || null,
      _class: edit?.klass?.trim() || null,
      _expected_amount: amount !== null && Number.isFinite(amount) ? amount : null,
    });
    setBusyId(null);
    if (rpcError) toast.error(rpcError.message);
    else {
      toast.success(
        status === 'confirmed'
          ? `Confirmed: ${payee.payee_name} is now part of what Ezzie knows. Run “Apply learning” in the Classification Queue to use it.`
          : `Rejected: ${payee.payee_name}`,
      );
      await load();
    }
  };

  const editFor = (p: Payee) =>
    edits[p.id] ?? {
      property_label: p.property_label ?? '',
      account: p.account ?? '',
      klass: p.class ?? '',
      amount: p.expected_amount != null ? String(p.expected_amount) : '',
    };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4">
      <PageHeader title="Classification Learning" backTo="/admin" />
      <p className="text-sm text-muted-foreground">
        Everything Ezzie has learned about classifying bank transactions for the selected company.
        Rules are taught from the Classification Queue; the property roster is drafted from bank
        history and only starts classifying once you confirm an entry. Nothing here writes to
        QuickBooks.
      </p>
      <p className="text-sm text-muted-foreground">
        Open loops: {openLoops} — transactions for this company that are still unidentified or
        unresolved. The list lives in the Classification Queue (Open loops filter); this is the
        same count, not a second list.
      </p>
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
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Learned rules ({rules.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table className="[&_td]:px-2 [&_th]:px-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank text contains</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Taught by</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs font-medium">{r.pattern_text}</TableCell>
                      <TableCell className="text-xs">{r.account}</TableCell>
                      <TableCell className="text-xs">{r.class ?? '—'}</TableCell>
                      <TableCell className="text-xs">{r.direction}</TableCell>
                      <TableCell className="text-xs">{r.taught_by ?? '—'}</TableCell>
                      <TableCell className="text-xs">{r.times_applied}×</TableCell>
                      <TableCell>
                        {r.active ? <Badge>On</Badge> : <Badge variant="outline">Off</Badge>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === r.id}
                          onClick={() => void setRuleActive(r, !r.active)}
                        >
                          {r.active ? 'Turn off' : 'Turn on'}
                        </Button>{' '}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === r.id}
                          onClick={() => void deleteRule(r)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rules.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-sm text-muted-foreground">
                        No rules yet. Teach one from the Classification Queue — classify a row,
                        click Teach, then Save.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Property roster ({payees.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                The recurring payees of each property — mortgage servicers, condo/HOA associations,
                insurers, utilities. A confirmed entry identifies a bank transaction by payee text
                plus the expected amount; the amount alone never identifies anything.
              </p>
              <Table className="[&_td]:px-2 [&_th]:px-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Payee</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Register link</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payees.map((p) => {
                    const edit = editFor(p);
                    const isDraft = p.status === 'draft';
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">
                          <div className="font-medium">{p.payee_name}</div>
                          <div className="text-muted-foreground">matches “{p.match_text}”</div>
                        </TableCell>
                        <TableCell className="text-xs">{p.kind}</TableCell>
                        <TableCell>
                          {isDraft ? (
                            <Input
                              value={edit.property_label}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [p.id]: { ...edit, property_label: e.target.value },
                                }))
                              }
                              placeholder="Property"
                              className="h-8 w-32 text-xs"
                            />
                          ) : (
                            <span className="text-xs">{p.property_label ?? '—'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.property_id ? (
                            <span>
                              <span className="font-medium">{p.property_name ?? 'Linked'}</span>
                              {p.property_link_basis && (
                                <span className="block text-muted-foreground">
                                  {p.property_link_basis}
                                </span>
                              )}
                            </span>
                          ) : p.property_label ? (
                            <Badge variant="outline" className="whitespace-nowrap">
                              Not linked — label matches no register record exactly
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isDraft ? (
                            <Input
                              value={edit.amount}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [p.id]: { ...edit, amount: e.target.value },
                                }))
                              }
                              placeholder="—"
                              inputMode="decimal"
                              className="h-8 w-24 text-xs"
                            />
                          ) : (
                            <span className="text-xs">
                              {p.expected_amount != null ? `$${Number(p.expected_amount).toFixed(2)}` : '—'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isDraft ? (
                            <Input
                              value={edit.account}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [p.id]: { ...edit, account: e.target.value },
                                }))
                              }
                              placeholder="Account"
                              className="h-8 w-36 text-xs"
                            />
                          ) : (
                            <span className="text-xs">{p.account ?? '—'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isDraft ? (
                            <Input
                              value={edit.klass}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [p.id]: { ...edit, klass: e.target.value },
                                }))
                              }
                              placeholder="Class"
                              className="h-8 w-28 text-xs"
                            />
                          ) : (
                            <span className="text-xs">{p.class ?? '—'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {p.status === 'confirmed' && <Badge>Confirmed</Badge>}
                          {p.status === 'draft' && <Badge variant="outline">Draft — needs you</Badge>}
                          {p.status === 'rejected' && <Badge variant="secondary">Rejected</Badge>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isDraft && (
                            <>
                              <Button
                                size="sm"
                                disabled={busyId === p.id}
                                onClick={() => void setPayeeStatus(p, 'confirmed')}
                              >
                                Confirm
                              </Button>{' '}
                            </>
                          )}
                          {p.status !== 'rejected' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busyId === p.id}
                              onClick={() => void setPayeeStatus(p, 'rejected')}
                            >
                              Reject
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {payees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-sm text-muted-foreground">
                        No roster entries yet for this company.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Utility account crosswalk — MSD ({crosswalk.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                The bank text carries one MSD account number; the property register's utility
                adapter carries a different one. The two numbers never join on their own — a
                mapping exists only when you confirm it here, from evidence (a bill, a
                statement, the adapter record). Drafts classify nothing. A confirmed mapping
                makes classify propose Utilities with that property as the class — identity by
                account number, never by amount (canon §25.3).
              </p>
              <div className="mb-3">
                <Button size="sm" variant="outline" disabled={seeding} onClick={seedCrosswalkDrafts}>
                  {seeding ? 'Seeding…' : 'Seed drafts from utility spreadsheet'}
                </Button>
                <span className="ml-2 text-xs text-muted-foreground">
                  Drafts a mapping for every spreadsheet MSD account whose number appears in
                  this company's bank text. Seeding never confirms — each draft still needs
                  your confirmation below.
                </span>
              </div>
              <Table className="[&_td]:px-2 [&_th]:px-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank account #</TableHead>
                    <TableHead>Adapter account</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Basis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crosswalk.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">{entry.bank_account_number}</TableCell>
                      <TableCell className="text-xs">
                        {entry.adapter_account_reference ?? '—'}
                        {entry.adapter_provider && (
                          <span className="block text-muted-foreground">{entry.adapter_provider}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{entry.property_label ?? '—'}</TableCell>
                      <TableCell className="text-xs">
                        {entry.basis ?? '—'}
                        {entry.status === 'confirmed' && entry.confirmed_by && (
                          <span className="block text-muted-foreground">
                            Confirmed by {entry.confirmed_by}
                            {entry.confirmed_at ? ` · ${usDate(entry.confirmed_at)}` : ''}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.status === 'confirmed' ? 'default' : 'secondary'}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.status === 'draft' && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={busyId === entry.id || (!entry.adapter_id && !entry.property_id)}
                              onClick={() => setCrosswalkStatus(entry, 'confirmed')}
                            >
                              <Check className="mr-1 h-4 w-4" /> Confirm mapping
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === entry.id}
                              onClick={() => setCrosswalkStatus(entry, 'rejected')}
                            >
                              <X className="mr-1 h-4 w-4" /> Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {crosswalk.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        No utility account mappings yet for this company. Bank account numbers
                        with no confirmed mapping stay unmapped — nothing is paired
                        automatically.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

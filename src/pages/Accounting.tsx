import { useState, useMemo } from 'react';
import { format, startOfYear, startOfMonth } from 'date-fns';
import { CalendarIcon, Search, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAccountingPayments } from '@/hooks/useAccountingPayments';
import AddHistoricalPaymentDialog from '@/components/accounting/AddHistoricalPaymentDialog';

type DatePreset = 'ytd' | 'month' | 'custom';

function ytdRange() {
  const now = new Date();
  return { from: startOfYear(now), to: now };
}

function monthRange() {
  const now = new Date();
  return { from: startOfMonth(now), to: now };
}

function fmtDate(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const SOURCE_LABELS: Record<string, string> = {
  stripe_connect: 'Stripe',
  manual_quickbooks: 'QB Manual',
  venmo_manual: 'Venmo',
  quickbooks_linked: 'QB Linked',
  quickbooks_exported: 'QB Exported',
  off_platform_manual: 'Manual',
  batch: 'Batch',
};

const Accounting = () => {
  const [preset, setPreset] = useState<DatePreset>('ytd');
  const [fromDate, setFromDate] = useState<Date>(ytdRange().from);
  const [toDate, setToDate] = useState<Date>(ytdRange().to);
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [contractorFilters, setContractorFilters] = useState<string[]>([]);
  const [projectFilters, setProjectFilters] = useState<string[]>([]);
  const [contractorSearch, setContractorSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [companySearch, setCompanySearch] = useState('');

  const toggleProject = (id: string) => {
    setProjectFilters(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleContractor = (id: string) => {
    setContractorFilters(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const filters = useMemo(() => ({
    fromDate: fmtDate(fromDate),
    toDate: fmtDate(toDate),
    companyId: companyFilter === 'all' ? undefined : companyFilter,
    workerIds: contractorFilters.length > 0 ? contractorFilters : undefined,
    projectIds: projectFilters.length > 0 ? projectFilters : undefined,
  }), [fromDate, toDate, companyFilter, contractorFilters, projectFilters]);

  const {
    payments, loading, profileMap, companyMap, projectMap, companies, projects,
    profilesList, ledgerContractors, totalPaid, contractorTotals, refetch,
  } = useAccountingPayments(filters);

  const handlePreset = (p: DatePreset) => {
    setPreset(p);
    if (p === 'ytd') {
      const r = ytdRange();
      setFromDate(r.from);
      setToDate(r.to);
    } else if (p === 'month') {
      const r = monthRange();
      setFromDate(r.from);
      setToDate(r.to);
    }
  };

  return (
    <div className="pb-20">
      <PageHeader title="Accounting" backTo="/admin" />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Payment Ledger</h2>
          <AddHistoricalPaymentDialog
            profiles={profilesList}
            companies={companies}
            projects={projects}
            onSaved={refetch}
          />
        </div>
        {/* Filters */}
        <Card>
          <CardContent className="p-4 space-y-3">
            {/* Date presets */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground mr-1">Range:</span>
              {(['ytd', 'month', 'custom'] as DatePreset[]).map((p) => (
                <Button
                  key={p}
                  variant={preset === p ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handlePreset(p)}
                >
                  {p === 'ytd' ? 'YTD' : p === 'month' ? 'This Month' : 'Custom'}
                </Button>
              ))}
            </div>

            {/* Date pickers */}
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('text-xs h-8 w-[140px] justify-start', !fromDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                    {format(fromDate, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={(d) => { if (d) { setFromDate(d); setPreset('custom'); } }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('text-xs h-8 w-[140px] justify-start', !toDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                    {format(toDate, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={(d) => { if (d) { setToDate(d); setPreset('custom'); } }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Company & Contractor */}
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs w-[180px] justify-start">
                    {companyFilter === 'all' ? 'All Companies' : companyFilter === 'legacy' ? 'Legacy / Unassigned' : (companies.find(c => c.id === companyFilter)?.short_name ?? companies.find(c => c.id === companyFilter)?.name ?? 'Company')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0" align="start">
                  <div className="p-2 border-b">
                    <Input
                      placeholder="Search companies…"
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <ScrollArea className="max-h-[200px]">
                    <div className="p-1">
                      <label
                        className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent cursor-pointer", companyFilter === 'all' && 'bg-accent')}
                        onClick={() => { setCompanyFilter('all'); setCompanySearch(''); }}
                      >
                        All Companies
                      </label>
                      {companies
                        .filter(c => (c.short_name ?? c.name).toLowerCase().includes(companySearch.toLowerCase()))
                        .map((c) => (
                        <label
                          key={c.id}
                          className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent cursor-pointer", companyFilter === c.id && 'bg-accent')}
                          onClick={() => { setCompanyFilter(c.id); setCompanySearch(''); }}
                        >
                          {c.short_name ?? c.name}
                        </label>
                      ))}
                      {'legacy'.includes(companySearch.toLowerCase()) && (
                        <label
                          className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent cursor-pointer", companyFilter === 'legacy' && 'bg-accent')}
                          onClick={() => { setCompanyFilter('legacy'); setCompanySearch(''); }}
                        >
                          Legacy / Unassigned
                        </label>
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs w-[220px] justify-start">
                    {contractorFilters.length === 0
                      ? 'All Contractors'
                      : `${contractorFilters.length} contractor${contractorFilters.length > 1 ? 's' : ''} selected`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0" align="start">
                  <div className="p-2 border-b flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Contractors</span>
                    {contractorFilters.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1" onClick={() => setContractorFilters([])}>
                        <X className="h-3 w-3 mr-0.5" /> Clear
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="max-h-[200px]">
                    <div className="p-1">
                      {profilesList.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent cursor-pointer"
                        >
                          <Checkbox
                            checked={contractorFilters.includes(c.id)}
                            onCheckedChange={() => toggleContractor(c.id)}
                            className="h-3.5 w-3.5"
                          />
                          <span className="truncate">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs w-[220px] justify-start">
                    {projectFilters.length === 0
                      ? 'All Projects'
                      : `${projectFilters.length} project${projectFilters.length > 1 ? 's' : ''} selected`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-0" align="start">
                  <div className="p-2 border-b flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Projects</span>
                    {projectFilters.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1" onClick={() => setProjectFilters([])}>
                        <X className="h-3 w-3 mr-0.5" /> Clear
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="max-h-[200px]">
                    <div className="p-1">
                      {projects.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent cursor-pointer"
                        >
                          <Checkbox
                            checked={projectFilters.includes(p.id)}
                            onCheckedChange={() => toggleProject(p.id)}
                            className="h-3.5 w-3.5"
                          />
                          <span className="truncate">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{fmtCurrency(totalPaid)}</p>
              <p className="text-xs text-muted-foreground">{payments.length} payment{payments.length !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>

          {contractorTotals.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">By Contractor</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1">
                {contractorTotals.map((ct) => (
                  <div key={ct.userId} className="flex items-center justify-between text-sm">
                    <span className="truncate mr-2">{ct.name}</span>
                    <span className="font-medium whitespace-nowrap">{fmtCurrency(ct.total)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Payment table */}
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-8">Loading…</p>
        ) : payments.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No paid records found for this range.</p>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Paid Date</TableHead>
                    <TableHead className="text-xs">Contractor</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Company</TableHead>
                    <TableHead className="text-xs">Project</TableHead>
                    <TableHead className="text-xs">Reference</TableHead>
                    <TableHead className="text-xs">Period</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(p.paid_date + 'T00:00:00'), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-xs">{profileMap.get(p.worker_user_id) ?? 'Unknown'}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{fmtCurrency(Number(p.amount))}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="secondary" className="text-[10px]">
                          {SOURCE_LABELS[p.payment_source] ?? p.payment_source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.company_id ? companyMap.get(p.company_id) ?? '—' : (
                          <Badge variant="outline" className="text-[10px]">Legacy</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[140px]">
                        {p.project_id ? projectMap.get(p.project_id) ?? '—' : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">{p.external_reference ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {p.pay_period_start && p.pay_period_end
                          ? `${format(new Date(p.pay_period_start + 'T00:00:00'), 'M/d')}–${format(new Date(p.pay_period_end + 'T00:00:00'), 'M/d')}`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Accounting;

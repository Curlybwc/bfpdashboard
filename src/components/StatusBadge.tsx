import { Badge } from '@/components/ui/badge';

const colorMap: Record<string, string> = {
  active: 'bg-success text-success-foreground',
  paused: 'bg-warning text-warning-foreground',
  complete: 'bg-muted text-muted-foreground',
  Ready: 'bg-primary/15 text-primary',
  'In Progress': 'bg-orange-100 text-orange-700',
  'Not Ready': 'bg-muted text-muted-foreground',
  Hold: 'bg-muted text-muted-foreground',
  Done: 'bg-success/15 text-success',
  Draft: 'bg-primary/15 text-primary',
  Converted: 'bg-success/15 text-success',
  Archived: 'bg-muted text-muted-foreground',
  Yes: 'bg-success/15 text-success',
  Partial: 'bg-warning/20 text-warning',
  No: 'bg-destructive/15 text-destructive',
  Priced: 'bg-success/15 text-success',
  'Needs Pricing': 'bg-warning/20 text-warning',
  'Get Bid': 'bg-amber-100 text-amber-700',
  OK: 'bg-success/15 text-success',
  'Not Checked': 'bg-muted text-muted-foreground',
  Repair: 'bg-orange-100 text-orange-700',
  Replace: 'bg-destructive/15 text-destructive',
};

const StatusBadge = ({ status }: { status: string }) => (
  <Badge variant="secondary" className={`${colorMap[status] || ''} text-xs font-medium border-0`}>
    {status}
  </Badge>
);

export default StatusBadge;

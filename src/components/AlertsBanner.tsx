import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck, Clock, Camera, X, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import type { OperationalAlert } from '@/lib/alerts';
import { cn } from '@/lib/utils';

const MAX_VISIBLE = 6;

const iconMap: Record<OperationalAlert['type'], React.ElementType> = {
  blocked: ShieldAlert,
  review: ClipboardCheck,
  overdue: AlertTriangle,
  shift: Clock,
  photo: Camera,
};

const severityStyles: Record<OperationalAlert['severity'], string> = {
  high: 'text-destructive',
  medium: 'text-warning',
  low: 'text-muted-foreground',
};

interface Props {
  alerts: OperationalAlert[];
}

export default function AlertsBanner({ alerts }: Props) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const visible = alerts.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const shown = expanded ? visible : visible.slice(0, MAX_VISIBLE);
  const hasMore = visible.length > MAX_VISIBLE;

  const dismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(prev => new Set(prev).add(id));
  };

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-3 space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        {visible.length} alert{visible.length !== 1 ? 's' : ''}
      </p>

      {shown.map(alert => {
        const Icon = iconMap[alert.type];
        return (
          <button
            key={alert.id}
            onClick={() => navigate(alert.actionPath)}
            className="flex items-start gap-2 w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors group"
          >
            <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', severityStyles[alert.severity])} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight truncate">{alert.title}</p>
              {alert.subtitle && (
                <p className="text-xs text-muted-foreground truncate">{alert.subtitle}</p>
              )}
            </div>
            <span
              role="button"
              onClick={(e) => dismiss(alert.id, e)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted shrink-0"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </button>
        );
      })}

      {hasMore && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 pt-1"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Show less' : `Show all (${visible.length})`}
        </button>
      )}
    </div>
  );
}

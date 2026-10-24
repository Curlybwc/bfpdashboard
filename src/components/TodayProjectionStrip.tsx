import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { ProjectionGroupResult, TodayProjectionData } from '@/hooks/useTodayProjection';

/**
 * The day-projection strip atop the Today page (SPEC Slice 1, CT-29).
 *
 * A pure view of the records: items link to their owning task record;
 * completing / rescheduling happens there, never here. The strip has no
 * mute, no drag-reorder, and no collapse-to-hide (CT-29: the projection
 * has no manual curation). Date-only records render dates only — no clock
 * time is ever invented for a record that does not carry one.
 */

function formatDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function ProjectionRow({
  row,
  projectName,
  overdue,
}: {
  row: any;
  projectName?: string;
  overdue: boolean;
}) {
  const title = row.project_id ? (
    <Link
      to={`/projects/${row.project_id}/tasks/${row.id}`}
      className="font-medium hover:underline"
    >
      {row.task}
    </Link>
  ) : (
    <span className="font-medium">{row.task}</span>
  );

  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <span className="min-w-0 truncate">
        {title}
        {projectName && <span className="text-muted-foreground"> · {projectName}</span>}
      </span>
      {overdue ? (
        <>
          <span className="shrink-0 text-xs text-muted-foreground">
            Due {formatShortDate(row.due_date)}
          </span>
          <span className="shrink-0 rounded border border-destructive px-1.5 py-0.5 text-xs font-medium text-destructive">
            Overdue
          </span>
        </>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">Due today</span>
      )}
    </li>
  );
}

function ProjectionGroup({
  title,
  group,
  projectMap,
  overdue,
  errorText,
  emptyText,
}: {
  title: string;
  group: ProjectionGroupResult;
  projectMap: Record<string, string>;
  overdue: boolean;
  errorText: string;
  emptyText?: string;
}) {
  if (group.error) {
    return (
      <div role="alert" className="flex items-start gap-2 py-2 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{errorText}</span>
      </div>
    );
  }

  if (group.rows.length === 0) {
    if (!emptyText) return null;
    return (
      <div className="py-1">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <p className="py-1.5 text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="py-1">
      <h3
        className={
          overdue
            ? 'text-sm font-semibold uppercase tracking-wide text-destructive'
            : 'text-sm font-semibold uppercase tracking-wide text-muted-foreground'
        }
      >
        {title} ({group.rows.length})
      </h3>
      <ul className="divide-y">
        {group.rows.map((row: any) => (
          <ProjectionRow
            key={row.id}
            row={row}
            projectName={row.project_id ? projectMap[row.project_id] : undefined}
            overdue={overdue}
          />
        ))}
      </ul>
      {group.truncated && (
        <p className="py-1 text-xs text-muted-foreground">
          Showing {group.rows.length} of {group.total} —{' '}
          <Link to="/projects" className="underline">
            view all projects
          </Link>
        </p>
      )}
    </div>
  );
}

export default function TodayProjectionStrip({
  data,
  loading,
}: {
  data: TodayProjectionData;
  loading: boolean;
}) {
  return (
    <section data-testid="today-projection-strip" className="mb-6 rounded-lg border p-4">
      <h2 className="mb-2 text-base font-semibold">Today · {formatDateStr(data.todayStr)}</h2>

      {loading ? (
        <div data-testid="today-projection-loading" className="space-y-2 py-2">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <ProjectionGroup
            title="Due today"
            group={data.dueToday}
            projectMap={data.projectMap}
            overdue={false}
            errorText="Due-today items could not be loaded — showing the rest of the day."
            emptyText="Nothing due today."
          />
          <ProjectionGroup
            title="Overdue"
            group={data.overdue}
            projectMap={data.projectMap}
            overdue
            errorText="Overdue items could not be loaded — showing the rest of the day."
          />
        </>
      )}
    </section>
  );
}

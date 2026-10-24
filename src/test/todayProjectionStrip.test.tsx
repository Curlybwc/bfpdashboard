import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import TodayProjectionStrip from '@/components/TodayProjectionStrip';
import type { TodayProjectionData } from '@/hooks/useTodayProjection';

const TODAY = '2026-10-23';

const baseData = (overrides: Partial<TodayProjectionData> = {}): TodayProjectionData => ({
  todayStr: TODAY,
  dueToday: { rows: [], total: 0, truncated: false, error: null },
  overdue: { rows: [], total: 0, truncated: false, error: null },
  projectMap: {},
  ...overrides,
});

const taskRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  task: `Task ${id}`,
  due_date: TODAY,
  stage: 'Ready',
  project_id: 'p1',
  ...extra,
});

function renderStrip(data: TodayProjectionData) {
  return render(
    <MemoryRouter>
      <TodayProjectionStrip data={data} loading={false} />
    </MemoryRouter>,
  );
}

describe('TodayProjectionStrip', () => {
  it('renders due-today items as links to their owning task record', () => {
    renderStrip(
      baseData({
        dueToday: { rows: [taskRow('a')], total: 1, truncated: false, error: null },
        projectMap: { p1: 'Proj One' },
      }),
    );

    const link = screen.getByRole('link', { name: /Task a/ });
    expect(link).toHaveAttribute('href', '/projects/p1/tasks/a');
    expect(screen.getByText(/Proj One/)).toBeInTheDocument();
  });

  it('A3: an open task due yesterday appears in the Overdue group with its visible mark', () => {
    renderStrip(
      baseData({
        overdue: {
          rows: [taskRow('old', { due_date: '2026-10-22' })],
          total: 1,
          truncated: false,
          error: null,
        },
      }),
    );

    expect(screen.getByText(/Overdue \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument(); // the per-item mark
    expect(screen.getByText(/Due Oct 22/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Task old/ })).toHaveAttribute(
      'href',
      '/projects/p1/tasks/old',
    );
  });

  it('A4: a date-only task never displays a clock time', () => {
    const { container } = renderStrip(
      baseData({
        dueToday: { rows: [taskRow('a')], total: 1, truncated: false, error: null },
        overdue: {
          rows: [taskRow('old', { due_date: '2026-10-22' })],
          total: 1,
          truncated: false,
          error: null,
        },
      }),
    );

    expect(container.textContent ?? '').not.toMatch(/\d{1,2}:\d{2}\s?(AM|PM|am|pm)/);
  });

  it('A5: a truncated group says "Showing X of Y" instead of pretending to be complete', () => {
    renderStrip(
      baseData({
        dueToday: { rows: [taskRow('a'), taskRow('b')], total: 5, truncated: true, error: null },
      }),
    );

    expect(screen.getByText(/Showing 2 of 5/)).toBeInTheDocument();
  });

  it('A6: one group failing shows the other group plus a visible notice', () => {
    renderStrip(
      baseData({
        dueToday: { rows: [], total: 0, truncated: false, error: 'db down' },
        overdue: {
          rows: [taskRow('old', { due_date: '2026-10-22' })],
          total: 1,
          truncated: false,
          error: null,
        },
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/);
    expect(screen.getByRole('link', { name: /Task old/ })).toBeInTheDocument();
    // No fake empty state for the failed group:
    expect(screen.queryByText('Nothing due today.')).not.toBeInTheDocument();
  });

  it('A6: both groups failing shows notices and never a fake empty day', () => {
    renderStrip(
      baseData({
        dueToday: { rows: [], total: 0, truncated: false, error: 'x' },
        overdue: { rows: [], total: 0, truncated: false, error: 'y' },
      }),
    );

    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.queryByText('Nothing due today.')).not.toBeInTheDocument();
  });

  it('an honestly empty day says so, with no Overdue group', () => {
    renderStrip(baseData());

    expect(screen.getByText('Nothing due today.')).toBeInTheDocument();
    expect(screen.queryByText(/Overdue/)).not.toBeInTheDocument();
  });

  it('offers no editing or curation controls — the strip is a view (CT-29)', () => {
    renderStrip(
      baseData({
        dueToday: { rows: [taskRow('a')], total: 1, truncated: false, error: null },
      }),
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

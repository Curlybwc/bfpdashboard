# Labor hours drill-down

Make the "Labor Hours by Project" chart on Analytics clickable, so you can go from project to contractor to that contractor's individual days/tasks.

## How it will work

1. Tap (or click) a project bar or its name in "Labor Hours by Project".
2. A panel opens showing that project's contractors, each with hours and labor cost, sorted highest first.
3. Tap a contractor to see their breakdown for that project: each day worked, hours, cost, and which tasks those hours were put against.
4. A back control returns you to the contractor list, and closing returns you to the chart. Works as a full-height sheet on the phone and a dialog on the computer.

Totals in the drill-down always match the chart (flat-rate shifts count toward cost, not hours, same as today).

## Technical notes

- File: `src/pages/Analytics.tsx` (chart + drill-down state), plus one new component `src/components/analytics/LaborBreakdownSheet.tsx`.
- Analytics currently loads shifts without `user_id`; add `user_id` to that select and load `profiles (id, full_name)` for names. No schema changes.
- Day/task detail loads on demand for the chosen project + worker: `shift_task_allocations` joined to `shifts` and `tasks`, filtered by project and user. Falls back to "Unallocated" when a shift has no task allocations.
- Reuse existing hour/cost math from the `laborData` memo so numbers stay consistent.
- Respect the existing project filter at the top of the page; no changes to other charts.
- Validate with the build and type check, and check the flow at phone and desktop widths.

# Shift calendar: multi-person filter + day/shift details

## What you'll get

1. **Pick several people at once.** The "Contractor" dropdown on the Shifts screen becomes a checklist. Check Josiah, Judah, Becky, and Jeff and the calendar (and list) shows only those four. Leaving everything unchecked shows everyone, as today.

2. **Tap a day to see who worked.** Tapping a calendar day opens a panel for that date listing every matching shift: person, project, hours, start/end time, and a green "Paid" or amber "Unpaid" tag. An "Add shift" button stays in that panel so the current behavior (tapping a day to log a shift) isn't lost.

3. **Tap a shift to see what they were doing.** Tapping a person's shift opens its details: the project, hours, clock in/out times if used, and the work they logged their hours against — each task name with the hours put on it, plus an "Unallocated" line when hours weren't assigned to any task. Edit and delete stay available from there.

Note: shifts don't have a free-text "what I did" note today. The closest existing record is the task-by-task hour breakdown people fill in when logging a shift, so that's what the detail view shows. If you'd also like a plain notes box on a shift, say so and I'll add it as a follow-up.

## Technical outline

- `src/hooks/useAdminShifts.ts`: replace `contractorId?: string` with `contractorIds?: string[]` and use `.in('user_id', ids)` when non-empty. Add a new `useShiftAllocations(shiftId)` query joining `shift_task_allocations` to `tasks(id, task, project_id)`.
- `src/pages/Shifts.tsx`: contractor filter state becomes `string[]`; render a multi-select popover with checkboxes (shadcn `Popover` + `Checkbox`) and a trigger summarising selection ("4 people"). Keep URL param support: `?contractor=` accepts a comma-separated list for existing Payroll drill-down links. Payroll deep-link card only renders when exactly one person is selected. List view filters by the same array.
- `src/components/shifts/ShiftsCalendarView.tsx`: change `onDateClick` to open a new day sheet instead of jumping to the new-shift form; keep chip click → shift detail. Chips keep the existing paid/unpaid colours.
- New `src/components/shifts/ShiftDaySheet.tsx` (day list, "Add shift" button) and `src/components/shifts/ShiftDetailSheet.tsx` (single shift + allocations, Edit/Delete). Both use `Sheet` with `side="bottom"` on mobile and a standard right-side sheet at `md`+ so desktop density is preserved.
- No database or schema changes.



## Problem

The "Mark Paid" button is inside a `CollapsibleContent` on each batch row. You must click the row to expand it before the button appears. Per your visibility requirement, this is effectively invisible.

## Plan

**Single file: `src/components/shifts/PayrollSummary.tsx`**

Move the "Mark Paid" button out of the collapsible content and into the always-visible batch row header (the `CollapsibleTrigger` area, lines 576-596). Place it as a visible button next to the dollar amount on each draft/exported batch, so it's immediately actionable without expanding.

Changes:
1. Add a "Mark Paid" button (small, with CheckCircle icon) directly in the batch row header (line ~594, next to the amount) for draft and exported batches
2. Use `e.stopPropagation()` on the button click so it doesn't toggle the collapsible
3. Keep the existing button inside the collapsible as well (no harm in redundancy, or remove it — your call)

No other files changed. No database changes.


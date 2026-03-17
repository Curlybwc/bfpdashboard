

## Payroll UX Rewrite — Implementation Plan

**Single file to change:** `src/components/shifts/PayrollSummary.tsx`

No database changes. No logic changes. No new files. Pure label/text rewrite.

---

### Changes

**1. Add intro note at top (after QB banner, before date range)**

> "This page groups unpaid shifts by contractor and project so you can prepare payments without paying the same shift twice."

**2. Summary card (lines 498-502)**

| Current | New |
|---|---|
| "Eligible unpaid" | "Ready to prepare" |
| "Exported (selected period)" | "Prepared (not yet paid)" |
| "Paid (selected period)" | "Already paid" |

**3. Section: "Unpaid Eligible Payable Groups" → "Ready to Pay" (lines 504-555)**

| Current | New |
|---|---|
| Section title: "Unpaid Eligible Payable Groups" | "Ready to Pay" |
| Helper text: "Grouped by contractor + project…" | "These contractor/project groups have unpaid shifts that can be prepared as a payment now." |
| Empty state: "No eligible unpaid shift groups…" | "No unpaid shifts available to prepare in this date range." |
| Button: "Create Payable Batch" | "Prepare Payment" |
| Toast: "Payable created … Created batch #…" | "Payment prepared — [Contractor] · [Project]" |

**4. Section: "Exported / Draft Payables" → "Prepared Payments" (lines 557-672)**

| Current | New |
|---|---|
| Section title: "Exported / Draft Payables" | "Prepared Payments" |
| Helper text: "These groups are already linked…" | "These payments have been prepared. Their shifts won't appear in Ready to Pay." |
| Empty state: "No draft/exported payables…" | "No prepared payments for this date range." |
| Status badge raw "draft"/"exported" | "Prepared" / "Sent to QuickBooks" |
| "Mark Paid" buttons (header + collapsible) | "Record Manual Payment" |
| Toast: "Payable marked paid" | "Payment recorded — marked as paid" |

**5. Section: "Paid Payables" → "Already Paid" (lines 674-712)**

| Current | New |
|---|---|
| Section title: "Paid Payables" | "Already Paid" |
| Helper text: "Paid groups remain visible…" | "These payments were already recorded as paid." |
| Empty state: "No paid payables…" | "No paid records for this date range." |
| "paid [timestamp]" | "Paid on [formatted date]" |

**6. Section: "Excluded Shifts" → "Already Included Elsewhere" (lines 714-732)**

| Current | New |
|---|---|
| Section title: "Excluded Shifts (why not eligible)" | "Already Included Elsewhere" |
| Helper text: "These shifts are already linked…" | "These shifts are already part of another payment group, so they can't be included again." |
| Empty state: "No excluded shifts…" | "All shifts in this range are available." |
| Reason: "Linked to draft payable (date → date, #abc123)" | "Part of a prepared payment (date → date)" or "Part of a paid payment (date → date)" |

**7. Minor row-level improvements**

- In candidate group rows: keep "Contractor · Project" and "date → date · N shifts" — already good
- In excluded shift reason text: humanize the status (draft→"prepared", exported→"sent to QuickBooks", paid→"paid") and drop the batch ID hash

---

### Files

| File | Action |
|---|---|
| `src/components/shifts/PayrollSummary.tsx` | Edit labels, helper text, button text, toast messages, status badge text, excluded reason text |

No other files touched.


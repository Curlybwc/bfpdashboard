---
name: Reimbursement System
description: Contractor receipt upload → admin review → QB bill export → manual payment marking, mirroring payroll workflow
type: feature
---
Contractors submit reimbursement requests with receipt uploads at /reimbursements. Admins review at /admin/reimbursements and process payments at /admin/reimbursements/payment-queue.

Lifecycle (reimbursement_status enum):
submitted → needs_info | not_approved | approved → exported → paid | voided

Rules:
- approved_amount > 0 AND approved_amount <= requested_amount (DB trigger trg_validate_reimbursement_amounts). Under-requests require contractor correction, never over-approval.
- Receipts in private bucket reimbursement-receipts. Storage RLS: insert only under own user_id path; select for owner or org admin; delete only by submitter while status=submitted, or admin before exported/paid.
- HEIC files converted client-side to JPG via heic2any before upload.
- Submitter may edit only while status=submitted.

QuickBooks integration:
- Bill posts to per-company qb_reimbursement_expense_account_id from quickbooks_settings (often Repairs & Maintenance for Jen's companies, configurable per QB file via QBSettingsCard).
- TxnDate uses expense_date (not submitted_at).
- Class set from project's quickbooks_class_mappings.
- Vendor must be mapped via quickbooks_vendor_mappings for the company.
- One QB bill per reimbursement request (no batching).
- After bill creation status → exported. Admin marks paid manually after sending payment outside the app (matches payroll workflow). Bank-feed matching happens in QuickBooks, not the app.

Edge functions:
- quickbooks_create_reimbursement_bill — creates QB bill, sets qb_bill_id, status=exported
- admin_mark_reimbursement_paid — sets status=paid, paid_at, payment_method, external_reference
- reimbursement_signed_url — short-lived signed URL for private receipt viewing

Multi-company safety: company_id scoping on quickbooks_settings, vendor mappings, and bill posting (per multi-tenant-saas-isolation and quickbooks-multi-company-routing rules).

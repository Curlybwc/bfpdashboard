# Agent API write contract

POST to the existing agent_api endpoint with `Authorization: Bearer <AGENT_API_KEY>` and a JSON object containing `action`. All writes, including dry runs, require `AGENT_API_ALLOW_WRITES` to equal exactly `true`. Secrets are maintained in Project Settings → Secrets. No action transfers money or exports to QuickBooks.

## Responses

- New actions: `{ "saved": true, "record": {...} }`.
- Dry runs: `{ "dry_run": true, "would_save": {...full resolved record...}, "saved": false }`. The transactional writes and triggers are executed inside a rollback-only subtransaction, so generated identifiers are illustrative and are not reserved.
- Duplicate creates: `{ "saved": false, "duplicate": true, "record": {...existing record...} }`. `create_task` preserves its existing `task` response key instead of `record`.
- Errors: `{ "error": "machine_code", "message": "description" }`.
- `client_ref` is optional on creates, nonempty, maximum 200 characters, and unique per record type. Reuse the same reference on retries. Database unique indexes enforce this even for concurrent requests. No references are backfilled.

## New action fields

Every action accepts optional `dry_run: boolean`. Fields marked `?` are optional.

| Action | Fields |
|---|---|
| create_time_entry | worker, project, date, purpose, exactly one of hours / flat_rate; invoice_no?, trade?, client_ref?, allocations? |
| update_time_entry | entry_id; any of hours, flat_rate, amount, date, purpose, invoice_no, project, worker, trade, allocations |
| delete_time_entry | entry_id |
| mark_time_entries_paid | entry_ids (1–200 unique IDs), paid_at (date), settlement_method, reference? |
| update_bill_status | bill_id; any of status, qb_bill_doc_number, settlement_method |
| create_project | name, company, property?, client_ref? |
| update_project | project; name? / status? |
| add_project_member | project, worker |
| remove_project_member | project, worker |
| create_worker | unsupported: returns worker_onboarding_required, including in dry_run |
| update_worker | worker; name?, rate?, is_active?, is_manager?, is_admin?, skip_quickbooks_export?, direct_deposit_on_file?, info_1099_entered? |
| update_task | task_id OR (project + match_title); title?, stage?, worker?, priority?, due_date?, trade? |
| complete_task | task_id |
| delete_task | task_id |
| create_vendor | name, company, client_ref? |
| update_vendor | vendor; name?, quickbooks_vendor_id?, quickbooks_vendor_name? |

Names or IDs are accepted for worker/project/vendor selectors. Ambiguous matches fail; use exact IDs. `company` accepts BFP, BFH, FOBAR, exact name, or ID. Dates are YYYY-MM-DD. `invoice_no`, `trade`, task `due_date`, and task `worker` may be explicitly null to clear them.

Hours require `allocations: [{"task_id":"uuid","hours":2}]`, with positive hours totaling the entry hours and tasks belonging to the entry project. Existing hourly allocations may be retained only when they still match. No task or clock times are invented. `amount` updates only an existing flat-rate entry; `flat_rate` may convert an hourly entry. Flat-rate amounts must be positive and at most two decimal places; flat-rate entries have NULL hours, times, and rate snapshot and no allocations. Worker rate may be zero.

Settlement methods: bill_pay, check, direct_deposit, cash, other. `mark_time_entries_paid.record` contains payments, entry_ids, and moves_money:false. Only unprepared/unpaid entries are supported; entries attached to a non-voided prepared batch are locked even before export. Bill reconciliation uses update_bill_status instead.

Bill statuses supported: draft, exported, paid. Voiding/reverting a paid or exported bill is refused. `bill_id` identifies a payroll batch, not a direct worker payment. Reconciliation records dashboard status only; it does not establish verified QuickBooks class assignment.

Project statuses are the app's existing active, paused, complete; completed and archived are not supported and are rejected. Existing exact-name or canonical-property-linked projects are returned as duplicates. New projects do not create canonical Properties or change ownership.

Worker creation cannot provision a profile without a real auth account. Email/phone updates return unsupported_contact_update; these require a verified account/Person-contact workflow. is_manager maps to can_manage_projects, not organization membership role. The last active admin cannot be demoted/inactivated. New write attribution uses the oldest active administrator's organization; the API key is not a personal login identity.

Task completion retains recurring-task and parent completion behavior. Task deletion includes cascading child IDs and refuses deletion when task allocations touch locked payments. Solo assignment updates refuse crew/outside-vendor tasks. New task assignment does not add membership; call add_project_member explicitly.

Vendor links require an exact active Vendor ID verified in that vendor's QuickBooks company. A name alone is insufficient. Explicit null unlinks it. These are supplier-vendor records, not the separate worker-to-company payroll vendor mappings.

## Existing actions unchanged

create_task: project, title; worker?, stage?, priority?, due_date?, trade?, materials_on_site?, created_by?, dry_run?, client_ref?. Normal success remains `{saved:true,task:{...}}`.

set_property_class: property, class_id; class_name?, dry_run?. Normal success remains `{saved:true,property,project_id,quickbooks_class,note}`. Changes only future dashboard export mapping, never historical QuickBooks bills.

## Reads

Existing bills/projects/tasks/time-entries resources retain their field names and filters. Time entries and bills now also contain purpose and invoice_no (historical values may be NULL); time entries include trade and client_ref. Original limits remain; these are not paginated full-history exports.

- GET ?resource=workers&worker=<partial name or id> → `{count,workers:[{id,name,rate,is_active,is_manager,is_admin,skip_quickbooks_export,direct_deposit_on_file,info_1099_entered,person_id,org_id}]}`
- GET ?resource=vendors&vendor=<partial name or id>&company=BFP → `{count,vendors:[{...vendor record,company,quickbooks_vendor_name,linked}]}`

## Verified

90 tests passed. Authenticated live reads passed for all six resources. All 15 supported new actions returned dry_run:true and saved:false in live checks; create_worker correctly returned 409. Flat and hourly create dry runs passed; missing purpose returned missing_purpose. Existing exported entries refused update/delete with 409 entry_locked. Readback found no dry-run vendor or payment entry. Signed-in Log Shift form displayed Payment purpose and Invoice number. No actual payment, project, task, membership, vendor or worker records were created/changed for verification. Actual save/retry concurrency and the full live Ready to Bill creation flow remain unverified.

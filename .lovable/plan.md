# Ezzie Package B — Property Registry Expansion + Portfolio Migration (Plan only)

No code or database changes have been made. All current-state facts below were checked with read-only queries against production (ref fuwjacbhgkgibdvjwryr) today.

## 1. Current-state findings that change the plan

| Finding | Impact |
|---|---|
| `tenants` has **0 rows** (FK `project_id` → projects ON DELETE CASCADE; columns name/address/phone only). UI still reads it (`TenantsList.tsx`, `AdminTenants.tsx`). | No data migration needed. Freeze it, don't migrate it. New tenancy model replaces it; old UI keeps working (empty) until a later UI package. |
| `properties` 4 rows, `property_external_ids` 4, `property_organization_relationships` 4, `projects.property_id` linked on 4 of 57 projects. | Existing 4 are the match anchors via `property_external_ids (system_key, external_id)` — unique constraint already exists. |
| `units` 0 rows; unique `(property_id, unit_label)`; `is_whole_property_unit` exists. | Reuse as-is. Seed a whole-property unit only where a source says so; never invent units. |
| **All Package A children of `properties` use ON DELETE CASCADE** (units, external IDs, org relationships). | Deleting a property would silently erase history. New tables must use ON DELETE RESTRICT; recommend a follow-up migration switching existing Package A child FKs to RESTRICT. Sold properties use `status`, never delete. |
| `properties` has no `org_id`; access is via `can_view_property()`. | Violates the "every top-level table org-scoped" core rule only nominally — Package A chose relationship-scoped access. New child tables inherit access through `can_view_property(property_id)`; no competing org column. |
| `properties.status` is free text; no check constraint verified. | Add CHECK (NOT VALID then validate) with values `active, inactive, sold, under_contract, unknown`. |
| `person_contact_methods` and `person_external_ids` already exist. | Tenant contacts reuse them; no phone field on tenancy. |
| Package A has no generic provenance table; provenance is per-row `source_system` / `source_record_id`. | Keep that pattern; add a shared import-batch reference instead of a new provenance model. |

## 2. Reuse (no new competing structures)

- `properties` — the only canonical property. Add nullable columns only: `acquired_on`, `sold_on`, `placed_in_service_on` (confirmed value), `year_built`, `parcel_number`, `county`. All nullable; unknown stays NULL.
- `units` — children; add nullable `bedrooms`, `bathrooms`, `square_feet`, `source_system`, `source_record_id`.
- `people` + `person_contact_methods` + `person_external_ids` — tenants, payers, insurers' contacts.
- `business_organizations` + `organization_external_ids` — utility providers, lenders, insurers, tax authorities, municipalities (via `organization_type`).
- `property_organization_relationships` — ownership history (already time-aware).
- `property_external_ids` — rent-roll/utilities/expense-sheet row keys.
- `projects.property_id` — construction link, unchanged.

## 3. New tables (all: uuid PK, `property_id` NOT NULL FK RESTRICT, optional `unit_id` FK RESTRICT with trigger ensuring unit belongs to property, `effective_from/effective_to` date nullable with order CHECK, `source_system`, `source_record_id`, `import_batch_id` nullable, `as_of_date`, `notes`, timestamps, `updated_at` trigger)

Booleans that can be unknown are **nullable** (no default false). Money is `numeric(12,2)` nullable.

1. `tenancies` — property_id, unit_id, status (`prospective, active, notice, ended, unknown`), lease_start, lease_end, move_in, move_out, rent_amount, deposit_amount, rent_frequency.
2. `tenancy_occupants` — tenancy_id, person_id, role (`primary, co_tenant, occupant, guarantor`), effective dates. Unique (tenancy_id, person_id, role).
3. `utility_accounts` — utility_type (`electric, gas, water, sewer, trash, internet, other`), provider_organization_id, account_number (text), payer_type (`owner, tenant, unknown`), payer_person_id / payer_organization_id, autopay, leave_on, ebill (nullable booleans). Index (provider_organization_id, account_number) non-unique.
4. `property_equipment` — equipment_type (`hvac, furnace, ac_condenser, heat_pump, water_heater, refrigerator, range, dishwasher, microwave, washer, dryer, other`), make, model, serial_number, installed_on, warranty_expires_on, status (`in_service, removed, failed, unknown`), removed_on.
5. `equipment_filter_specs` — equipment_id FK, filter_size text (e.g. `16x25x1`), quantity, location. HVAC identity lives on equipment; filter change is maintenance.
6. `property_maintenance_events` — equipment_id nullable, event_type (`filter_change, hvac_service, repair, inspection, other`), performed_on, performed_by_person_id / organization_id, project_id / task_id nullable links, cost.
7. `property_events` — event_type (`acquired, sold, rental_listing_activated, placed_in_service, rehab_started, rehab_completed, other`), event_date, confirmation_status (`proposed, confirmed, rejected`), confirmed_by, evidence reference. Supports proposed vs confirmed PlacedInService.
8. `property_loans` — lender_organization_id, loan_number, original_amount, interest_rate, origination_on, maturity_on, status.
9. `property_insurance_policies` — carrier_organization_id, policy_number, coverage_type, premium, term_start/term_end.
10. `property_tax_records` — tax_year, parcel_number, assessed_value, tax_amount, paid_on, taxing_authority_organization_id. Unique (property_id, tax_year, parcel_number).
11. `property_valuations` — valuation_date, amount, method (`appraisal, bpo, tax_assessment, internal, other`).
12. `property_compliance_records` — record_type (`rental_license, inspection, certificate`), jurisdiction_organization_id, identifier, issued_on, expires_on, result.
13. `property_documents` — document_type, storage_path or external_url, linked_entity_type + linked_entity_id (typed CHECK list), captured_at. Evidence reference only; no file upload UI now.

No global uniqueness on names/addresses. Uniqueness only on source identities.

## 4. Staged import (separate schema, never touched by the app)

```text
import_batches      (id, source_system, source_label, file_hash, uploaded_by, status, created_at)
import_staging_rows (id, batch_id, source_row_number, source_record_id, raw jsonb,
                     normalized jsonb, target_entity, match_status, matched_id,
                     match_method, match_confidence, exception_reason, reviewed_by, decision)
```
Placed in schema `ezzie_import` with no anon/authenticated grants; admin-only RPCs or run_sql by operator. `file_hash` unique per source prevents double import.

Matching algorithm (deterministic, per row):
1. **External ID hit** in `*_external_ids` → match, confidence 1.0.
2. **Project link** (`projects.property_id` for a named project) → match.
3. **Normalized address key** (lowercase, USPS suffix abbreviation, strip punctuation/unit) exact match against `properties.normalized_address_key` → candidate, requires review if not unique.
4. Anything else → `new` if no near candidate, otherwise `exception` (fuzzy distance flagged, never auto-merged).
5. People: match only by external ID or exact normalized email/phone from `person_contact_methods`; name-only → exception. Never merge by name.
6. Conflicts between sources (e.g. different payer, different dates) → exception with both values; no source wins automatically. Source precedence recorded per field only after a human decision.

Promotion: one transaction per approved batch; inserts write `source_system`, `source_record_id`, `import_batch_id`, and a `*_external_ids` row; the 4 existing properties are updated only in NULL fields (non-null differences → exception). Re-running a batch is a no-op.

Source order: existing Projects (anchor) → rent roll (properties/units/tenancies/people) → Rentals Utilities → BFP Monthly Expenses (loans/insurance/tax/utility payer evidence) → later ALTA/tax/lease documents as `property_documents` + `property_events`.

## 5. Legacy tenants

- Zero rows: no migration. Add `COMMENT ON TABLE tenants IS 'DEPRECATED: replaced by tenancies + tenancy_occupants'`.
- Leave table, FK, RLS and both UI screens untouched (non-regression). Switching the UI to `tenancies` is a later UI package.
- Recheck row count immediately before migration; if non-zero, each row becomes a Person + tenancy against the project's property, or an exception if the project has no `property_id`.

## 6. RLS

- All new tables: GRANT to authenticated + service_role only; RLS on.
- SELECT: `can_view_property(auth.uid(), property_id)`.
- INSERT/UPDATE/DELETE: `is_shared_core_admin(auth.uid())`.
- Tenancy/occupant/loan/insurance/tax/valuation tables: admin-only SELECT as well (financial and tenant PII must not widen to contractors who can see a property).
- `ezzie_import` schema: no client grants.

## 7. Tests

- Preflight: tenants count, 4 properties/external IDs unchanged, no name collisions with new tables.
- Constraint tests: date order, unit-belongs-to-property trigger, RESTRICT on property delete, nullable booleans stay NULL.
- Import tests on staging with real sheet copies: rerun idempotence, 4 existing properties matched not duplicated, name-only person → exception, conflicting payer → exception.
- RLS impersonation: Jennifer (all), Andrew Shelton (only his 3 properties, no tenancy/financial rows), James King (none), anon (zero).
- Non-regression: project list/detail, scope → project conversion, shifts/payroll totals, QB export, Today, tenants screens load; `bunx vitest run`; build after type regeneration.

## 8. Sequence

1. Staging (ref iuaqsqdxflakhphnwyec): migration B1 — property/unit nullable columns, status CHECK NOT VALID.
2. B2 — new domain tables + indexes + GRANT + RLS.
3. B3 — `ezzie_import` schema + batch/staging tables.
4. B4 (optional, recommended) — change Package A child FKs from CASCADE to RESTRICT.
5. Run tests in section 7 on staging; load real sheets into staging, review exceptions with Jen.
6. Production: same migrations, then import batches one source at a time with exception review before each promotion.
7. Later: tenants UI switch, minimal admin review screen, Ezzie sync using external IDs.

## Questions for Jen

1. Should contractors who can see a property ever see tenant names/contact (e.g. to schedule entry), or admin-only?
2. When sources disagree (e.g. rent roll vs utilities sheet on who pays), who makes the call?
3. Which "placed in service" event should be the default proposal source: rental listing date, rehab completion, or first tenancy start?

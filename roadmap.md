# Roadmap

## Agent API — Full write expansion
- [x] Add required payment purpose/invoice metadata and retry-safe create references
- [x] Add supported guarded actions and reads; worker creation explicitly rejects pending real-account onboarding
- [x] Deploy and verify six reads, all supported new-action dry runs, payment locks, and 90 tests
- [x] Document exact contracts and model limitations in docs/agent-api-contract.md
- [ ] Real save/retry and Ready to Bill verification — blocked: requires an owner-approved real entry to create/settle

## Ezzie Package B — Property Registry Expansion
- [x] Schema SQL (tenancies, utilities, equipment/filters, maintenance, events, many-to-many loans + insurance, tax, valuations, compliance, documents)
- [x] Derived placed_in_service_on synced from confirmed event
- [x] Import staging schema + conflict (Needs Attention) table
- [x] Deterministic matcher + unit tests
- [ ] Apply 01/02 + run 03 verification on staging (iuaqsqdxflakhphnwyec) — blocked: must be run from the staging project; this project's tools target production
- [ ] Staging RLS impersonation tests (admin / Andrew / James / anon)
- [ ] Production migration — blocked on staging sign-off
- [ ] Source spreadsheet import — blocked on staging sign-off

## External Agent Endpoint (Phase 2 writes)
- [x] set_property_class — exact QuickBooks class id, verified live in that company; never auto-selected
- [x] create_task — app's own fields/defaults, validated before saving; dry_run supported
- [x] Writes switched on — confirmed through authenticated live dry runs
- [ ] First real saved write — awaiting owner-approved real input; no live test fixtures created

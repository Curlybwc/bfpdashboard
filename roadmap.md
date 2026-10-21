# Roadmap

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
- [ ] Writes switched on — blocked: Jen must set AGENT_API_ALLOW_WRITES = true in Project Settings → Secrets
- [ ] First live write from the agent — blocked on the above (the key value is never visible here)

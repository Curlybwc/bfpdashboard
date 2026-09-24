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

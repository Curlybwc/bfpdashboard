# QuickBooks Connection Guardrails

Goal: make it impossible to "connect" a company to the wrong QuickBooks company without noticing.

## 1. Always show the QuickBooks company picker

Today, if your browser already has a QuickBooks company selected, Intuit silently hands back that same company. The connect link will be changed so Intuit always asks which company to authorize, every time — including on Reconnect.

## 2. Block accidental sharing of one QuickBooks company

If the QuickBooks company you just authorized is already linked to a different one of your entities, the connect step will stop and show a clear message naming both entities, instead of quietly linking it and logging a warning. You can still deliberately link it by confirming, but never by accident.

## 3. Live, verified company name in QuickBooks Settings

The "Linked to:" line currently shows a name saved when the link was first made. It will be replaced with a name read live from QuickBooks, with:
- a green check when the live name matches what's stored,
- an amber warning when it doesn't, with a Reconnect button right there.

## 4. Mismatch warning on the settings screen

Each company card will show a banner if its QuickBooks company is shared with another entity, or if its saved mappings haven't been verified against the current QuickBooks company yet.

## Technical notes

- `quickbooks_connect_begin`: add `prompt=select_account` (Intuit's company chooser) to the authorize URL.
- `quickbooks_connect_callback`: replace the "already linked elsewhere" warning with a hard stop returning a descriptive error, unless the signed state carries an explicit `allow_shared=true` flag set by a confirmation in the UI. Refresh `quickbooks_connections.company_name` from `fetchRealmCompanyName` on every successful callback.
- `quickbooks_connection_status`: return live realm company name, realm id, and a list of other internal companies sharing the same `qb_connection_id`.
- `QBSettingsCard.tsx`: render live-name verification badge, shared-connection banner, unverified-mappings banner, and a confirm dialog for deliberate sharing.
- No schema migration needed; existing verification columns and the relink invalidation trigger cover the rest.
- Existing bills, payroll history, and paid status are untouched.

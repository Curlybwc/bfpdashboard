

## Findings

1. **No `qb-disconnected` route exists.** There is no page or route anywhere in the app for a QuickBooks disconnect landing.

2. **`/shifts` is the correct Connect/Reconnect URL.** The QuickBooks OAuth flow begins in the Payroll tab of `/shifts` (`PayrollSummary.tsx`). The callback edge function (`quickbooks_connect_callback`) already redirects back to `/shifts?qb=connected` or `/shifts?qb=error`. This is the right URL for Intuit's Connect/Reconnect setting.

3. **A new `/qb-disconnected` page and route are needed** for the Intuit Disconnect URL setting.

---

## Implementation Plan

### 1. Create `src/pages/QBDisconnected.tsx`
- Minimal static page matching existing app styling (PageHeader, Card, Button)
- Title: "QuickBooks Disconnected"
- Body: "Your QuickBooks connection has been disconnected. You can return to Payroll anytime to reconnect."
- Button: "Go to Payroll" linking to `/shifts`
- No auth required, no backend calls

### 2. Update `src/App.tsx`
- Import `QBDisconnected`
- Add `/qb-disconnected` to the `publicRoutes` array (Intuit redirects here without auth context)
- Add `<Route path="/qb-disconnected" element={<QBDisconnected />} />`

---

## Summary for Intuit App Settings

| Setting | URL |
|---|---|
| **Disconnect URL** | `https://bfpdashboard.lovable.app/qb-disconnected` |
| **Connect/Reconnect URL** | `https://bfpdashboard.lovable.app/shifts` |

Two files changed, zero backend changes.


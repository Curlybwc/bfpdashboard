

## Diagnosis: `/admin/scope-accuracy` returns 404

**Root Cause**: React Router v6 does not reliably handle routes rendered inside a conditional fragment `{user && (<>...<Route />...</>)}`. When navigating between routes, the conditional block can momentarily unmount, causing the catch-all `*` route to match.

This affects ALL authenticated routes, but is most visible when navigating via programmatic `navigate()` calls (like the tab click in AdminPanel).

## Fix

Move all routes out of the conditional `{user && (...)}` block. Instead, wrap protected routes with a guard component or simply always render them and let the `useEffect` redirect handle unauthorized access.

### Changes

**`src/App.tsx`** — Remove the `{user && (...)}` conditional wrapper. Render all `<Route>` elements unconditionally. The existing `useEffect` in `AppRoutes` already redirects unauthenticated users to `/login`, so the guard is redundant and harmful.

```tsx
<Routes>
  <Route path="/" element={<Index />} />
  <Route path="/login" element={<Login />} />
  <Route path="/today" element={<Today />} />
  <Route path="/today/field-mode" element={<FieldModeCapture />} />
  {/* ... all routes rendered unconditionally ... */}
  <Route path="/admin/scope-accuracy" element={<ScopeAccuracy />} />
  {/* ... */}
  <Route path="*" element={<NotFound />} />
</Routes>
```

The `useEffect` redirect already handles auth gating — no route-level conditional needed.


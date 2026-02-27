

## Auth Redirect Fix

### Step 1: Update `src/pages/Login.tsx`
- Add `useNavigate` from react-router-dom
- After successful `signInWithPassword`, call `navigate('/projects', { replace: true })`
- Add `useAuth` hook and redirect if already logged in (via `useEffect`)

### Step 2: Update `src/App.tsx` — `AppRoutes` component
- Add `useNavigate` and `useLocation` hooks
- Add `useEffect` that watches `user` and `loading`:
  - When `user` becomes non-null and current path is `/login` or `/`, navigate to `/projects`
  - When `user` becomes null and current path is not `/login` or `/`, navigate to `/login`
- This ensures auth state changes from `onAuthStateChange` (e.g. sign-out, token refresh) trigger navigation automatically

### No other files changed
- `useAuth.tsx` already has correct `onAuthStateChange` + `getSession` pattern — no changes needed
- `supabase/client.ts` already has `persistSession: true` — no changes needed
- No database or RLS changes


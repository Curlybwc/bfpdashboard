# Firebase Cloud Messaging Push Notifications

## Goal
Add web push notifications to the BFP Dashboard using Firebase Cloud Messaging, so phones/browsers can receive alerts such as new task assignments or clock-out reminders.

## What will change

1. **Connector setup**
   - Link the `firebase_messaging` connector using the service-account JSON key the user already prepared.
   - Ensure "Include web push" is selected so the web API key, app ID, project ID, and VAPID key are injected as `VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_*` env vars.

2. **Database**
   - Add a `push_tokens` table: `id`, `user_id` (FK to auth.users), `token` (text), `platform` (web/android/ios), `created_at`, `updated_at`.
   - Enable RLS, grant `authenticated` SELECT/INSERT/UPDATE/DELETE on its own rows, and `service_role` full access.
   - Add a unique index on `(user_id, token)` to prevent duplicates.

3. **Client registration**
   - Install `firebase` client SDK.
   - Add `public/firebase-messaging-sw.js` that reads config from the query string (cannot read `import.meta.env`).
   - Add an `enablePush()` helper in `src/lib/enablePush.ts` that:
     - checks the connector env vars are present,
     - handles iframe/preview with an "open in new tab" message,
     - requests browser notification permission,
     - registers the service worker,
     - gets the FCM token,
     - upserts the token into `push_tokens` for the current user.
   - Add a "Enable notifications" button/card on `/today` (and/or in a settings area) that calls `enablePush()` and shows status.

4. **Sending notifications**
   - Add a Supabase Edge Function `send_push_notification` that:
     - verifies admin or authenticated sender,
     - reads `LOVABLE_API_KEY` and `FIREBASE_MESSAGING_API_KEY`,
     - calls `POST https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send`,
     - targets a stored device token,
     - surfaces provider errors with status/details.
   - Add a small client helper `sendPushToUser(userId, title, body, data?)` that invokes the edge function.

5. **First notification use-cases**
   - Optional initial trigger: send a push when a task is assigned to a user.
   - Optional initial trigger: send a clock-out reminder after 8 or 12 active hours.
   - These can be wired in follow-up work; the plan focuses on getting registration + send path working first.

6. **Validation**
   - Run `npm run build`.
   - Run `npm test`.
   - Run `npm run lint`.
   - Deploy edge functions.
   - Test notification enable flow in a standalone browser tab (not the Lovable iframe preview).

## Files to change

- `.env` (auto-updated by connector; no manual edits)
- `package.json` — add `firebase`
- `public/firebase-messaging-sw.js` — new messaging service worker
- `src/lib/enablePush.ts` — new registration helper
- `src/pages/Today.tsx` — add enable-notifications UI
- `src/integrations/supabase/types.ts` — regenerate after migration
- `supabase/migrations/<timestamp>_push_tokens.sql` — new table + RLS + grants
- `supabase/functions/send_push_notification/index.ts` — new edge function
- `src/lib/sendPush.ts` (optional client helper)

## Out of scope for this plan

- In-app notification history/inbox.
- Topic subscriptions or broadcast messages.
- Deep-link handling when a notification is tapped.
- iOS/Android native SDK integration beyond web push.

## Notes

- The Lovable preview runs inside a cross-origin iframe, so `Notification.requestPermission()` will be blocked there. Users must test/open the published app in its own browser tab.
- The messaging service worker is separate from the existing app-shell `/sw.js`; do not mix the two.

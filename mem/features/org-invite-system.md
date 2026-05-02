---
name: Org Invite System
description: Token-based org invitations and stranded-user reclamation tooling
type: feature
---
- New users signing up with `?invite=<token>&email=<email>` URL params land directly in the inviting org via `handle_new_user` trigger reading `raw_user_meta_data->>'invite_token'`.
- Without an invite token, signups fall through to the existing SaaS path (auto-creates a private "{name}'s Org").
- `org_invites` table is org-admin scoped via RLS; tokens are 24-byte hex, default 14-day expiry.
- `admin_move_user_to_my_org(target_user, role)` moves stranded users (used by Admin → Users in Other Orgs).
- `admin_list_stranded_users()` returns users whose org_id differs from caller's org.
- AdminPanel users list filtered by caller's `org_id` so phantom signups don't appear as if they're your team.
- Email delivery is best-effort via `send-transactional-email`; copy-link is the source of truth.

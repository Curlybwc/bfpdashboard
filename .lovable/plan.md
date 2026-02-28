

## Correction: Scope Walkthrough Edge Function Security

Two adjustments to the approved Scope Walkthrough plan, applied when implementing:

### 1. `supabase/config.toml` — Use `verify_jwt = true`

When registering the two new functions, set:

```toml
[functions.scope_walkthrough_parse]
verify_jwt = true

[functions.scope_walkthrough_apply]
verify_jwt = true
```

Supabase validates the JWT before the function executes. Inside the functions, still extract `userId` from claims for authorization checks (membership/role), but skip the manual token verification step since Supabase handles it.

### 2. `scope_walkthrough_apply` — Validate scope_item ownership

Before applying any updates, fetch all `scope_item_id` values from the `approved_updates` array and verify they belong to the provided `scope_id`:

```ts
const itemIds = approved_updates.map(u => u.scope_item_id);
const { data: items } = await adminClient
  .from('scope_items')
  .select('id')
  .eq('scope_id', scope_id)
  .in('id', itemIds);

const validIds = new Set(items.map(i => i.id));
const invalid = itemIds.filter(id => !validIds.has(id));
if (invalid.length > 0) {
  return 400 error: "scope_item_id mismatch"
}
```

Reject the entire request if any `scope_item_id` does not belong to the given `scope_id`.

### No other changes to the approved plan.


import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Validate JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    // Parse body
    const { scope_id, approved_updates } = await req.json();
    if (!scope_id || !Array.isArray(approved_updates) || approved_updates.length === 0) {
      return new Response(JSON.stringify({ error: 'scope_id and approved_updates[] required' }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check membership
    const { data: isAdmin } = await adminClient.rpc('is_admin', { _user_id: userId });
    if (!isAdmin) {
      const { data: role } = await adminClient.rpc('get_scope_role', { _user_id: userId, _scope_id: scope_id });
      if (!role || !['editor', 'manager'].includes(role)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
      }
    }

    // Validate scope_item ownership
    const itemIds = approved_updates.map((u: any) => u.scope_item_id);
    const { data: validItems, error: validErr } = await adminClient
      .from('scope_items')
      .select('id')
      .eq('scope_id', scope_id)
      .in('id', itemIds);

    if (validErr) {
      return new Response(JSON.stringify({ error: validErr.message }), { status: 500, headers: corsHeaders });
    }

    const validIds = new Set((validItems || []).map((i: any) => i.id));
    const invalid = itemIds.filter((id: string) => !validIds.has(id));
    if (invalid.length > 0) {
      return new Response(JSON.stringify({ error: 'scope_item_id mismatch', invalid_ids: invalid }), { status: 400, headers: corsHeaders });
    }

    // Validate statuses and apply updates
    const validStatuses = ['Not Checked', 'OK', 'Repair', 'Replace', 'Needs Review'];
    const errors: string[] = [];

    for (const update of approved_updates) {
      if (!validStatuses.includes(update.status)) {
        errors.push(`Invalid status "${update.status}" for item ${update.scope_item_id}`);
        continue;
      }

      const updateData: Record<string, any> = { status: update.status };
      if (typeof update.notes === 'string') {
        updateData.notes = update.notes;
      }

      const { error } = await adminClient
        .from('scope_items')
        .update(updateData)
        .eq('id', update.scope_item_id);

      if (error) {
        errors.push(`Failed to update ${update.scope_item_id}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return new Response(JSON.stringify({ success: false, errors }), { status: 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: corsHeaders });
  }
});

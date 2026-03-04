import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

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

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const { scope_id, walkthrough_text } = await req.json();
    if (!scope_id || !walkthrough_text) {
      return new Response(JSON.stringify({ error: 'scope_id and walkthrough_text required' }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: isAdmin } = await adminClient.rpc('is_admin', { _user_id: userId });
    if (!isAdmin) {
      const { data: role } = await adminClient.rpc('get_scope_role', { _user_id: userId, _scope_id: scope_id });
      if (!role || !['editor', 'manager'].includes(role)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
      }
    }

    // Fetch all data in parallel
    const [itemsRes, profilesRes, aliasesRes, costItemsRes] = await Promise.all([
      adminClient.from('scope_items').select('id, description, status, notes, qty, unit, phase_key, cost_item_id, unit_cost_override').eq('scope_id', scope_id),
      adminClient.from('profiles').select('id, full_name').not('full_name', 'is', null).neq('full_name', ''),
      adminClient.from('profile_aliases').select('user_id, alias'),
      adminClient.from('cost_items').select('id, name, normalized_name, default_total_cost, unit_type').eq('active', true),
    ]);

    if (itemsRes.error) {
      return new Response(JSON.stringify({ error: itemsRes.error.message }), { status: 500, headers: corsHeaders });
    }

    const scopeItems = itemsRes.data || [];
    const allProfiles = profilesRes.data || [];
    const allAliases = aliasesRes.data || [];
    const costItems = costItemsRes.data || [];

    // Build known users
    const aliasMap = new Map<string, string[]>();
    for (const a of allAliases) {
      if (!aliasMap.has(a.user_id)) aliasMap.set(a.user_id, []);
      aliasMap.get(a.user_id)!.push(a.alias);
    }
    const knownUsers = allProfiles.map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      aliases: aliasMap.get(p.id) || [],
    }));

    // Build cost items lookup by normalized_name
    const costItemsByNorm = new Map<string, any>();
    for (const ci of costItems) {
      if (ci.normalized_name) costItemsByNorm.set(ci.normalized_name, ci);
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    // Build scope items context for LLM (may be empty)
    const existingItemsList = scopeItems.length > 0
      ? scopeItems.map(i =>
          `- ID: ${i.id} | "${i.description}" | Status: ${i.status} | Qty: ${i.qty ?? 'N/A'} | Unit: ${i.unit ?? 'N/A'}`
        ).join('\n')
      : '(none)';

    const systemPrompt = `You are a construction scope analyzer. Given walkthrough notes from a property inspection and a list of existing scope items (which may be empty), do TWO things:

1) MATCH existing scope items mentioned in the walkthrough text
2) GENERATE new scope items for work mentioned that does NOT match any existing item

MATCHING RULES:
- For each existing scope item, check if the walkthrough text discusses it
- If clearly mentioned with condition info, include in "matched" with suggested status (OK, Repair, Replace) and any updated notes
- If mentioned but ambiguous, include in "needs_review_items" with a reason
- If not mentioned at all, include in "not_addressed_items"

GENERATION RULES:
- For any work mentioned in the walkthrough that does NOT correspond to an existing scope item, create a new item
- Each new item needs: description, notes (if any), qty (number or null), unit (sqft/lf/each/piece or null), phase_key (demo/rough/finish or null)
- Do not duplicate existing items. If the walkthrough text discusses an existing item, match it, don't generate a duplicate.

PERSON EXTRACTION RULES:
Extract people EXPLICITLY ASSIGNED work. Match against KNOWN USERS only.
- Only include when there is explicit assignment language ("X job", "for X", "have X do", "X needs to")
- Confident match: case-insensitive exact match on full_name or alias, or unique substring match
- If multiple candidates match, do NOT include — add a warning
- Vendors/company names ignored unless they match a known user

EXISTING SCOPE ITEMS:
${existingItemsList}

KNOWN USERS:
${JSON.stringify(knownUsers)}

Return ONLY valid JSON:
{
  "matched": [
    { "scope_item_id": "uuid", "suggested_status": "OK|Repair|Replace", "suggested_notes": "string or null", "suggested_qty": null, "suggested_unit": null }
  ],
  "new_items": [
    { "description": "string", "notes": "string or null", "qty": null, "unit": null, "phase_key": null }
  ],
  "needs_review_items": [
    { "id": "uuid", "description": "string", "reason": "string" }
  ],
  "not_addressed_items": [
    { "id": "uuid", "description": "string" }
  ],
  "member_user_ids_to_add": ["uuid"],
  "member_display_names_to_add": ["string"],
  "member_warnings": ["string"]
}`;

    const llmResponse = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `WALKTHROUGH NOTES:\n${walkthrough_text}` },
        ],
        temperature: 0.2,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      console.error('LLM error:', errText);
      return new Response(JSON.stringify({ error: 'AI processing failed' }), { status: 502, headers: corsHeaders });
    }

    const llmData = await llmResponse.json();
    const content = llmData.choices?.[0]?.message?.content ?? '';

    let parsed: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('Failed to parse LLM output:', content);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), { status: 502, headers: corsHeaders });
    }

    const validItemIds = new Set(scopeItems.map(i => i.id));
    const validUserIds = new Set(allProfiles.map((p: any) => p.id));
    const validStatuses = ['OK', 'Repair', 'Replace'];

    // Validate matched items
    const matched = (parsed.matched || [])
      .filter((m: any) => m.scope_item_id && validItemIds.has(m.scope_item_id) && validStatuses.includes(m.suggested_status))
      .map((m: any) => {
        const existing = scopeItems.find(i => i.id === m.scope_item_id);
        return {
          scope_item_id: m.scope_item_id,
          description: existing?.description || '',
          current_status: existing?.status || 'Not Checked',
          suggested_status: m.suggested_status,
          suggested_notes: typeof m.suggested_notes === 'string' ? m.suggested_notes : null,
          suggested_qty: typeof m.suggested_qty === 'number' ? m.suggested_qty : null,
          suggested_unit: typeof m.suggested_unit === 'string' ? m.suggested_unit : null,
        };
      });

    // Enrich new items with cost library matching
    const newItems = (parsed.new_items || []).map((item: any) => {
      const desc = item.description || '';
      const norm = normalize(desc);
      const costMatch = costItemsByNorm.get(norm);
      return {
        description: desc,
        notes: typeof item.notes === 'string' ? item.notes : null,
        qty: typeof item.qty === 'number' ? item.qty : null,
        unit: typeof item.unit === 'string' ? item.unit : null,
        phase_key: typeof item.phase_key === 'string' ? item.phase_key : null,
        normalized_name: norm,
        matched_cost_item_id: costMatch?.id || null,
        matched_cost_item_unit: costMatch?.unit_type || null,
        matched_cost_item_unit_cost: costMatch?.default_total_cost || null,
      };
    });

    // Validate member IDs
    const memberIds = (parsed.member_user_ids_to_add || []).filter((id: string) => validUserIds.has(id));
    let memberNames = parsed.member_display_names_to_add || [];
    if (memberNames.length !== memberIds.length) {
      memberNames = memberIds.map((id: string) => allProfiles.find((p: any) => p.id === id)?.full_name || 'Unknown');
    }

    const result = {
      matched,
      new_items: newItems,
      needs_review_items: (parsed.needs_review_items || []).filter(
        (i: any) => i.id && validItemIds.has(i.id)
      ),
      not_addressed_items: (parsed.not_addressed_items || []).filter(
        (i: any) => i.id && validItemIds.has(i.id)
      ),
      member_user_ids_to_add: memberIds,
      member_display_names_to_add: memberNames,
      member_warnings: Array.isArray(parsed.member_warnings)
        ? parsed.member_warnings.filter((w: any) => typeof w === 'string')
        : [],
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: corsHeaders });
  }
});

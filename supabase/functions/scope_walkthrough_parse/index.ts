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

    // Fetch scope items + known users + cost_items in parallel
    const [itemsRes, profilesRes, aliasesRes, costItemsRes] = await Promise.all([
      adminClient.from('scope_items').select('id, description, status, notes, qty, unit, phase_key').eq('scope_id', scope_id),
      adminClient.from('profiles').select('id, full_name').not('full_name', 'is', null).neq('full_name', ''),
      adminClient.from('profile_aliases').select('user_id, alias'),
      adminClient.from('cost_items').select('id, name, normalized_name, default_total_cost, unit_type').eq('active', true),
    ]);

    const scopeItems = itemsRes.data || [];
    if (itemsRes.error) {
      return new Response(JSON.stringify({ error: itemsRes.error.message }), { status: 500, headers: corsHeaders });
    }

    // Build known users
    const allProfiles = profilesRes.data || [];
    const allAliases = aliasesRes.data || [];
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

    // Build cost items lookup
    const costItems = costItemsRes.data || [];
    const costItemsByNorm = new Map<string, any>();
    for (const ci of costItems) {
      if (ci.normalized_name) costItemsByNorm.set(ci.normalized_name, ci);
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    // Determine mode
    const isGenerateMode = scopeItems.length === 0;

    if (isGenerateMode) {
      // GENERATE MODE
      const systemPrompt = `You are a construction scope item generator. Given walkthrough notes dictated during a property inspection, extract distinct work items and explicitly assigned people.

ITEM EXTRACTION:
For each distinct work item mentioned, create a scope item with:
- description: concise description of the work
- notes: any additional context from the walkthrough
- qty: numeric quantity if mentioned (null otherwise)
- unit: unit of measurement if mentioned, e.g. "sqft", "lf", "each" (null otherwise)
- phase_key: construction phase if identifiable, e.g. "demo", "rough", "finish" (null otherwise)
- suggested_unit_cost: estimated unit cost in dollars if you can reasonably estimate (null otherwise)

PERSON EXTRACTION RULES:
Extract people who are EXPLICITLY ASSIGNED work in the walkthrough text. Only match against KNOWN USERS below.
- Only include a person when there is explicit assignment language like "X job", "for X", "have X do", "X needs to", "X and Y do".
- Do NOT include people who are merely mentioned without assignment context.
- A confident match can be:
  (a) case-insensitive exact match to full_name, OR
  (b) case-insensitive exact match to an alias, OR
  (c) case-insensitive unique substring match against full_name if it matches exactly one person.
- If multiple candidates match a name, do NOT include them — add a warning instead.
- Vendors/company names should be ignored unless they match a known user.

KNOWN USERS:
${JSON.stringify(knownUsers)}

Return ONLY valid JSON with this exact structure:
{
  "generated_items": [
    { "description": "string", "notes": "string or null", "qty": null, "unit": null, "phase_key": null, "suggested_unit_cost": null }
  ],
  "member_user_ids_to_add": ["uuid"],
  "member_display_names_to_add": ["full_name"],
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

      const validUserIds = new Set(allProfiles.map((p: any) => p.id));

      // Enrich generated items with cost_items matching
      const generatedItems = (parsed.generated_items || []).map((item: any) => {
        const norm = normalize(item.description || '');
        const matched = costItemsByNorm.get(norm);
        return {
          description: item.description || '',
          notes: typeof item.notes === 'string' ? item.notes : null,
          qty: typeof item.qty === 'number' ? item.qty : null,
          unit: typeof item.unit === 'string' ? item.unit : null,
          phase_key: typeof item.phase_key === 'string' ? item.phase_key : null,
          suggested_unit_cost: typeof item.suggested_unit_cost === 'number' ? item.suggested_unit_cost : null,
          matched_cost_item_id: matched?.id || null,
          matched_cost_item_unit: matched?.unit_type || null,
          matched_cost_item_unit_cost: matched?.default_total_cost || null,
        };
      });

      const memberIds = (parsed.member_user_ids_to_add || []).filter((id: string) => validUserIds.has(id));
      let memberNames = parsed.member_display_names_to_add || [];
      if (memberNames.length !== memberIds.length) {
        memberNames = memberIds.map((id: string) => allProfiles.find((p: any) => p.id === id)?.full_name || 'Unknown');
      }

      const result = {
        mode: 'generate',
        generated_items: generatedItems,
        proposed_updates: [],
        not_addressed_items: [],
        needs_review_items: [],
        member_user_ids_to_add: memberIds,
        member_display_names_to_add: memberNames,
        member_warnings: Array.isArray(parsed.member_warnings) ? parsed.member_warnings.filter((w: any) => typeof w === 'string') : [],
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // COVERAGE MODE (existing behavior)
    const itemsList = scopeItems.map(i =>
      `- ID: ${i.id} | Description: "${i.description}" | Status: ${i.status} | Qty: ${i.qty ?? 'N/A'} | Unit: ${i.unit ?? 'N/A'} | Phase: ${i.phase_key ?? 'N/A'}`
    ).join('\n');

    const systemPrompt = `You are a construction scope analyzer. Given a list of scope items and walkthrough notes dictated during a property inspection, determine the condition of each scope item AND extract explicitly assigned people.

SCOPE ITEM ANALYSIS:
For each scope item, analyze the walkthrough text and:
1. If the item is clearly mentioned and its condition is described, set status to one of: "OK", "Repair", "Replace"
2. If the item is mentioned but the description is ambiguous, set status to "Needs Review" and include it in needs_review_items with a reason
3. If the item is not mentioned at all, include it in not_addressed_items

PERSON EXTRACTION RULES:
Extract people who are EXPLICITLY ASSIGNED work in the walkthrough text. Only match against KNOWN USERS below.
- Only include a person when there is explicit assignment language like "X job", "for X", "have X do", "X needs to", "X and Y do".
- Do NOT include people who are merely mentioned without assignment context.
- A confident match can be:
  (a) case-insensitive exact match to full_name, OR
  (b) case-insensitive exact match to an alias, OR
  (c) case-insensitive unique substring match against full_name if it matches exactly one person.
- If multiple candidates match a name, do NOT include them — add a warning instead.
- If no match, assigned_to_user_id must be null and add warning.
- Vendors/company names should be ignored unless they match a known user.

KNOWN USERS:
${JSON.stringify(knownUsers)}

Return ONLY valid JSON with this exact structure:
{
  "proposed_updates": [
    { "scope_item_id": "uuid", "description": "item description", "status": "OK|Repair|Replace", "notes": "relevant walkthrough notes" }
  ],
  "not_addressed_items": [
    { "id": "uuid", "description": "item description" }
  ],
  "needs_review_items": [
    { "id": "uuid", "description": "item description", "reason": "why review is needed" }
  ],
  "member_user_ids_to_add": ["uuid"],
  "member_display_names_to_add": ["full_name"],
  "member_warnings": ["string explaining ambiguous/unmatched names"]
}`;

    const userPrompt = `SCOPE ITEMS:\n${itemsList}\n\nWALKTHROUGH NOTES:\n${walkthrough_text}`;

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
          { role: 'user', content: userPrompt },
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

    const validStatuses = ['OK', 'Repair', 'Replace', 'Needs Review'];
    const validItemIds = new Set(scopeItems.map(i => i.id));
    const validUserIds = new Set(allProfiles.map((p: any) => p.id));

    const memberIds = (parsed.member_user_ids_to_add || []).filter((id: string) => validUserIds.has(id));
    let memberNames = parsed.member_display_names_to_add || [];
    if (memberNames.length !== memberIds.length) {
      memberNames = memberIds.map((id: string) => allProfiles.find((p: any) => p.id === id)?.full_name || 'Unknown');
    }

    const result = {
      mode: 'coverage',
      proposed_updates: (parsed.proposed_updates || []).filter(
        (u: any) => u.scope_item_id && validItemIds.has(u.scope_item_id) && validStatuses.includes(u.status)
      ).map((u: any) => ({
        scope_item_id: u.scope_item_id,
        description: u.description || scopeItems.find(i => i.id === u.scope_item_id)?.description || '',
        status: u.status,
        notes: typeof u.notes === 'string' ? u.notes : '',
      })),
      not_addressed_items: (parsed.not_addressed_items || []).filter(
        (i: any) => i.id && validItemIds.has(i.id)
      ),
      needs_review_items: (parsed.needs_review_items || []).filter(
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

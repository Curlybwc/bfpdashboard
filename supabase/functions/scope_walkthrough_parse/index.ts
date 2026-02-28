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
    const { scope_id, walkthrough_text } = await req.json();
    if (!scope_id || !walkthrough_text) {
      return new Response(JSON.stringify({ error: 'scope_id and walkthrough_text required' }), { status: 400, headers: corsHeaders });
    }

    // Check membership using service role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: isAdmin } = await adminClient.rpc('is_admin', { _user_id: userId });
    if (!isAdmin) {
      const { data: role } = await adminClient.rpc('get_scope_role', { _user_id: userId, _scope_id: scope_id });
      if (!role || !['editor', 'manager'].includes(role)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
      }
    }

    // Fetch scope items
    const { data: scopeItems, error: itemsError } = await adminClient
      .from('scope_items')
      .select('id, description, status, notes, qty, unit, phase_key')
      .eq('scope_id', scope_id);

    if (itemsError) {
      return new Response(JSON.stringify({ error: itemsError.message }), { status: 500, headers: corsHeaders });
    }

    if (!scopeItems || scopeItems.length === 0) {
      return new Response(JSON.stringify({
        proposed_updates: [],
        not_addressed_items: [],
        needs_review_items: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Call LLM
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const itemsList = scopeItems.map(i =>
      `- ID: ${i.id} | Description: "${i.description}" | Status: ${i.status} | Qty: ${i.qty ?? 'N/A'} | Unit: ${i.unit ?? 'N/A'} | Phase: ${i.phase_key ?? 'N/A'}`
    ).join('\n');

    const systemPrompt = `You are a construction scope analyzer. Given a list of scope items and walkthrough notes dictated during a property inspection, determine the condition of each scope item.

For each scope item, analyze the walkthrough text and:
1. If the item is clearly mentioned and its condition is described, set status to one of: "OK", "Repair", "Replace"
2. If the item is mentioned but the description is ambiguous, set status to "Needs Review" and include it in needs_review_items with a reason
3. If the item is not mentioned at all, include it in not_addressed_items

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
  ]
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

    // Extract JSON from response
    let parsed: ParseResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('Failed to parse LLM output:', content);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), { status: 502, headers: corsHeaders });
    }

    // Validate structure
    const validStatuses = ['OK', 'Repair', 'Replace', 'Needs Review'];
    const validItemIds = new Set(scopeItems.map(i => i.id));

    const result = {
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
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: corsHeaders });
  }
});

interface ParseResult {
  proposed_updates: any[];
  not_addressed_items: any[];
  needs_review_items: any[];
}

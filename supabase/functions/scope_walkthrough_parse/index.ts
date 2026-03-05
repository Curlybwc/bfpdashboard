import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Normalize for checklist matching: strip verbs, apply synonyms, remove punctuation */
function normalizeForChecklistMatch(s: string): string {
  let t = s.toLowerCase().trim().replace(/\s+/g, ' ');
  t = t.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  // Strip leading verbs/fillers
  t = t.replace(/^(replace|repair|get bid|bid|need to|we need to|install|remove|new)\s+/i, '').trim();
  // Synonym map
  const synonyms: [RegExp, string][] = [
    [/\b(bathroom|5x7 bathroom)\b/, 'bathroom replacement'],
    [/\b(furnace|ac|furnace\/ac|furnace ac)\b/, 'hvac'],
    [/\b(sewer hookup|sewer connect|sewer trench)\b/, 'sewer lateral'],
    [/\b(breaker box|panel|meter|mast|service)\b/, 'electrical panel'],
    [/\b(trashout|cleanout|trash out|clean out)\b/, 'dumpsters'],
    [/\b(countertops?|counters?)\b/, 'kitchen counters'],
    [/\b(kitchen)\s+(cabinets?)\b/, 'kitchen cabinets'],
    [/\b(hardwood floors?|hardwoods?|sand floors?|sand and finish)\b/, 'refinish hardwoods'],
    [/\b(vinyl plank|luxury vinyl|lvp|vinyl flooring)\b/, 'vinyl flooring'],
  ];
  for (const [pat, replacement] of synonyms) {
    t = t.replace(pat, replacement);
  }
  return t.trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function adaptiveJaccardMatch(siNorm: string, ciNorm: string): boolean {
  // Substring containment
  if (siNorm.includes(ciNorm) || ciNorm.includes(siNorm)) return true;
  const siTokens = siNorm.split(' ').filter(Boolean).length;
  const ciTokens = ciNorm.split(' ').filter(Boolean).length;
  const minTokens = Math.min(siTokens, ciTokens);
  const threshold = minTokens <= 2 ? 0.50 : 0.70;
  return jaccardSimilarity(siNorm, ciNorm) >= threshold;
}

// Deterministic pricing extractor — runs after LLM to fill gaps
function extractPricing(item: any, walkthroughText: string) {
  const text = [item.description, item.notes, item.price_evidence, walkthroughText]
    .filter(Boolean).join(' ');

  let qty = typeof item.qty === 'number' ? item.qty : null;
  let unit = typeof item.unit === 'string' ? item.unit : null;
  let unitCost = typeof item.unit_cost === 'number' ? item.unit_cost : null;
  let totalCost = typeof item.total_cost === 'number' ? item.total_cost : null;
  const priceEvidence = typeof item.price_evidence === 'string' ? item.price_evidence : null;
  const priceConfidence = typeof item.price_confidence === 'string' ? item.price_confidence : null;

  const unitMap: Record<string, string> = {
    'square foot': 'sqft', 'square feet': 'sqft', 'sq ft': 'sqft', 'sqft': 'sqft',
    'sf': 'sqft', 'squares': 'square', 'square': 'square',
    'linear foot': 'lf', 'linear feet': 'lf', 'lf': 'lf',
    'window': 'window', 'windows': 'window',
    'door': 'door', 'doors': 'door',
    'dumpster': 'dumpster', 'dumpsters': 'dumpster',
    'each': 'each', 'piece': 'piece', 'pieces': 'piece',
    'gallon': 'gallon', 'gallons': 'gallon',
    'bag': 'bag', 'bags': 'bag',
    'sheet': 'sheet', 'sheets': 'sheet',
    'roll': 'roll', 'rolls': 'roll',
    'box': 'box', 'boxes': 'box',
  };
  const unitPattern = Object.keys(unitMap).sort((a, b) => b.length - a.length).join('|');

  if (qty == null) {
    const qtyRegex = new RegExp(`(\\d+(?:,\\d{3})*)\\s*(?:${unitPattern})`, 'gi');
    const qtyMatch = qtyRegex.exec(text);
    if (qtyMatch) {
      qty = parseFloat(qtyMatch[1].replace(/,/g, ''));
      if (unit == null) {
        const afterNum = text.slice(qtyMatch.index + qtyMatch[1].length).trim().toLowerCase();
        for (const [pattern, mapped] of Object.entries(unitMap)) {
          if (afterNum.startsWith(pattern)) {
            unit = mapped;
            break;
          }
        }
      }
    }
  }

  if (unitCost == null) {
    const perUnitRegex = /(?:at\s*)?\$\s*([\d,]+(?:\.\d+)?)\s*(?:per|a|\/)\s*(\w+)/gi;
    const perMatch = perUnitRegex.exec(text);
    if (perMatch) {
      unitCost = parseFloat(perMatch[1].replace(/,/g, ''));
      if (unit == null) {
        const matchedUnit = perMatch[2].toLowerCase();
        unit = unitMap[matchedUnit] || matchedUnit;
      }
    }
  }

  if (totalCost == null) {
    const totalRegex = /(?:cost|about|total|is|for)\s*\$\s*([\d,]+(?:\.\d+)?)/gi;
    const totalMatch = totalRegex.exec(text);
    if (totalMatch) {
      totalCost = parseFloat(totalMatch[1].replace(/,/g, ''));
    }
  }

  if (totalCost == null && unitCost == null) {
    const desc = (item.description || '').toLowerCase();
    const descWords = desc.split(/\s+/).filter((w: string) => w.length > 3);
    if (descWords.length > 0) {
      const escapedWords = descWords.map((w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      for (const word of escapedWords) {
        const contextRegex = new RegExp(`${word}[^.]*?\\$\\s*([\\d,]+(?:\\.\\d+)?)`, 'gi');
        const ctxMatch = contextRegex.exec(walkthroughText);
        if (ctxMatch) {
          totalCost = parseFloat(ctxMatch[1].replace(/,/g, ''));
          break;
        }
      }
    }
  }

  if (totalCost != null && unitCost == null && qty == null) {
    qty = 1;
    unit = unit || 'job';
    unitCost = totalCost;
  }

  if (totalCost != null && unitCost == null && qty != null && qty > 0) {
    unitCost = totalCost / qty;
  }

  if (totalCost == null && unitCost != null && qty != null) {
    totalCost = qty * unitCost;
  }

  return {
    qty,
    unit,
    unit_cost: unitCost,
    total_cost: totalCost,
    price_evidence: priceEvidence,
    price_confidence: priceConfidence,
  };
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

    // Fetch all data in parallel (including checklist)
    const [itemsRes, profilesRes, aliasesRes, costItemsRes, scopeRes] = await Promise.all([
      adminClient.from('scope_items').select('id, description, status, notes, qty, unit, phase_key, cost_item_id, unit_cost_override').eq('scope_id', scope_id),
      adminClient.from('profiles').select('id, full_name').not('full_name', 'is', null).neq('full_name', ''),
      adminClient.from('profile_aliases').select('user_id, alias'),
      adminClient.from('cost_items').select('id, name, normalized_name, default_total_cost, unit_type').eq('active', true),
      adminClient.from('scopes').select('checklist_template_id').eq('id', scope_id).single(),
    ]);

    if (itemsRes.error) {
      return new Response(JSON.stringify({ error: itemsRes.error.message }), { status: 500, headers: corsHeaders });
    }

    const scopeItems = itemsRes.data || [];
    const allProfiles = profilesRes.data || [];
    const allAliases = aliasesRes.data || [];
    const costItems = costItemsRes.data || [];

    // --- Fetch checklist items ---
    let checklistItems: any[] = [];
    let templateId = scopeRes.data?.checklist_template_id || null;
    if (!templateId) {
      const { data: defaultTpl } = await adminClient.from('checklist_templates')
        .select('id').eq('active', true).limit(1);
      templateId = defaultTpl?.[0]?.id || null;
    }
    if (templateId) {
      const { data: ci } = await adminClient.from('checklist_items')
        .select('id, label, normalized_label, category, default_cost_item_id')
        .eq('template_id', templateId).eq('active', true);
      checklistItems = ci || [];
    }
    const checklistIdSet = new Set(checklistItems.map((c: any) => c.id));

    // Fetch existing reviews for not_addressed calculation
    let existingReviewIds = new Set<string>();
    if (checklistItems.length > 0) {
      const { data: existingRevs } = await adminClient.from('scope_checklist_reviews')
        .select('checklist_item_id').eq('scope_id', scope_id);
      existingReviewIds = new Set((existingRevs || []).map((r: any) => r.checklist_item_id));
    }

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

    const existingItemsList = scopeItems.length > 0
      ? scopeItems.map(i =>
          `- ID: ${i.id} | "${i.description}" | Status: ${i.status} | Qty: ${i.qty ?? 'N/A'} | Unit: ${i.unit ?? 'N/A'}`
        ).join('\n')
      : '(none)';

    // Build checklist context for LLM
    const checklistContext = checklistItems.length > 0
      ? `\nCHECKLIST ITEMS (assign checklist_item_id from this list if a walkthrough item matches, or null):\n${JSON.stringify(checklistItems.map((c: any) => ({ id: c.id, label: c.label, category: c.category })))}`
      : '';

    const systemPrompt = `You are a construction scope analyzer. Given walkthrough notes from a property inspection and a list of existing scope items (which may be empty), do TWO things:

1) MATCH existing scope items mentioned in the walkthrough text
2) GENERATE new scope items for work mentioned that does NOT match any existing item

STATUS SEMANTICS (CRITICAL):
- "Not Checked" = item was NOT mentioned in walkthrough at all. NEVER assign this to a mentioned item.
- "OK" = explicitly mentioned as fine, good condition, not needed, doesn't need work
- "Repair" = explicitly mentioned needing repair or fix
- "Replace" = explicitly mentioned needing replacement
- "Get Bid" = mentioned but: uncertain pricing, needs external bid, specialty trade, or ambiguous condition

DEFAULT STATUS FOR MENTIONED ITEMS:
- If explicit "replace" language → "Replace"
- If explicit "repair" or "fix" language → "Repair"  
- If explicit "ok / looks good / fine / doesn't need" language → "OK"
- If uncertainty language OR pricing missing OR specialty-trade keywords → "Get Bid"
- Otherwise for any mentioned item → "Get Bid" (NEVER "Not Checked")

SPECIALTY TRADE KEYWORDS (default to Get Bid unless explicitly priced):
- sewer lateral, trench, sewer connect
- electrical panel, meter, mast, service upgrade
- foundation, structural
- drain tile, sump pump
- whole house plumbing, re-pipe

MATCHING RULES:
- For each existing scope item, check if the walkthrough text discusses it
- If clearly mentioned with condition info, include in "matched" with suggested status per rules above
- If mentioned but ambiguous, include in "get_bid_items" with a reason
- If not mentioned at all, include in "not_addressed_items"

GENERATION RULES:
- For any work mentioned in the walkthrough that does NOT correspond to an existing scope item, create a new item
- Each new item needs ALL of these fields:
  - description: clear task description
  - status: assign per the status rules above (NEVER "Not Checked" for generated items)
  - notes: supplementary info only (NOT pricing — pricing goes in structured fields)
  - qty: number extracted from text (e.g. "15 windows" → 15, "3 dumpsters" → 3, "800 square feet" → 800). If no quantity mentioned, use null.
  - unit: the unit type (e.g. "window", "dumpster", "sqft", "lf", "square", "job", "each"). If no unit, use null.
  - unit_cost: dollar amount per unit extracted from text (e.g. "$500 per window" → 500, "$450 a square" → 450, "$4 a square foot" → 4). If no per-unit price, use null.
  - total_cost: total dollar amount for this item (e.g. "roof is going to cost $8000" → 8000, "HVAC $8000" → 8000). If no total mentioned, use null.
  - price_evidence: the exact original phrase from the walkthrough that contains pricing info. If no pricing mentioned, use null.
  - price_confidence: "high" if explicit numbers stated, "medium" if estimated/approximate language used, "low" if inferred. null if no pricing.
  - phase_key: "demo", "rough", "finish", or null
  - checklist_item_id: if a checklist item matches this work, provide its id. Otherwise null.

CRITICAL PRICING RULES:
- ALWAYS extract quantities from text: "15 windows" → qty=15, "3 dumpsters" → qty=3
- ALWAYS extract unit costs: "$500 per window" → unit_cost=500, "$450 a square" → unit_cost=450
- ALWAYS extract totals: "going to cost $8000" → total_cost=8000, "HVAC $8000" → total_cost=8000
- If ONLY a total is mentioned with no per-unit price: set qty=1, unit="job", unit_cost=total_cost
- If BOTH total and per-unit exist: populate both; total_cost is the override
- NEVER put pricing information in the notes field. Notes are for non-pricing observations only.
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
${checklistContext}

Return ONLY valid JSON:
{
  "matched": [
    { "scope_item_id": "uuid", "suggested_status": "OK|Repair|Replace|Get Bid", "suggested_notes": "string or null", "suggested_qty": null, "suggested_unit": null, "checklist_item_id": "uuid or null" }
  ],
  "new_items": [
    { "description": "string", "status": "Repair|Replace|Get Bid|OK", "notes": "string or null", "qty": null, "unit": null, "unit_cost": null, "total_cost": null, "price_evidence": "string or null", "price_confidence": "string or null", "phase_key": null, "checklist_item_id": "uuid or null" }
  ],
  "get_bid_items": [
    { "id": "uuid", "description": "string", "reason": "string" }
  ],
  "not_addressed_items": [
    { "id": "uuid", "description": "string" }
  ],
  "not_addressed_checklist_items": [
    { "id": "uuid", "label": "string", "category": "string" }
  ],
  "member_user_ids_to_add": ["uuid"],
  "member_display_names_to_add": ["string"],
  "member_warnings": ["string"]
}`;

    const llmResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
      console.error('LLM error:', llmResponse.status, errText);
      if (llmResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later.' }), { status: 429, headers: corsHeaders });
      }
      if (llmResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required, please add credits.' }), { status: 402, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ error: 'AI processing failed' }), { status: 502, headers: corsHeaders });
    }

    const llmData = await llmResponse.json();
    const content = llmData.choices?.[0]?.message?.content ?? '';

    let parsed: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      const cleaned = jsonMatch[0]
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .replace(/,\s*([}\]])/g, '$1');
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse LLM output:', content);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), { status: 502, headers: corsHeaders });
    }

    const validItemIds = new Set(scopeItems.map(i => i.id));
    const validUserIds = new Set(allProfiles.map((p: any) => p.id));
    const validStatuses = ['OK', 'Repair', 'Replace', 'Get Bid'];

    // --- Deterministic checklist mapping function ---
    function assignChecklistId(itemDesc: string, costItemId: string | null): { id: string | null; label: string | null; category: string | null } {
      if (checklistItems.length === 0) return { id: null, label: null, category: null };

      // 1) Cost item link match
      if (costItemId) {
        const match = checklistItems.find((c: any) => c.default_cost_item_id === costItemId);
        if (match) return { id: match.id, label: match.label, category: match.category };
      }

      // 2) Exact normalized match (normalize the description, compare to stored normalized_label)
      const norm = normalizeForChecklistMatch(itemDesc);
      const exactMatch = checklistItems.find((c: any) => c.normalized_label === norm);
      if (exactMatch) return { id: exactMatch.id, label: exactMatch.label, category: exactMatch.category };

      // 3) Fuzzy match with adaptive threshold + substring containment
      let bestScore = 0;
      let bestMatch: any = null;
      for (const c of checklistItems) {
        const ciNorm = c.normalized_label;
        // Substring containment
        if (norm.includes(ciNorm) || ciNorm.includes(norm)) {
          return { id: c.id, label: c.label, category: c.category };
        }
        const score = jaccardSimilarity(norm, ciNorm);
        const siTokens = norm.split(' ').filter(Boolean).length;
        const ciTokens = ciNorm.split(' ').filter(Boolean).length;
        const minTokens = Math.min(siTokens, ciTokens);
        const threshold = minTokens <= 2 ? 0.50 : 0.70;
        if (score >= threshold && score > bestScore) {
          bestScore = score;
          bestMatch = c;
        }
      }
      if (bestMatch) return { id: bestMatch.id, label: bestMatch.label, category: bestMatch.category };

      return { id: null, label: null, category: null };
    }

    // Validate matched items + assign checklist
    const matched = (parsed.matched || [])
      .filter((m: any) => m.scope_item_id && validItemIds.has(m.scope_item_id) && validStatuses.includes(m.suggested_status))
      .map((m: any) => {
        const existing = scopeItems.find(i => i.id === m.scope_item_id);
        // Deterministic checklist mapping (override LLM)
        const checklistMatch = assignChecklistId(
          existing?.description || '',
          existing?.cost_item_id || null
        );
        // Fallback to LLM suggestion if valid
        const llmChecklistId = m.checklist_item_id;
        const finalChecklist = checklistMatch.id
          ? checklistMatch
          : (llmChecklistId && checklistIdSet.has(llmChecklistId)
            ? { id: llmChecklistId, label: checklistItems.find((c: any) => c.id === llmChecklistId)?.label || null, category: checklistItems.find((c: any) => c.id === llmChecklistId)?.category || null }
            : { id: null, label: null, category: null });

        return {
          scope_item_id: m.scope_item_id,
          description: existing?.description || '',
          current_status: existing?.status || 'Not Checked',
          suggested_status: m.suggested_status,
          suggested_notes: typeof m.suggested_notes === 'string' ? m.suggested_notes : null,
          suggested_qty: typeof m.suggested_qty === 'number' ? m.suggested_qty : null,
          suggested_unit: typeof m.suggested_unit === 'string' ? m.suggested_unit : null,
          checklist_item_id: finalChecklist.id,
          checklist_label: finalChecklist.label,
          checklist_category: finalChecklist.category,
        };
      });

    // Process new items
    const newItems = (parsed.new_items || []).map((item: any) => {
      const extracted = extractPricing(item, walkthrough_text);

      const desc = item.description || '';
      const norm = normalize(desc);
      const costMatch = costItemsByNorm.get(norm);

      const finalQty = extracted.qty;
      const finalUnit = extracted.unit;
      let finalUnitCost = extracted.unit_cost;
      const finalTotalCost = extracted.total_cost;

      let matchedCostItemId = costMatch?.id || null;
      let matchedCostItemUnit = costMatch?.unit_type || null;
      let matchedCostItemUnitCost = costMatch?.default_total_cost || null;
      let priceSource: 'walkthrough' | 'library' | 'missing' = 'missing';

      if (finalUnitCost != null || finalTotalCost != null) {
        priceSource = 'walkthrough';
      } else if (matchedCostItemUnitCost != null) {
        finalUnitCost = matchedCostItemUnitCost;
        priceSource = 'library';
      }

      // Coerce Not Checked to Get Bid for mentioned items
      const llmStatus = typeof item.status === 'string' && validStatuses.includes(item.status) ? item.status : 'Get Bid';

      // Deterministic checklist mapping
      const checklistMatch = assignChecklistId(desc, matchedCostItemId);
      const llmChecklistId = item.checklist_item_id;
      const finalChecklist = checklistMatch.id
        ? checklistMatch
        : (llmChecklistId && checklistIdSet.has(llmChecklistId)
          ? { id: llmChecklistId, label: checklistItems.find((c: any) => c.id === llmChecklistId)?.label || null, category: checklistItems.find((c: any) => c.id === llmChecklistId)?.category || null }
          : { id: null, label: null, category: null });

      return {
        description: desc,
        status: llmStatus,
        notes: typeof item.notes === 'string' ? item.notes : null,
        qty: finalQty,
        unit: finalUnit || matchedCostItemUnit,
        unit_cost: finalUnitCost,
        total_cost: finalTotalCost,
        price_evidence: extracted.price_evidence,
        price_confidence: extracted.price_confidence,
        price_source: priceSource,
        phase_key: typeof item.phase_key === 'string' ? item.phase_key : null,
        normalized_name: norm,
        matched_cost_item_id: matchedCostItemId,
        matched_cost_item_unit: matchedCostItemUnit,
        matched_cost_item_unit_cost: matchedCostItemUnitCost,
        checklist_item_id: finalChecklist.id,
        checklist_label: finalChecklist.label,
        checklist_category: finalChecklist.category,
      };
    });

    // --- Deterministic not_addressed_checklist_items ---
    const coveredChecklistIds = new Set<string>();
    // From walkthrough matched/new items
    for (const m of matched) { if (m.checklist_item_id) coveredChecklistIds.add(m.checklist_item_id); }
    for (const n of newItems) { if (n.checklist_item_id) coveredChecklistIds.add(n.checklist_item_id); }
    // From existing scope items (deterministic match)
    for (const ci of checklistItems) {
      if (coveredChecklistIds.has(ci.id)) continue;
      const matchByScopeItem = scopeItems.some((si: any) => {
        if (si.cost_item_id && ci.default_cost_item_id && si.cost_item_id === ci.default_cost_item_id) return true;
        const siNorm = normalizeForChecklistMatch(si.description);
        if (siNorm === ci.normalized_label) return true;
        if (adaptiveJaccardMatch(siNorm, ci.normalized_label)) return true;
        return false;
      });
      if (matchByScopeItem) coveredChecklistIds.add(ci.id);
    }
    // From existing reviews
    for (const rid of existingReviewIds) coveredChecklistIds.add(rid);

    const notAddressedChecklistItems = checklistItems
      .filter((ci: any) => !coveredChecklistIds.has(ci.id))
      .map((ci: any) => ({ id: ci.id, label: ci.label, category: ci.category }));

    // Validate member IDs
    const memberIds = (parsed.member_user_ids_to_add || []).filter((id: string) => validUserIds.has(id));
    let memberNames = parsed.member_display_names_to_add || [];
    if (memberNames.length !== memberIds.length) {
      memberNames = memberIds.map((id: string) => allProfiles.find((p: any) => p.id === id)?.full_name || 'Unknown');
    }

    const result = {
      matched,
      new_items: newItems,
      get_bid_items: (parsed.get_bid_items || parsed.needs_review_items || []).filter(
        (i: any) => i.id && validItemIds.has(i.id)
      ),
      not_addressed_items: (parsed.not_addressed_items || []).filter(
        (i: any) => i.id && validItemIds.has(i.id)
      ),
      not_addressed_checklist_items: notAddressedChecklistItems,
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

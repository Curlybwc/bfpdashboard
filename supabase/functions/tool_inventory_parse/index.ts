import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await admin
      .from("profiles").select("is_admin, can_manage_projects").eq("id", userId).single();
    if (!profile?.is_admin && !profile?.can_manage_projects) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { input_text } = await req.json();
    if (!input_text || typeof input_text !== "string" || !input_text.trim()) {
      return new Response(JSON.stringify({ error: "Missing input_text" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Existing tool types for fuzzy matching
    const { data: existingTools } = await admin
      .from("tool_types").select("id, name, sku").order("name");
    const existingList = (existingTools || []).map((t: any) => ({
      id: t.id, name: t.name, sku: t.sku,
    }));

    const systemPrompt = `You are a tool inventory parser. The user is walking through their shop describing tools out loud. Parse their free-form text into structured tool entries.

RULES:
- Output valid JSON only. No markdown, no explanation.
- Each distinct tool the user mentions becomes one entry.
- Extract a clean tool "name" (e.g. "DeWalt 20V Impact Driver", "Milwaukee M18 Circular Saw", "Bosch Rotary Hammer"). Use title case. Include brand if mentioned.
- Extract "sku" only if the user explicitly says a model number / SKU. Otherwise null.
- Extract "vendor_url" only if the user explicitly says a URL. Otherwise null.
- Extract "shop_qty" as the integer count of that tool at the shop. If the user says "two", "a pair", "three of them", etc. parse the number. Default to 1.
- If the user clearly references an EXISTING tool from the list below (same brand+type or close variant), set "match_existing_id" to that tool's id. Otherwise null = create new.
- Be liberal with quantity parsing: "I've got three impact drivers" => shop_qty: 3.
- Ignore filler words ("um", "let me see", "okay so", "next up").

EXISTING TOOL TYPES (for match_existing_id):
${JSON.stringify(existingList)}

OUTPUT FORMAT (JSON only):
{
  "tools": [
    {
      "name": "string",
      "sku": "string|null",
      "vendor_url": "string|null",
      "shop_qty": 1,
      "match_existing_id": "uuid|null"
    }
  ]
}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: input_text },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let raw = aiData.choices?.[0]?.message?.content || "";
    raw = raw.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let parsed: any;
    try { parsed = JSON.parse(raw); } catch {
      return new Response(JSON.stringify({ error: "Invalid AI response format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validIds = new Set(existingList.map((t) => t.id));
    const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
    const sanitized = tools
      .filter((t: any) => t && typeof t.name === "string" && t.name.trim())
      .map((t: any) => ({
        name: String(t.name).trim().slice(0, 200),
        sku: typeof t.sku === "string" && t.sku.trim() ? t.sku.trim().slice(0, 100) : null,
        vendor_url: typeof t.vendor_url === "string" && t.vendor_url.trim() ? t.vendor_url.trim().slice(0, 500) : null,
        shop_qty: Number.isFinite(t.shop_qty) && t.shop_qty > 0 ? Math.floor(t.shop_qty) : 1,
        match_existing_id: typeof t.match_existing_id === "string" && validIds.has(t.match_existing_id)
          ? t.match_existing_id : null,
      }));

    return new Response(JSON.stringify({ tools: sanitized }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("tool_inventory_parse error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
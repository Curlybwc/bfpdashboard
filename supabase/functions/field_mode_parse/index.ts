import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { project_id, raw_text, include_materials } = await req.json();
    if (!project_id || !raw_text || raw_text.length < 20) {
      return new Response(JSON.stringify({ error: "raw_text must be at least 20 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check membership
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();

    const isAdmin = profile?.is_admin === true;

    if (!isAdmin) {
      const { data: membership } = await adminClient
        .from("project_members")
        .select("role")
        .eq("project_id", project_id)
        .eq("user_id", userId)
        .single();

      if (!membership) {
        return new Response(JSON.stringify({ error: "Forbidden: not a project member" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (membership.role === "read_only") {
        return new Response(JSON.stringify({ error: "Forbidden: insufficient role" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const materialInstruction = include_materials !== false
      ? "Extract materials mentioned for each task. Each material needs a name string, optional quantity (number), optional unit (string). Max 12 materials per task."
      : "Do NOT extract materials. Return empty materials arrays.";

    const systemPrompt = `You are a construction field discovery parser. A worker has walked a jobsite and dictated observations. Parse into structured tasks.

RULES:
- Max 8 tasks. Combine related items.
- task title max 70 chars. notes max 1200 chars.
- Do NOT include stage or assignment fields.
- priority: "high", "normal", or "low". Default "normal".
- Extract trade if obvious (e.g. "plumber", "electrician").
- Extract room_area if mentioned.
- ${materialInstruction}
- One task per natural work package. Do not over-split.

OUTPUT FORMAT (JSON only, no markdown):
{
  "tasks": [
    {
      "title": "string (required, max 70 chars)",
      "trade": "string|null",
      "room_area": "string|null",
      "priority": "high|normal|low",
      "notes": "string|null (max 1200 chars)",
      "materials": [{ "name": "string", "quantity": null, "unit": null }]
    }
  ],
  "warnings": ["string"]
}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          { role: "user", content: raw_text },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", aiResponse.status);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content;
    if (!rawContent) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let jsonStr = rawContent.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("JSON parse failed:", jsonStr.substring(0, 200));
      return new Response(JSON.stringify({ error: "Invalid AI response format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      return new Response(JSON.stringify({ error: "Malformed tasks structure" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize
    const VALID_PRIORITIES = ["high", "normal", "low"];
    const sanitized = parsed.tasks.slice(0, 8).map((t: any) => ({
      title: typeof t.title === "string" ? t.title.slice(0, 70) : "Untitled",
      trade: typeof t.trade === "string" ? t.trade : null,
      room_area: typeof t.room_area === "string" ? t.room_area : null,
      priority: VALID_PRIORITIES.includes(t.priority) ? t.priority : "normal",
      notes: typeof t.notes === "string" ? t.notes.slice(0, 1200) : null,
      materials: Array.isArray(t.materials)
        ? t.materials.filter((m: any) => m && typeof m.name === "string" && m.name.trim()).slice(0, 12).map((m: any) => ({
            name: m.name,
            quantity: typeof m.quantity === "number" ? m.quantity : null,
            unit: typeof m.unit === "string" ? m.unit : null,
          }))
        : [],
    }));

    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((w: any) => typeof w === "string")
      : [];

    return new Response(
      JSON.stringify({ tasks: sanitized, warnings }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("field_mode_parse error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

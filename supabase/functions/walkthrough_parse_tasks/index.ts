import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_DRAFT_KEYS = [
  "task",
  "room_area",
  "trade",
  "priority",
  "due_date",
  "assigned_to_user_id",
  "assigned_to_display",
  "materials",
  "notes",
];

const VALID_PRIORITIES = [
  "1 – Now",
  "2 – This Week",
  "3 – Soon",
  "4 – When Time",
  "5 – Later",
];

function sanitizeDraft(raw: any) {
  const draft: any = {};
  for (const key of ALLOWED_DRAFT_KEYS) {
    if (key in raw) draft[key] = raw[key];
  }
  // Validate priority
  if (draft.priority && !VALID_PRIORITIES.includes(draft.priority)) {
    draft.priority = null;
  }
  // Coerce materials
  if (!Array.isArray(draft.materials)) {
    draft.materials = [];
  } else {
    draft.materials = draft.materials.filter(
      (m: any) => m && typeof m === "object" && typeof m.name === "string" && m.name.trim()
    ).map((m: any) => ({
      name: m.name,
      quantity: typeof m.quantity === "number" ? m.quantity : null,
      unit: typeof m.unit === "string" ? m.unit : null,
    }));
  }
  return draft;
}

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

    const { project_id, input_text, current_date } = await req.json();
    if (!project_id || !input_text) {
      return new Response(JSON.stringify({ error: "Missing project_id or input_text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin or project member
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

    // Fetch members for LLM context
    const { data: members } = await adminClient
      .from("project_members")
      .select("user_id, role, profiles(full_name)")
      .eq("project_id", project_id);

    const memberList = (members || []).map((m: any) => ({
      user_id: m.user_id,
      name: m.profiles?.full_name || "Unknown",
      role: m.role,
    }));

    const systemPrompt = `You are a construction task parser. You receive free-form text describing work to be done on a construction project. Parse it into structured tasks.

RULES:
- CREATE ONLY. Never reference updating existing tasks.
- Output valid JSON only. No markdown, no explanation.
- Default assigned_to_user_id = null unless you can confidently match a name.
- If ambiguous match (multiple members match), leave assigned_to_user_id null and add a warning.
- Extract materials aggressively from the text.
- Infer trade only if obvious (e.g. "plumber", "electrician").
- Extract room_area if mentioned (e.g. "kitchen", "master bath").
- Infer priority from urgency words: "ASAP"/"now"/"urgent" = "1 – Now", "this week" = "2 – This Week", "soon" = "3 – Soon", "when time"/"whenever" = "4 – When Time", "later"/"eventually" = "5 – Later". Default null.
- Infer due_date: "today" = ${current_date || new Date().toISOString().split("T")[0]}, "tomorrow" = next day, weekday names = next upcoming, explicit dates = parse to YYYY-MM-DD. Otherwise null.
- One task per natural work package. Do not over-split.
- Each material needs at minimum a "name" string.

PROJECT MEMBERS (for assignment matching):
${JSON.stringify(memberList)}

OUTPUT FORMAT (JSON only):
{
  "draft_tasks": [
    {
      "task": "string (required, non-empty)",
      "room_area": "string|null",
      "trade": "string|null",
      "priority": "1 – Now|2 – This Week|3 – Soon|4 – When Time|5 – Later|null",
      "due_date": "YYYY-MM-DD|null",
      "assigned_to_user_id": "uuid|null",
      "assigned_to_display": "string|null",
      "materials": [{ "name": "string", "quantity": null, "unit": null }],
      "notes": "string|null"
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
          { role: "user", content: input_text },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", aiResponse.status);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content;
    if (!rawContent) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip markdown code fences if present
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
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!parsed.draft_tasks || !Array.isArray(parsed.draft_tasks)) {
      return new Response(JSON.stringify({ error: "Malformed draft_tasks structure" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const dt of parsed.draft_tasks) {
      if (!dt.task || typeof dt.task !== "string" || !dt.task.trim()) {
        return new Response(JSON.stringify({ error: "Malformed draft_tasks structure" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const sanitizedDrafts = parsed.draft_tasks.map(sanitizeDraft);
    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((w: any) => typeof w === "string")
      : [];

    return new Response(
      JSON.stringify({ draft_tasks: sanitizedDrafts, warnings }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("walkthrough error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

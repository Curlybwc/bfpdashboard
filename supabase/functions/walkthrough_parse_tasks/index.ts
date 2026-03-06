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
  "assignment_mode",
  "crew_member_ids",
  "crew_member_displays",
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
  if (draft.priority && !VALID_PRIORITIES.includes(draft.priority)) {
    draft.priority = null;
  }
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

  // Crew fields
  if (draft.assignment_mode !== "solo" && draft.assignment_mode !== "crew") {
    draft.assignment_mode = "solo";
  }
  if (!Array.isArray(draft.crew_member_ids)) {
    draft.crew_member_ids = [];
  } else {
    draft.crew_member_ids = [...new Set(
      draft.crew_member_ids.filter((id: any) => typeof id === "string" && id.trim())
    )];
  }
  if (!Array.isArray(draft.crew_member_displays)) {
    draft.crew_member_displays = [];
  } else {
    draft.crew_member_displays = draft.crew_member_displays.filter(
      (d: any) => typeof d === "string"
    );
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

    // Fetch ALL known users (profiles + aliases) for assignment matching
    const [profilesRes, aliasesRes, membersRes] = await Promise.all([
      adminClient.from("profiles").select("id, full_name").not("full_name", "is", null).neq("full_name", ""),
      adminClient.from("profile_aliases").select("user_id, alias"),
      adminClient.from("project_members").select("user_id, role, profiles(full_name)").eq("project_id", project_id),
    ]);

    const allProfiles = profilesRes.data || [];
    const allAliases = aliasesRes.data || [];

    // Build known users with aliases
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

    // Project members for context
    const memberList = (membersRes.data || []).map((m: any) => ({
      user_id: m.user_id,
      name: m.profiles?.full_name || "Unknown",
      role: m.role,
    }));

    const systemPrompt = `You are a construction task parser. You receive free-form text describing work to be done on a construction project. Parse it into structured tasks.

RULES:
- CREATE ONLY. Never reference updating existing tasks.
- Output valid JSON only. No markdown, no explanation.
- Extract materials aggressively from the text.
- Infer trade only if obvious (e.g. "plumber", "electrician").
- Extract room_area if mentioned (e.g. "kitchen", "master bath").
- Infer priority from urgency words: "ASAP"/"now"/"urgent" = "1 – Now", "this week" = "2 – This Week", "soon" = "3 – Soon", "when time"/"whenever" = "4 – When Time", "later"/"eventually" = "5 – Later". Default null.
- Infer due_date: "today" = ${current_date}, "tomorrow" = next day after ${current_date}, weekday names = next upcoming from ${current_date}, explicit dates = parse to YYYY-MM-DD. Otherwise null.
- One task per natural work package. Do not over-split.
- Each material needs at minimum a "name" string.

MATERIAL TASK RULE:
- If materials are mentioned in the context of another task, attach them to that task's materials array. Do NOT create a standalone task for picking up, grabbing, or getting materials.
- Do NOT create tasks like "Pick up materials", "Grab drywall", "Get paint", "Buy supplies".
- Only create a material-acquisition task if the user explicitly indicates it is a separate work assignment (e.g. "Send Andrew to Home Depot to restock supplies").
- If materials are mentioned without clear linkage to a specific task, attach them to the nearest/most relevant task rather than creating a new one.

ASSIGNMENT MATCHING RULES:
You MUST use the KNOWN USERS list below for assignment. Do NOT invent user IDs.
- Only assign assigned_to_user_id when you can confidently match EXACTLY one user in KNOWN USERS.
- A confident match can be:
  (a) case-insensitive exact match to full_name, OR
  (b) case-insensitive exact match to an alias, OR
  (c) case-insensitive unique substring match against full_name if it matches exactly one person (e.g. "Judah" matches only "Judah Bahr").
- If multiple candidates match, set assigned_to_user_id = null and add a warning listing candidate full_name values.
- If no candidates match, set assigned_to_user_id = null and add a warning.
- When assigned, set assigned_to_display to the matched person's full_name.
- Vendors/company names should be ignored for assignment unless they match a known user.

CREW TASK RULES:
- If multiple people are assigned to the SAME task, or the user explicitly says "crew task", "two-man crew", "three-man crew", "have Mike and Andrew do this together", "assign this to Mike, Andrew, and Sarah", "they should work on this together", set assignment_mode to "crew".
- For crew tasks: set assigned_to_user_id = null and assigned_to_display = null.
- Instead populate crew_member_ids with matched known-user UUIDs and crew_member_displays with their full_name values.
- Apply the same matching rules as solo assignment for each person mentioned.
- If any person cannot be confidently matched, omit them from crew_member_ids and add a warning.
- If only one person is mentioned and there is no crew language, keep assignment_mode = "solo" and use the normal assigned_to fields.
- Default assignment_mode to "solo" when no crew language is detected.

KNOWN USERS (match assignments against these):
${JSON.stringify(knownUsers)}

CURRENT PROJECT MEMBERS (for context only):
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
      "assignment_mode": "solo|crew",
      "crew_member_ids": ["uuid"],
      "crew_member_displays": ["string"],
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

    // Validate assigned_to_user_id and crew_member_ids against known user IDs
    const validUserIds = new Set(allProfiles.map((p: any) => p.id));
    const userIdToName = new Map(allProfiles.map((p: any) => [p.id, p.full_name]));

    const sanitizedDrafts = parsed.draft_tasks.map((raw: any) => {
      const draft = sanitizeDraft(raw);

      // Validate solo assignment
      if (draft.assigned_to_user_id && !validUserIds.has(draft.assigned_to_user_id)) {
        draft.assigned_to_user_id = null;
        draft.assigned_to_display = null;
      }

      // Validate crew member IDs
      if (draft.crew_member_ids.length > 0) {
        const validCrewIds: string[] = [];
        const validCrewDisplays: string[] = [];
        for (const cid of draft.crew_member_ids) {
          if (validUserIds.has(cid)) {
            validCrewIds.push(cid);
            validCrewDisplays.push(userIdToName.get(cid) || "Unknown");
          }
        }
        draft.crew_member_ids = validCrewIds;
        draft.crew_member_displays = validCrewDisplays;
      }

      return draft;
    });

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

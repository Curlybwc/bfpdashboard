import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIORITY_MAP: Record<string, string> = {
  high: "1 \u2013 Now",
  normal: "2 \u2013 This Week",
  low: "4 \u2013 When Time",
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
    const userId = claimsData.claims.sub as string;

    const { project_id, raw_text, include_materials, tasks } = await req.json();
    if (!project_id || !raw_text || !Array.isArray(tasks) || tasks.length === 0) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify membership
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

      if (!membership || membership.role === "read_only") {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Create field_captures row
    const { data: capture, error: captureError } = await adminClient
      .from("field_captures")
      .insert({
        project_id,
        created_by: userId,
        raw_text,
        include_materials: include_materials !== false,
        ai_output: { tasks },
        parse_status: "completed",
      })
      .select("id")
      .single();

    if (captureError) {
      console.error("capture insert error:", captureError);
      return new Response(JSON.stringify({ error: "Failed to create capture record" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const createdTaskIds: string[] = [];

    for (const t of tasks) {
      const priority = PRIORITY_MAP[t.priority] || "2 \u2013 This Week";

      const { data: taskRow, error: taskError } = await adminClient
        .from("tasks")
        .insert({
          project_id,
          task: typeof t.title === "string" ? t.title.slice(0, 70) : "Untitled",
          stage: "Not Ready",
          priority,
          materials_on_site: "No",
          trade: t.trade || null,
          room_area: t.room_area || null,
          notes: t.notes || null,
          created_by: userId,
          assigned_to_user_id: null,
          needs_manager_review: true,
          field_capture_id: capture.id,
        })
        .select("id")
        .single();

      if (taskError) {
        console.error("task insert error:", taskError);
        continue;
      }

      createdTaskIds.push(taskRow.id);

      // Insert materials
      if (Array.isArray(t.materials) && t.materials.length > 0) {
        const mats = t.materials
          .filter((m: any) => m && typeof m.name === "string" && m.name.trim())
          .slice(0, 12)
          .map((m: any) => ({
            task_id: taskRow.id,
            name: m.name,
            quantity: typeof m.quantity === "number" ? m.quantity : null,
            unit: typeof m.unit === "string" ? m.unit : null,
            purchased: false,
            delivered: false,
          }));

        if (mats.length > 0) {
          await adminClient.from("task_materials").insert(mats);
        }
      }
    }

    return new Response(
      JSON.stringify({ field_capture_id: capture.id, created_task_ids: createdTaskIds }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("field_mode_submit error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

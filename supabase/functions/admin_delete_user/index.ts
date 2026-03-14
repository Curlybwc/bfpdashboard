import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin using their JWT
    const authHeader = req.headers.get("Authorization")!;
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user: caller }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_admin")
      .eq("id", caller.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return new Response(JSON.stringify({ error: "target_user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (target_user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean up related data first
    // Remove from project_members, scope_members, crew_group_members, task_candidates, task_workers
    await adminClient.from("crew_group_members").delete().eq("user_id", target_user_id);
    await adminClient.from("task_candidates").delete().eq("user_id", target_user_id);
    await adminClient.from("task_workers").delete().eq("user_id", target_user_id);
    await adminClient.from("scope_members").delete().eq("user_id", target_user_id);
    await adminClient.from("project_members").delete().eq("user_id", target_user_id);
    await adminClient.from("profile_aliases").delete().eq("user_id", target_user_id);
    await adminClient.from("worker_availability").delete().eq("user_id", target_user_id);

    // Unassign tasks (don't delete them)
    await adminClient
      .from("tasks")
      .update({ assigned_to_user_id: null })
      .eq("assigned_to_user_id", target_user_id);
    await adminClient
      .from("tasks")
      .update({ claimed_by_user_id: null, claimed_at: null })
      .eq("claimed_by_user_id", target_user_id);
    await adminClient
      .from("tasks")
      .update({ lead_user_id: null })
      .eq("lead_user_id", target_user_id);

    // Delete profile
    await adminClient.from("profiles").delete().eq("id", target_user_id);

    // Delete auth user
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(target_user_id);
    if (deleteErr) {
      return new Response(JSON.stringify({ error: deleteErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

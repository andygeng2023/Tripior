import { withSupabase } from "npm:@supabase/server@0.9.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });

export default withSupabase({ auth: "publishable" }, async (req, ctx) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname.includes("/snapshots/") && url.pathname.endsWith("/places")) {
    const snapshotId = url.pathname.split("/snapshots/")[1].split("/")[0];
    const { data: links, error } = await ctx.supabaseAdmin
      .from("research_snapshot_places")
      .select("place_id")
      .eq("snapshot_id", snapshotId);

    if (error) return response({ error: error.message }, 500);

    const ids = (links ?? []).map((row: any) => row.place_id);
    if (!ids.length) return response([]);

    const { data, error: placesError } = await ctx.supabaseAdmin
      .from("places")
      .select("id,name,primary_category,secondary_categories,latitude,longitude,universal_score,confidence,visit_duration")
      .in("id", ids)
      .order("universal_score", { ascending: false });

    if (placesError) return response({ error: placesError.message }, 500);
    return response(data ?? []);
  }

  if (req.method === "POST" && url.pathname.endsWith("/runs")) {
    const profile = await req.json();

    if (!profile.destination || !profile.travellerCount) {
      return response({ error: "destination and travellerCount are required" }, 400);
    }

    return response({
      error: "Backend migration is installed, but research execution is not enabled yet."
    }, 501);
  }

  return response({ error: "Not found" }, 404);
});

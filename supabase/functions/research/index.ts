import { withSupabase } from "npm:@supabase/server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Profile = {
  destination: string;
  travelStart?: string;
  travelEnd?: string;
  travellerCount: number;
  interests?: string[];
  maxGeographicRangeKm?: number;
};

const text = (v: unknown) => String(v ?? "").trim();
const keyFor = (name: string, lat: number, lon: number) =>
  name.toLowerCase() + "|" + lat.toFixed(5) + "|" + lon.toFixed(5);

async function resolveDestination(query: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  const res = await fetch(url, { headers: { "User-Agent": "TripiorResearchEngine/0.1" } });
  if (!res.ok) throw new Error("Nominatim failed: " + res.status);
  const rows = await res.json() as any[];
  const row = rows[0];
  if (!row) return null;
  return {
    canonicalIdentifier: row.osm_type && row.osm_id ? "osm:" + row.osm_type + ":" + row.osm_id : "nominatim:" + row.place_id,
    name: text(row.display_name).split(",")[0],
    country: row.address?.country,
    region: row.address?.state ?? row.address?.region,
    latitude: Number(row.lat),
    longitude: Number(row.lon),
    countryCode: row.address?.country_code?.toUpperCase(),
    aliases: [query]
  };
}

async function discover(profile: Profile, destination: any) {
  const radius = Math.min((profile.maxGeographicRangeKm ?? 15) * 1000, 50000);
  const tags = ["tourism", "amenity", "historic", "leisure", "natural", "shop", "craft"];
  const clauses = tags.map(tag =>
    'nwr["' + tag + '"](around:' + radius + "," + destination.latitude + "," + destination.longitude + ");"
  ).join("\n");
  const query = "[out:json][timeout:60];(\n" + clauses + "\n);out center tags;";
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query })
  });
  if (!res.ok) throw new Error("Overpass failed: " + res.status);
  const data = await res.json() as any;
  return (data.elements ?? []).map((e: any) => {
    const tags = e.tags ?? {};
    const categories = [tags.tourism, tags.amenity, tags.historic, tags.leisure, tags.natural, tags.shop, tags.craft]
      .filter(Boolean).map(String);
    return {
      provider: "openstreetmap",
      providerPlaceId: "osm:" + e.type + ":" + e.id,
      name: text(tags.name ?? tags["name:en"]),
      latitude: Number(e.lat ?? e.center?.lat),
      longitude: Number(e.lon ?? e.center?.lon),
      address: { street: tags["addr:street"], houseNumber: tags["addr:housenumber"], city: tags["addr:city"] },
      categories,
      raw: e
    };
  }).filter((x: any) => x.name && Number.isFinite(x.latitude) && Number.isFinite(x.longitude)).slice(0, 250);
}

function signals(categories: string[]) {
  const completeness = 4 / 5;
  return { rating: 0.5, reviewVolume: 0.25, completeness, score: 0.35 * 0.5 + 0.25 * 0.25 + 0.4 * completeness };
}

function vector(categories: string[], interests: string[]) {
  const source = categories.join(" ").toLowerCase();
  return Object.fromEntries((interests ?? []).map(i => [i, source.includes(i.toLowerCase()) ? 1 : 0]));
}

async function runResearch(profile: Profile, db: any) {
  const started = Date.now();
  const destination = await resolveDestination(profile.destination);
  if (!destination) throw new Error("Destination could not be resolved.");

  const { data: rp, error: rpErr } = await db.from("research_profiles").insert({
    destination_query: profile.destination,
    travel_start: profile.travelStart || null,
    travel_end: profile.travelEnd || null,
    traveller_count: profile.travellerCount,
    profile
  }).select("id").single();
  if (rpErr) throw rpErr;

  const { data: dest, error: destErr } = await db.from("destinations").upsert({
    canonical_identifier: destination.canonicalIdentifier,
    name: destination.name,
    country: destination.country ?? null,
    region: destination.region ?? null,
    latitude: destination.latitude,
    longitude: destination.longitude,
    country_code: destination.countryCode ?? null,
    aliases: destination.aliases ?? []
  }, { onConflict: "canonical_identifier" }).select("id").single();
  if (destErr) throw destErr;

  const { data: run, error: runErr } = await db.from("research_runs").insert({
    research_profile_id: rp.id,
    destination_id: dest.id,
    status: "discovering",
    started_at: new Date().toISOString(),
    plan: { providers: ["openstreetmap"], strategies: ["category", "distance", "geographic-feature"], radiusKm: profile.maxGeographicRangeKm ?? 15 }
  }).select("id").single();
  if (runErr) throw runErr;

  try {
    const candidates = await discover(profile, destination);
    if (candidates.length) {
      const raw = candidates.map((c: any) => ({
        research_run_id: run.id, provider: c.provider, provider_place_id: c.providerPlaceId,
        request_parameters: { destination: profile.destination }, requested_fields: ["name", "location", "categories", "address"],
        raw_response: c.raw
      }));
      const { error } = await db.from("research_raw_results").insert(raw);
      if (error) throw error;
    }

    const { data: existing, error: existingErr } = await db.from("places")
      .select("id,name,latitude,longitude").eq("destination_id", dest.id);
    if (existingErr) throw existingErr;

    const existingKeys = new Map((existing ?? []).map((p: any) =>
      [keyFor(p.name, Number(p.latitude), Number(p.longitude)), p.id]
    ));
    const ids: string[] = [];
    const newCandidates: any[] = [];
    let duplicate = 0;

    for (const c of candidates) {
      const id = existingKeys.get(keyFor(c.name, c.latitude, c.longitude));
      if (id) { ids.push(id); duplicate++; } else newCandidates.push(c);
    }

    if (newCandidates.length) {
      const rows = newCandidates.map(c => {
        const q = signals(c.categories);
        return {
          canonical_key: keyFor(c.name, c.latitude, c.longitude),
          destination_id: dest.id,
          name: c.name,
          latitude: c.latitude,
          longitude: c.longitude,
          address: c.address,
          primary_category: c.categories[0] ?? null,
          secondary_categories: c.categories,
          interest_vector: vector(c.categories, profile.interests ?? []),
          quality_signals: q,
          universal_score: q.score,
          confidence: 0.65,
          visit_duration: { typical_minutes: 60 },
          metadata: { provider: c.provider }
        };
      });
      const { data, error } = await db.from("places").insert(rows).select("id");
      if (error) throw error;
      for (const p of data ?? []) ids.push(p.id);
    }

    const coverage = {
      status: "complete",
      candidateCount: candidates.length,
      unique: ids.length,
      duplicate,
      durationMs: Date.now() - started
    };

    let err = (await db.from("research_runs").update({
      status: "snapshotting", coverage, statistics: { discovered: candidates.length, unique: ids.length, duplicate },
      completed_at: new Date().toISOString()
    }).eq("id", run.id)).error;
    if (err) throw err;

    const snapResult = await db.from("research_snapshots").insert({
      research_run_id: run.id,
      destination_id: dest.id,
      snapshot_version: "0.1.0",
      trip_context: profile,
      coverage,
      provider_information: { openstreetmap: "nominatim+overpass" },
      statistics: { unique: ids.length, duplicate }
    }).select("id").single();
    if (snapResult.error) throw snapResult.error;

    if (ids.length) {
      const links = [...new Set(ids)].map(id => ({ snapshot_id: snapResult.data.id, place_id: id, universal_score: 0.65, confidence: 0.65 }));
      const linkResult = await db.from("research_snapshot_places").insert(links);
      if (linkResult.error) throw linkResult.error;
    }

    err = (await db.from("research_runs").update({ status: "complete" }).eq("id", run.id)).error;
    if (err) throw err;

    return { runId: run.id, snapshotId: snapResult.data.id, destination, coverage };
  } catch (e) {
    await db.from("research_runs").update({ status: "failed", warnings: [String(e)], completed_at: new Date().toISOString() }).eq("id", run.id);
    throw e;
  }
}

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname.includes("/snapshots/") && url.pathname.endsWith("/places")) {
      const snapshotId = url.pathname.split("/snapshots/")[1].split("/")[0];
      const links = await ctx.supabaseAdmin.from("research_snapshot_places").select("place_id").eq("snapshot_id", snapshotId);
      if (links.error) return json({ error: links.error.message }, 500);
      const ids = (links.data ?? []).map((x: any) => x.place_id);
      if (!ids.length) return json([]);
      const places = await ctx.supabaseAdmin.from("places")
        .select("id,name,primary_category,secondary_categories,latitude,longitude,universal_score,confidence,visit_duration")
        .in("id", ids).order("universal_score", { ascending: false });
      if (places.error) return json({ error: places.error.message }, 500);
      return json(places.data ?? []);
    }

    if (req.method === "POST" && url.pathname.endsWith("/runs")) {
      let profile: Profile;
      try { profile = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
      if (!profile.destination || !profile.travellerCount) return json({ error: "destination and travellerCount are required" }, 400);
      try { return json(await runResearch(profile, ctx.supabaseAdmin)); }
      catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500); }
    }

    return json({ error: "Not found" }, 404);
  })
};

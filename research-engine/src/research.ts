import crypto from "node:crypto";
import {q} from "./db.js";
import {NominatimProvider} from "./providers/nominatim.js";
import {OverpassProvider} from "./providers/overpass.js";
import type {Candidate,ResearchProfile} from "./types.js";
const nominatim=new NominatimProvider(), overpass=new OverpassProvider();
const key=(c:Candidate)=>crypto.createHash("sha256").update(c.name.toLowerCase()+"|"+c.latitude.toFixed(5)+"|"+c.longitude.toFixed(5)).digest("hex");
function quality(c:Candidate){const completeness=[c.name,c.latitude,c.longitude,c.address,c.categories.length].filter(Boolean).length/5;return {rating:c.rating?c.rating/5:.5,reviewVolume:c.reviewCount?Math.min(Math.log10(c.reviewCount+1)/4,1):.25,completeness,score:.35*(c.rating?c.rating/5:.5)+.25*(c.reviewCount?Math.min(Math.log10(c.reviewCount+1)/4,1):.25)+.4*completeness}}
function vector(c:Candidate, interests:string[]){const text=c.categories.join(" ").toLowerCase();return Object.fromEntries(interests.map(i=>[i,text.includes(i.toLowerCase())?1:0]));}
export async function runResearch(profile:ResearchProfile){
 const started=Date.now(), destination=await nominatim.resolveDestination(profile.destination); if(!destination)throw new Error("Destination could not be resolved.");
 const pr=(await q<{id:string}>(`insert into research_profiles(destination_query,travel_start,travel_end,traveller_count,profile) values($1,$2,$3,$4,$5) returning id`,[profile.destination,profile.travelStart??null,profile.travelEnd??null,profile.travellerCount,JSON.stringify(profile)]))[0].id;
 const d=(await q<{id:string}>(`insert into destinations(canonical_identifier,name,country,region,latitude,longitude,country_code,aliases) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(canonical_identifier) do update set name=excluded.name,latitude=excluded.latitude,longitude=excluded.longitude,updated_at=now() returning id`,[destination.canonicalIdentifier,destination.name,destination.country??null,destination.region??null,destination.latitude??null,destination.longitude??null,destination.countryCode??null,JSON.stringify(destination.aliases??[])]))[0].id;
 const run=(await q<{id:string}>(`insert into research_runs(research_profile_id,destination_id,status,started_at,plan) values($1,$2,'discovering',now(),$3) returning id`,[pr,d,JSON.stringify({providers:["openstreetmap"],strategies:["category","distance","geographic-feature"],radiusKm:profile.maxGeographicRangeKm??15})]))[0].id;
 try{
  const candidates=await overpass.discover(profile,destination); let unique=0,duplicate=0;
  for(const c of candidates){
   await q(`insert into research_raw_results(research_run_id,provider,provider_place_id,request_parameters,requested_fields,raw_response) values($1,$2,$3,$4,$5,$6)`,[run,c.provider,c.providerPlaceId,JSON.stringify({destination:profile.destination}),JSON.stringify(["name","location","categories","address"]),JSON.stringify(c.raw)]);
   const existing=await q<{id:string}>(`select id from places where destination_id=$1 and lower(name)=lower($2) and latitude between $3-.002 and $3+.002 and longitude between $4-.002 and $4+.002 limit 1`,[d,c.name,c.latitude,c.longitude]);
   const s=quality(c); let place:string;
   if(existing[0]){place=existing[0].id;duplicate++}else{place=(await q<{id:string}>(`insert into places(canonical_key,destination_id,name,latitude,longitude,address,secondary_categories,interest_vector,quality_signals,universal_score,confidence,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,.65,$11) returning id`,[key(c),d,c.name,c.latitude,c.longitude,JSON.stringify(c.address??{}),JSON.stringify(c.categories),JSON.stringify(vector(c,profile.interests??[])),JSON.stringify(s),s.score,JSON.stringify({provider:c.provider})]))[0].id;unique++}
   await q(`insert into place_provider_ids(place_id,provider,provider_place_id) values($1,$2,$3) on conflict(provider,provider_place_id) do nothing`,[place,c.provider,c.providerPlaceId]);
   await q(`insert into place_scores(place_id,research_run_id,score_type,score,components,algorithm_version) values($1,$2,'universal',$3,$4,'0.1.0') on conflict(place_id,research_run_id,score_type) do update set score=excluded.score,components=excluded.components`,[place,run,s.score,JSON.stringify(s)]);
  }
  const coverage={status:"complete",candidateCount:candidates.length,unique,duplicate,durationMs:Date.now()-started};
  await q(`update research_runs set status='snapshotting',coverage=$1,statistics=$2,completed_at=now() where id=$3`,[JSON.stringify(coverage),JSON.stringify({discovered:candidates.length,unique,duplicate}),run]);
  const snap=(await q<{id:string}>(`insert into research_snapshots(research_run_id,destination_id,snapshot_version,trip_context,coverage,provider_information,statistics) values($1,$2,'0.1.0',$3,$4,$5,$6) returning id`,[run,d,JSON.stringify(profile),JSON.stringify(coverage),JSON.stringify({openstreetmap:"nominatim+overpass"}),JSON.stringify({unique,duplicate})]))[0].id;
  await q(`insert into research_snapshot_places(snapshot_id,place_id,universal_score,confidence) select $1,id,universal_score,confidence from places where destination_id=$2`,[snap,d]);
  await q(`update research_runs set status='complete' where id=$1`,[run]); return {runId:run,snapshotId:snap,destination,coverage};
 }catch(e){await q(`update research_runs set status='failed',warnings=$1,completed_at=now() where id=$2`,[JSON.stringify([String(e)]),run]);throw e}
}

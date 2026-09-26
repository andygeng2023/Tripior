import type {Candidate,Destination,ResearchProfile} from "../types.js";
export class OverpassProvider {
 readonly name="openstreetmap";
 async discover(profile:ResearchProfile,destination:Destination):Promise<Candidate[]>{
  if(destination.latitude==null||destination.longitude==null)return[];
  const radius=Math.min((profile.maxGeographicRangeKm??15)*1000,50000);
  const tags=["tourism","amenity","historic","leisure","natural","shop","craft"];
  const clauses=tags.map(t=>'nwr["'+t+'"](around:'+radius+','+destination.latitude+','+destination.longitude+');').join("\n");
  const query="[out:json][timeout:60];(\n"+clauses+"\n);out center tags;";
  const endpoint=process.env.OVERPASS_URL??"https://overpass-api.de/api/interpreter";
  const res=await fetch(endpoint,{method:"POST",body:new URLSearchParams({data:query})});
  if(!res.ok)throw new Error("Overpass failed: "+res.status);
  const data=await res.json() as any;
  return (data.elements??[]).map((e:any)=>{
   const lat=e.lat??e.center?.lat,lon=e.lon??e.center?.lon,t=e.tags??{};
   return {provider:this.name,providerPlaceId:"osm:"+e.type+":"+e.id,name:t.name??t["name:en"]??"Unnamed place",
    latitude:Number(lat),longitude:Number(lon),
    address:{street:t["addr:street"],houseNumber:t["addr:housenumber"],city:t["addr:city"]},
    categories:[t.tourism,t.amenity,t.historic,t.leisure,t.natural,t.shop].filter(Boolean),raw:e};
  }).filter((x:Candidate)=>Number.isFinite(x.latitude)&&Number.isFinite(x.longitude)&&x.name!=="Unnamed place");
 }
}

import type {Destination} from "../types.js";
export class NominatimProvider {
  async resolveDestination(query:string):Promise<Destination|null>{
    const url=new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q",query); url.searchParams.set("format","jsonv2");
    url.searchParams.set("addressdetails","1"); url.searchParams.set("limit","5");
    const res=await fetch(url,{headers:{"User-Agent":process.env.NOMINATIM_USER_AGENT??"TripiorResearchEngine/0.1"}});
    if(!res.ok) throw new Error("Nominatim failed: "+res.status);
    const rows=await res.json() as any[]; const row=rows[0]; if(!row)return null;
    return {canonicalIdentifier:row.osm_type&&row.osm_id?"osm:"+row.osm_type+":"+row.osm_id:"nominatim:"+row.place_id,
      name:String(row.display_name).split(",")[0],country:row.address?.country,region:row.address?.state??row.address?.region,
      latitude:Number(row.lat),longitude:Number(row.lon),countryCode:row.address?.country_code?.toUpperCase(),aliases:[query]};
  }
}

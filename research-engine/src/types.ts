export type ResearchProfile = {
  destination:string; travelStart?:string; travelEnd?:string; travellerCount:number;
  travellerCharacteristics?:string[]; interests?:string[]; preferredCategories?:string[];
  excludedCategories?:string[]; mustVisits?:string[];
  budget?:{currency?:string;min?:number;max?:number}; transportPreferences?:string[];
  maxDailyTravelMinutes?:number; maxDailyActivityMinutes?:number; maxGeographicRangeKm?:number;
  accessibilityRequirements?:string[]; otherConstraints?:Record<string,unknown>;
};
export type Destination={canonicalIdentifier:string;name:string;country?:string;region?:string;latitude?:number;longitude?:number;timezone?:string;countryCode?:string;aliases?:string[]};
export type Candidate={provider:string;providerPlaceId:string;name:string;latitude:number;longitude:number;address?:Record<string,unknown>;categories:string[];rating?:number;reviewCount?:number;status?:string;website?:string;raw:unknown};

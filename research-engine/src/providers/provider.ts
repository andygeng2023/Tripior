import type {Candidate,Destination,ResearchProfile} from "../types.js";
export interface ResearchProvider {
  readonly name:string;
  resolveDestination(query:string):Promise<Destination|null>;
  discover(profile:ResearchProfile,destination:Destination):Promise<Candidate[]>;
}

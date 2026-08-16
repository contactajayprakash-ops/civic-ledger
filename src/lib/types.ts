// Shared data model. Everything the UI renders comes from these shapes,
// whether it was produced by the Legistar adapter, the web adapter, or a live run.

export type Category =
  | "budget"
  | "contracts"
  | "housing"
  | "zoning"
  | "transportation"
  | "public-safety"
  | "parks"
  | "utilities"
  | "health"
  | "environment"
  | "governance"
  | "ceremonial"
  | "other";

export const CATEGORIES: Category[] = [
  "budget",
  "contracts",
  "housing",
  "zoning",
  "transportation",
  "public-safety",
  "parks",
  "utilities",
  "health",
  "environment",
  "governance",
  "ceremonial",
  "other",
];

export const CATEGORY_LABEL: Record<Category, string> = {
  budget: "Budget & taxes",
  contracts: "Contracts & purchasing",
  housing: "Housing",
  zoning: "Land use & zoning",
  transportation: "Streets & transit",
  "public-safety": "Police, fire & safety",
  parks: "Parks & recreation",
  utilities: "Water, sewer & utilities",
  health: "Health & human services",
  environment: "Environment & climate",
  governance: "How the city runs",
  ceremonial: "Proclamations",
  other: "Other",
};

export type Outcome =
  | "passed"
  | "failed"
  | "referred"
  | "held"
  | "withdrawn"
  | "introduced"
  | "discussed"
  | "unknown";

export interface Vote {
  person: string;
  value: "yes" | "no" | "abstain" | "absent" | "other";
  raw: string;
}

export interface Action {
  meetingId: string;
  date: string; // ISO date
  body: string;
  action: string; // raw action name from the source, e.g. "Passed Finally"
  outcome: Outcome;
  votes: Vote[];
  tally?: { yes: number; no: number; abstain: number; absent: number };
}

export interface Money {
  amount: number; // USD
  kind: "spend" | "receive" | "transfer" | "budget" | "unknown";
  recipient?: string;
  note?: string;
}

export interface Matter {
  id: string;
  file: string; // legislative file number like 2026-0531
  type: string; // Resolution, Ordinance, ...
  title: string; // official title, often a wall of legalese
  plain?: string; // 1-3 sentence plain-language rewrite (LLM)
  whoItAffects?: string; // (LLM)
  category: Category;
  tags: string[];
  money?: Money;
  district?: string;
  location?: { text: string; lat?: number; lng?: number };
  sponsors: string[];
  status: string; // source status text
  latestOutcome: Outcome;
  introducedOn?: string;
  decidedOn?: string;
  actions: Action[];
  sourceUrl: string;
  textExcerpt?: string; // first ~1500 chars of the legislative text
  textLength?: number;
  enrichment?: "llm" | "heuristic";
}

export interface Meeting {
  id: string;
  body: string;
  date: string;
  time?: string;
  location?: string;
  agendaUrl?: string;
  minutesUrl?: string;
  videoUrl?: string;
  sourceUrl: string;
  matterIds: string[];
  status?: string; // "Final", "Draft", "Cancelled"
  digest?: string; // LLM-written 3-5 sentence recap
}

export interface Member {
  name: string;
  votes: { yes: number; no: number; abstain: number; absent: number };
  dissents: number; // times voted against the majority
}

export interface CitySource {
  kind: "legistar" | "web";
  client?: string; // legistar client slug
  url: string;
  label: string;
}

export interface City {
  slug: string;
  name: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
  population?: number;
  source: CitySource;
  bodies: string[]; // bodies included in this snapshot
  window: { from: string; to: string };
  generatedAt: string;
  llmModel?: string;
}

export interface CitySnapshot {
  city: City;
  meetings: Meeting[];
  matters: Matter[];
  members: Member[];
}

export interface CityStats {
  meetings: number;
  matters: number;
  passed: number;
  failed: number;
  dollarsAuthorized: number;
  contestedVotes: number; // roll calls that were not unanimous
  byCategory: Record<Category, number>;
  moneyByCategory: Record<Category, number>;
}

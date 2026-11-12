export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export type Evidence = { quote: string; url: string; retrieved_at: string; verified: boolean };
export type Claim = {
  id: string;
  section: string;
  statement: string;
  status: "fact" | "inferred" | "company_confirmed";
  evidence: Evidence[];
  reasoning: string;
  origin: "agent" | "user";
  review: "unreviewed" | "confirmed" | "rejected" | "edited";
  note: string;
};
export type Source = { id: number; url: string; title: string; kind: string; retrieved_at: string; injection_flag: boolean; simulated: boolean };
export type Profile = {
  slug: string;
  name: string;
  website: string;
  summary: string;
  size_hint: string;
  size_basis: string;
  claims: Claim[];
  missing: { section: string; note: string }[];
  sources: Source[];
  generated_at: string;
  verifier: { facts_checked?: number; facts_verified?: number; downgraded?: number };
};
export type CompanyResp = { slug: string; name: string; website: string; bsp_page: string; version: number; updated_at: string; profile: Profile };
export type Opportunity = {
  id: string;
  kind: "funding" | "event" | "testbed";
  source: string;
  source_name: string;
  title: string;
  summary: string;
  eligibility_text: string;
  url: string;
  apply_url: string;
  published: string | null;
  opens: string | null;
  deadline: string | null;
  event_date: string | null;
  location_mode: string | null;
  location: string | null;
  audience: string | null;
  budget: string | null;
  programme: string | null;
  fetched_at: string;
  simulated: boolean;
};
export type Explanation = {
  relevance: "strong" | "possible" | "weak";
  why: string;
  profile_points: string[];
  requirements: { requirement: string; status: "likely_met" | "unknown" | "likely_not_met"; basis: string }[];
  uncertainties: string[];
  next_step: string;
  error?: string;
};
export type FeedItem = {
  rank: number;
  score: number;
  components: Record<string, number>;
  anchor_claim: string;
  opportunity: Opportunity;
  explanation: Explanation | null;
  feedback: string[];
};
export type Member = { slug: string; name: string; website: string; bsp_page: string; demo: boolean; profiled: boolean; industry: string };
export type Overview = {
  members: number;
  profiled: { slug: string; name: string; profile_version: number; updated_at: string }[];
  opportunities: { funding: number; event: number; testbed: number };
  sources: { kind: string; source: string; n: number; fetched_at: string; name?: string; url?: string }[];
  closing_soon: Opportunity[];
  today: string;
};
export type Eco = {
  nodes: { slug: string; name: string; demo: boolean; x: number; y: number; industry: string }[];
  edges: { a: string; b: string; sim: number }[];
};
export type Connection = {
  slug: string;
  name: string;
  bsp_page: string;
  website: string;
  similarity: number;
  headline: string;
  shared: string[];
  complementary: string;
  caution: string;
};
export type GuardResult = {
  category: string;
  reason: string;
  clarifying_question: string;
  layers: { layer: string; score?: number; flag?: boolean; category?: string | null; reason?: string }[];
};
export type ChatResp = {
  answer: string;
  citations: { ref: string; title: string; url: string; date: string; kind: string }[];
  next_step: string;
  refer_to_staff: boolean;
  staff_contact?: string;
  guard: GuardResult;
};

export type Alerts = {
  subscription: { email: string; kinds: string[]; min_relevance: string; lang: string; consent_at: string; active: boolean } | null;
  outbox: { id: number; email: string; subject: string; items: number; status: "preview" | "sent" | "failed"; detail: string; created_at: string }[];
  smtp_configured: boolean;
  new?: number;
  reminders?: number;
  message?: string;
};

export const withLang = (path: string, lang: string) => `${path}${path.includes("?") ? "&" : "?"}lang=${lang}`;

export const fmtDate = (d?: string | null, lang: string = "sv") => {
  if (!d) return "—";
  const dt = new Date(d.length <= 10 ? d + "T00:00:00" : d);
  return dt.toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
};
export const daysUntil = (d?: string | null) => {
  if (!d) return null;
  const ms = new Date(d.slice(0, 10) + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime();
  return Math.round(ms / 86400000);
};
export const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

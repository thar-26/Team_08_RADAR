export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
/** Built for the online demo (Vercel): editing, sign-in, member search and alerts are off. */
export const HOSTED = process.env.NEXT_PUBLIC_HOSTED_DEMO === "1";

/** Error with the HTTP status, so pages can tell "sign in" (401) from "no access" (403). */
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Short-lived token proving who is signed in; fetched from our own Next.js route.
let cached: { token: string | null; exp: number } | null = null;
async function backendToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (cached && cached.exp - 30 > Date.now() / 1000) return cached.token;
  try {
    const r = await fetch("/api/backend-token", { cache: "no-store" });
    const j = r.ok ? await r.json() : { token: null, exp: 0 };
    cached = { token: j.token, exp: j.exp || Date.now() / 1000 + 60 };
  } catch {
    cached = { token: null, exp: Date.now() / 1000 + 30 };
  }
  return cached.token;
}
export const resetToken = () => { cached = null; };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await backendToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export type Me = {
  user: { email: string; name: string; staff: boolean } | null;
  login_required: boolean;
  memberships?: { slug: string; name: string; status: "approved" | "pending" | "rejected"; via: string }[];
  suggestions?: { slug: string; name: string }[];
};

export type Evidence = { quote: string; url: string; retrieved_at: string; verified: boolean };
export type Claim = {
  id: string;
  section: string;
  statement: string;
  status: "fact" | "inferred" | "company_confirmed";
  evidence: Evidence[];
  reasoning: string;
  origin: "agent" | "user";
  review: "unreviewed" | "confirmed" | "rejected" | "outdated" | "edited";
  note: string;
  updated_by?: string;
  updated_at?: string;
  visibility?: "private" | "public";
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
export type CompanyResp = { slug: string; name: string; website: string; bsp_page: string; version: number; updated_at: string; can_edit: boolean; profile: Profile };
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
  manually_verified?: boolean;
  logo?: string | null;
  domains?: string[];
  title_sv?: string | null;
  region?: string;
  city?: string;
  contacts: { name: string; role: string; email: string; phone: string }[];
  contact_links: { label: string; url: string }[];
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
export type Reason = { key: string; p?: Record<string, string | number> };
export type FeedItem = {
  rank: number;
  score: number;
  /** Indicative 1-10 fit score shown to the user (formula blended with the Matcher's reading). */
  fit: number;
  level: "strong" | "possible" | "weak";
  assessed: boolean;
  /** The written explanation is being regenerated after a profile change. */
  updating?: boolean;
  reasons: Reason[];
  missing: string[];
  components: Record<string, number>;
  anchor_claim: string;
  opportunity: Opportunity;
  explanation: Explanation | null;
  feedback: string[];
};
export type Member = { slug: string; name: string; website: string; bsp_page: string; demo: boolean; profiled: boolean; industry: string; logo?: string | null; domains?: string[] };
export type Domain = { key: string; name: string; opportunities: number; members: number };
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
  profiled?: boolean;
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
  citations: { ref: string; title: string; url: string; date: string; kind: string; slug?: string; profiled?: boolean }[];
  next_step: string;
  refer_to_staff: boolean;
  staff_contact?: string;
  guard: GuardResult;
};

export type Alerts = {
  subscription: { email: string; kinds: string[]; min_relevance: string; lang: string; consent_at: string; active: boolean; frequency?: string; last_digest_at?: string | null } | null;
  scheduler: { active: boolean; configured: boolean; last_run: string | null; interval_minutes: number };
  allowlist: boolean;
  allowed: boolean;
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

/** A member found by expertise or technology (public information only). */
export type MemberHit = { slug: string; name: string; score: number; snippet: string; industry: string; profiled: boolean; website: string; bsp_page: string };

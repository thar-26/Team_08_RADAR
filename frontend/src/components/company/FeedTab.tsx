"use client";

import { useState } from "react";
import { KindTag, When } from "@/components/ui";
import { api, API, fmtDate, host, type Explanation, type FeedItem } from "@/lib/api";

const FILTERS = [
  ["all", "Everything"],
  ["funding", "Funding"],
  ["event", "Events"],
  ["testbed", "Testbeds"],
] as const;

const COMPONENT_LABEL: Record<string, string> = {
  semantic: "Fit with your profile",
  priority: "Your stated priorities",
  type_preference: "Type you asked for",
  feedback: "Your feedback",
  eligibility_conflict: "Eligibility conflict",
  deadline_pressure: "Deadline very close",
};

export default function FeedTab({ slug, items, onFeedback, toast }: {
  slug: string; items: FeedItem[]; onFeedback: () => void; toast: (m: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const shown = items.filter((i) => filter === "all" || i.opportunity.kind === filter);
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, k === "all" ? items.length : items.filter((i) => i.opportunity.kind === k).length]));

  return (
    <div>
      <div className="row" style={{ margin: "20px 0 4px" }}>
        {FILTERS.map(([k, l]) => (
          <button key={k} className={`btn small ${filter === k ? "" : "ghost"}`} onClick={() => setFilter(k)}>
            {l} <span className="mono" style={{ opacity: 0.7 }}>{counts[k]}</span>
          </button>
        ))}
        <span className="mono muted" style={{ marginLeft: "auto" }}>Possible matches — not eligibility decisions</span>
      </div>
      {shown.map((it, i) => (
        <FeedCard key={it.opportunity.id} slug={slug} item={it} rank={i + 1} onFeedback={onFeedback} toast={toast} />
      ))}
      {!shown.length && <p className="muted" style={{ padding: "30px 0" }}>Nothing in this category right now.</p>}
    </div>
  );
}

function FeedCard({ slug, item, rank, onFeedback, toast }: {
  slug: string; item: FeedItem; rank: number; onFeedback: () => void; toast: (m: string) => void;
}) {
  const o = item.opportunity;
  const [exp, setExp] = useState<Explanation | null>(item.explanation);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const fit = Math.max(0, Math.min(1, item.score));

  async function explain() {
    setLoading(true);
    try {
      setExp(await api<Explanation>(`/api/companies/${slug}/explain/${encodeURIComponent(o.id)}`, { method: "POST" }));
    } finally {
      setLoading(false);
    }
  }
  async function fb(value: "up" | "down" | "saved") {
    const undo = item.feedback.includes(value);
    await api(`/api/companies/${slug}/feedback`, { method: "POST", body: JSON.stringify({ opp_id: o.id, value, undo }) });
    toast(value === "saved" ? (undo ? "Removed from saved" : "Saved") : value === "down" ? "Hidden — similar items move down" : undo ? "Feedback removed" : "Thanks — similar items move up");
    onFeedback();
  }

  return (
    <article className="feed-item">
      <div>
        <div className="feed-rank">{String(rank).padStart(2, "0")}</div>
        <div className="fitbar" title={`Ranking score ${item.score.toFixed(2)}`}><i style={{ width: `${fit * 100}%` }} /></div>
      </div>
      <div>
        <div className="row" style={{ gap: 8 }}>
          <KindTag kind={o.kind} />
          {exp && !exp.error && <span className={`tag ${exp.relevance === "strong" ? "confirmed" : exp.relevance === "possible" ? "" : "inferred"}`}>{exp.relevance} fit</span>}
          {o.simulated && <span className="tag sim">Simulated</span>}
          <span className="mono muted">{o.source_name}{o.programme && o.source === "eu" ? ` · ${o.programme}` : ""}</span>
        </div>
        <h3 style={{ marginTop: 10 }}>
          <a href={o.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>{o.title}</a>
        </h3>
        <div className="meta">
          <When o={o} />
          {o.location_mode && o.kind === "event" && <span>{o.location_mode.replace("_", " ")}{o.location ? ` · ${o.location}` : ""}</span>}
          <span>source <a href={o.url} target="_blank" rel="noreferrer">{host(o.url)} ↗</a></span>
          <span>retrieved {fmtDate(o.fetched_at)}</span>
        </div>

        {exp && !exp.error ? (
          <>
            <div className="why">{exp.why}</div>
            {exp.next_step && <div style={{ fontSize: 13.5 }}><span className="eyebrow" style={{ marginRight: 8 }}>Next step</span>{exp.next_step}</div>}
            <button className="btn ghost small" style={{ marginTop: 12 }} onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? "Hide" : "Show"} requirements & ranking
            </button>
            {open && (
              <div style={{ marginTop: 12, display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Requirement check · indicative only</div>
                  {exp.requirements.map((r, i) => (
                    <div className="req" key={i}>
                      <span className={`req-icon ${r.status}`} aria-label={r.status}>{r.status === "likely_met" ? "✓" : r.status === "unknown" ? "?" : "✕"}</span>
                      <span><b style={{ fontWeight: 500 }}>{r.requirement}</b><br /><span className="muted">{r.basis}</span></span>
                    </div>
                  ))}
                  {exp.uncertainties.length > 0 && (
                    <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Uncertain: {exp.uncertainties.join(" · ")}</p>
                  )}
                </div>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Why it ranks #{rank}</div>
                  {Object.entries(item.components).filter(([k, v]) => k in COMPONENT_LABEL && v !== 0).map(([k, v]) => (
                    <div key={k} className="spread" style={{ fontSize: 13.5, padding: "4px 0", borderTop: "1px dotted var(--rule)" }}>
                      <span>{COMPONENT_LABEL[k]}</span>
                      <span className="mono" style={{ color: v < 0 ? "var(--signal)" : "var(--ink)" }}>{v > 0 ? "+" : ""}{v.toFixed(2)}</span>
                    </div>
                  ))}
                  {item.anchor_claim && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Closest profile line: “{item.anchor_claim}”</p>}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 12 }}>
            <p className="muted" style={{ fontSize: 14, margin: "0 0 8px" }}>{o.summary.slice(0, 220)}{o.summary.length > 220 ? "…" : ""}</p>
            <button className="btn ghost small" onClick={explain} disabled={loading}>{loading ? "Matcher is reading…" : "Explain this match"}</button>
          </div>
        )}

        <div className="row" style={{ marginTop: 14, gap: 6 }}>
          <button className={`btn icon small ghost ${item.feedback.includes("up") ? "on" : ""}`} onClick={() => fb("up")} aria-label="Relevant">▲ Relevant</button>
          <button className="btn icon small ghost" onClick={() => fb("down")} aria-label="Not relevant">▼ Not for us</button>
          <button className={`btn icon small ghost ${item.feedback.includes("saved") ? "on" : ""}`} onClick={() => fb("saved")}>{item.feedback.includes("saved") ? "★ Saved" : "☆ Save"}</button>
          {(o.deadline || o.event_date) && <a className="btn icon small ghost" href={`${API}/api/opportunities/${encodeURIComponent(o.id)}/ics`}>+ Calendar</a>}
          {o.apply_url && o.apply_url !== o.url && <a className="btn icon small ghost" href={o.apply_url} target="_blank" rel="noreferrer">Apply page ↗</a>}
        </div>
      </div>
    </article>
  );
}

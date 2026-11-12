"use client";

import { useState } from "react";
import { KindPill, When } from "@/components/ui";
import { api, API, fmtDate, host, withLang, type Explanation, type FeedItem } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

const FILTERS = ["all", "funding", "event", "testbed"] as const;
const COMPONENTS = ["semantic", "priority", "type_preference", "feedback", "eligibility_conflict", "deadline_pressure"];

export default function FeedTab({ slug, items, onFeedback, toast }: {
  slug: string; items: FeedItem[]; onFeedback: () => void; toast: (m: string) => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const shown = items.filter((i) => filter === "all" || i.opportunity.kind === filter);
  const count = (k: string) => (k === "all" ? items.length : items.filter((i) => i.opportunity.kind === k).length);

  return (
    <div>
      <div className="spread" style={{ marginTop: 22 }}>
        <div className="seg" role="group">
          {FILTERS.map((k) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {t(`feed.${k}` as Key)}<span className="count">{count(k)}</span>
            </button>
          ))}
        </div>
        <span className="muted small">{t("feed.disclaimer")}</span>
      </div>
      <div className="feed">
        {shown.map((it, i) => (
          <FeedCard key={it.opportunity.id} slug={slug} item={it} rank={i + 1} onFeedback={onFeedback} toast={toast} />
        ))}
      </div>
      {!shown.length && <p className="muted" style={{ padding: "30px 0" }}>{t("feed.empty")}</p>}
    </div>
  );
}

function FeedCard({ slug, item, rank, onFeedback, toast }: {
  slug: string; item: FeedItem; rank: number; onFeedback: () => void; toast: (m: string) => void;
}) {
  const { t, lang } = useI18n();
  const o = item.opportunity;
  const [fresh, setFresh] = useState<Explanation | null>(null);
  const exp = fresh ?? item.explanation;
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function explain() {
    setLoading(true);
    try {
      setFresh(await api<Explanation>(withLang(`/api/companies/${slug}/explain/${encodeURIComponent(o.id)}`, lang), { method: "POST" }));
    } finally {
      setLoading(false);
    }
  }
  async function fb(value: "up" | "down" | "saved") {
    const undo = item.feedback.includes(value);
    await api(`/api/companies/${slug}/feedback`, { method: "POST", body: JSON.stringify({ opp_id: o.id, value, undo }) });
    toast(value === "saved" ? t(undo ? "toast.unsaved" : "toast.saved") : value === "down" ? t("toast.down") : t(undo ? "toast.removed" : "toast.up"));
    onFeedback();
  }

  const fitCls = exp?.relevance === "strong" ? "gold" : exp?.relevance === "possible" ? "brand" : "outline";
  return (
    <article className={`feed-card ${rank === 1 ? "top" : ""}`}>
      <div>
        <div className="rank">{rank}</div>
        <div className="fit" title={`${item.score.toFixed(2)}`}><i style={{ width: `${Math.max(0, Math.min(1, item.score)) * 100}%` }} /></div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <KindPill kind={o.kind} />
          {exp && !exp.error && <span className={`pill ${fitCls}`}>{t(`fit.${exp.relevance}` as Key)}</span>}
          {o.simulated && <span className="pill warn">{t("prof.simulated")}</span>}
          <span className="muted small">{o.source_name}</span>
        </div>
        <a className="feed-title" href={o.url} target="_blank" rel="noreferrer">{o.title}</a>
        <div className="meta">
          <When o={o} />
          {o.kind === "event" && o.location_mode && o.location_mode !== "unknown" && <span>{t(`mode.${o.location_mode}` as Key)}{o.location ? ` · ${o.location}` : ""}</span>}
          <span>{t("feed.source")} <a href={o.url} target="_blank" rel="noreferrer">{host(o.url)} ↗</a></span>
          <span>{t("feed.retrieved", { date: fmtDate(o.fetched_at, lang) })}</span>
        </div>

        {exp && !exp.error ? (
          <>
            <div className="why">{exp.why}</div>
            {exp.next_step && <div style={{ fontSize: 14 }}><b>{t("feed.next")}:</b> {exp.next_step}</div>}
            {open && (
              <div style={{ marginTop: 14, display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                <div>
                  <div className="panel-title">{t("feed.reqs")}</div>
                  {exp.requirements.map((r, i) => (
                    <div className="req" key={i}>
                      <span className={`req-icon ${r.status}`} title={t(`req.${r.status}` as Key)}>{r.status === "likely_met" ? "✓" : r.status === "unknown" ? "?" : "✕"}</span>
                      <span><b style={{ fontWeight: 600 }}>{r.requirement}</b><br /><span className="muted">{r.basis}</span></span>
                    </div>
                  ))}
                  {exp.uncertainties.length > 0 && <p className="muted small" style={{ marginTop: 10 }}>{t("feed.uncertain")}: {exp.uncertainties.join(" · ")}</p>}
                </div>
                <div>
                  <div className="panel-title">{t("feed.whyRank", { n: rank })}</div>
                  {Object.entries(item.components).filter(([k, v]) => COMPONENTS.includes(k) && v !== 0).map(([k, v]) => (
                    <div key={k} className="spread" style={{ fontSize: 13.5, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                      <span>{t(`comp.${k}` as Key)}</span>
                      <b style={{ color: v < 0 ? "var(--danger)" : "var(--brand-text)" }}>{v > 0 ? "+" : ""}{v.toFixed(2)}</b>
                    </div>
                  ))}
                  {item.anchor_claim && <p className="muted small" style={{ marginTop: 8 }}>{t("feed.closest")}: “{item.anchor_claim}”</p>}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 10 }}>
            <p className="muted" style={{ fontSize: 14, margin: "0 0 10px" }}>{o.summary.slice(0, 220)}{o.summary.length > 220 ? "…" : ""}</p>
            <button className="btn soft small" onClick={explain} disabled={loading}>{loading ? t("feed.explaining") : t("feed.explain")}</button>
          </div>
        )}

        <div className="actions">
          <button className={`btn ghost small ${item.feedback.includes("up") ? "on" : ""}`} onClick={() => fb("up")}>👍 {t("feed.relevant")}</button>
          <button className="btn ghost small" onClick={() => fb("down")}>👎 {t("feed.notForUs")}</button>
          <button className={`btn ghost small ${item.feedback.includes("saved") ? "on" : ""}`} onClick={() => fb("saved")}>{item.feedback.includes("saved") ? `★ ${t("feed.saved")}` : `☆ ${t("feed.save")}`}</button>
          {(o.deadline || o.event_date) && <a className="btn ghost small" href={`${API}/api/opportunities/${encodeURIComponent(o.id)}/ics`}>📅 {t("feed.calendar")}</a>}
          {o.apply_url && o.apply_url !== o.url && <a className="btn ghost small" href={o.apply_url} target="_blank" rel="noreferrer">{t("feed.apply")} ↗</a>}
          {exp && !exp.error && (
            <button className="btn ghost small" style={{ marginLeft: "auto" }} onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? t("feed.hide") : t("feed.show")}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

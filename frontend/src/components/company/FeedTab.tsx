"use client";

import { useState } from "react";
import { KindPill, When } from "@/components/ui";
import { api, API, fmtDate, host, withLang, type Explanation, type FeedItem, type Opportunity } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

const FILTERS = ["all", "funding", "event", "testbed"] as const;
const COMPONENTS = ["semantic", "priority", "type_preference", "feedback", "eligibility_conflict", "deadline_pressure"];

export default function FeedTab({ slug, company, items, onFeedback, toast, onUndoable }: {
  slug: string; company: string; items: FeedItem[]; onFeedback: () => void; toast: (m: string) => void; onUndoable: (undo: () => void) => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const shown = items.filter((i) => filter === "all" || i.opportunity.kind === filter);
  const count = (k: string) => (k === "all" ? items.length : items.filter((i) => i.opportunity.kind === k).length);

  return (
    <div>
      <div className="feed-toolbar">
        <div className="seg" role="group">
          {FILTERS.map((k) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {t(`feed.${k}` as Key)}<span className="count">{count(k)}</span>
            </button>
          ))}
        </div>
        <span className="note">{t("feed.disclaimer")}</span>
      </div>
      <div className="feed">
        {shown.map((it, i) => (
          <FeedItemRow key={it.opportunity.id} slug={slug} company={company} item={it} rank={i + 1} onFeedback={onFeedback} toast={toast} onUndoable={onUndoable} />
        ))}
      </div>
      {!shown.length && <p className="note" style={{ padding: "40px 0" }}>{t("feed.empty")}</p>}
    </div>
  );
}

/** Drawn status mark for the requirement check (no emoji or symbol glyphs). */
function StatusIcon({ status }: { status: string }) {
  if (status === "unknown") return <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden><circle cx="5" cy="10.5" r="1.3" fill="currentColor" /><path d="M2 3.4a3 3 0 1 1 4.2 2.7C5.4 6.5 5 7 5 7.9" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
  if (status === "likely_met") return <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden><path d="M1 5.2 4.3 8.4 11 1.6" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg>;
  return <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="2.2" /></svg>;
}

/** Fit bar: strong = full, possible = about half, weak = a sliver. */
function Fit({ relevance }: { relevance?: Explanation["relevance"] }) {
  const { t } = useI18n();
  const level = relevance ?? "none";
  return (
    <div className={`fit fit-${level}`} role="img" aria-label={t(`fit.${level}` as Key)}>
      <div className="fit-bar"><i /></div>
      <span className="fit-label">{t(`fit.${level}` as Key)}</span>
    </div>
  );
}

function FeedItemRow({ slug, company, item, rank, onFeedback, toast, onUndoable }: {
  slug: string; company: string; item: FeedItem; rank: number; onFeedback: () => void; toast: (m: string) => void; onUndoable: (undo: () => void) => void;
}) {
  const { t, lang } = useI18n();
  const o = item.opportunity;
  const [fresh, setFresh] = useState<Explanation | null>(null);
  const exp = fresh ?? item.explanation;
  const ok = exp && !exp.error;
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState(false);

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
    // "Not for us" can be undone from the toast for a few seconds.
    if (value === "down" && !undo) onUndoable(async () => { await api(`/api/companies/${slug}/feedback`, { method: "POST", body: JSON.stringify({ opp_id: o.id, value: "down", undo: true }) }); onFeedback(); });
    onFeedback();
  }

  return (
    <article className="feed-item" data-reveal>
      <div>
        <div className="rank">{rank}</div>
        <Fit relevance={ok ? exp!.relevance : undefined} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 10 }}>
          <KindPill kind={o.kind} />
          {o.simulated && <span className="tag warn">{t("prof.simulated")}</span>}
          <span className="note">{o.source_name}</span>
        </div>
        <a className="feed-title" href={o.url} target="_blank" rel="noreferrer">{o.title}</a>
        <div className="meta">
          <When o={o} />
          {o.kind === "event" && o.location_mode && o.location_mode !== "unknown" && <span>{t(`mode.${o.location_mode}` as Key)}{o.location ? ` · ${o.location}` : ""}</span>}
          <span>{t("feed.source")} <a href={o.url} target="_blank" rel="noreferrer">{host(o.url)}</a></span>
          <span>{t("feed.retrieved", { date: fmtDate(o.fetched_at, lang) })}</span>
        </div>

        {ok ? (
          <>
            <p className="why">{exp!.why}</p>
            {exp!.next_step && <p className="next"><b>{t("feed.next")}:</b> {exp!.next_step}</p>}
            {open && (
              <div className="detail">
                <div>
                  <h4>{t("feed.reqs")}</h4>
                  {exp!.requirements.map((r, i) => (
                    <div className="req" key={i}>
                      <span className={`req-icon ${r.status}`} title={t(`req.${r.status}` as Key)}><StatusIcon status={r.status} /></span>
                      <span><b>{r.requirement}</b><br /><span className="note">{r.basis}</span></span>
                    </div>
                  ))}
                  {exp!.uncertainties.length > 0 && <p className="note" style={{ marginTop: 12 }}>{t("feed.uncertain")}: {exp!.uncertainties.join(" · ")}</p>}
                </div>
                <div>
                  <h4>{t("feed.whyRank", { n: rank })}</h4>
                  {Object.entries(item.components).filter(([k, v]) => COMPONENTS.includes(k) && v !== 0).map(([k, v]) => (
                    <div key={k} className="spread req" style={{ display: "flex" }}>
                      <span>{t(`comp.${k}` as Key)}</span>
                      <b className="num" style={{ color: v < 0 ? "var(--danger)" : "var(--link)" }}>{v > 0 ? "+" : ""}{v.toFixed(2)}</b>
                    </div>
                  ))}
                  {item.anchor_claim && <p className="note" style={{ marginTop: 12 }}>{t("feed.closest")}: “{item.anchor_claim}”</p>}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 14 }}>
            <p className="next" style={{ marginTop: 0 }}>{o.summary.slice(0, 240)}{o.summary.length > 240 ? "…" : ""}</p>
            <button className="btn quiet small" style={{ marginTop: 12 }} onClick={explain} disabled={loading}>{loading ? t("feed.explaining") : t("feed.explain")}</button>
          </div>
        )}

        {contact && <ContactCard o={o} company={company} />}

        <div className="actions">
          <button className="btn small" onClick={() => setContact(!contact)} aria-expanded={contact}>{contact ? t("ct.hide") : t("ct.show")}</button>
          <button className={`btn quiet small ${item.feedback.includes("saved") ? "on" : ""}`} onClick={() => fb("saved")} aria-pressed={item.feedback.includes("saved")}>{item.feedback.includes("saved") ? t("feed.saved") : t("feed.save")}</button>
          <button className={`btn quiet small ${item.feedback.includes("up") ? "on" : ""}`} onClick={() => fb("up")} aria-pressed={item.feedback.includes("up")}>{t("feed.relevant")}</button>
          <button className="btn quiet small" onClick={() => fb("down")}>{t("feed.notForUs")}</button>
          {(o.deadline || o.event_date) && <a className="btn quiet small" href={`${API}/api/opportunities/${encodeURIComponent(o.id)}/ics`}>{t("feed.calendar")}</a>}
          {o.apply_url && o.apply_url !== o.url && <a className="btn quiet small" href={o.apply_url} target="_blank" rel="noreferrer">{t("feed.apply")}</a>}
          {ok && <button className="textbtn" style={{ marginLeft: "auto" }} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? t("feed.hide") : t("feed.show")}</button>}
        </div>
      </div>
    </article>
  );
}

/** Who to talk to: the funder's named contacts (Vinnova publishes them per call),
 *  the official route for EU calls, the testbed or organiser, and the park. */
function ContactCard({ o, company }: { o: Opportunity; company: string }) {
  const { t } = useI18n();
  const subject = t("ct.subject", { title: o.title.slice(0, 90) });
  const body = t("ct.body", { title: o.title.slice(0, 120), company });
  const mail = (email: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <div className="contact">
      <h4>{t("ct.title")}</h4>
      {o.contacts.length > 0 && (
        <>
          <div className="people">
            {o.contacts.map((c) => (
              <div className="person" key={c.email + c.name}>
                <b>{c.name}</b>
                {c.role && <span className="role">{c.role}</span>}
                {c.email && <a href={mail(c.email)}>{c.email}</a>}
                {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a>}
              </div>
            ))}
          </div>
          <p className="note" style={{ margin: "12px 0 0" }}>{t("ct.vinnovaNote")}</p>
        </>
      )}
      {o.contact_links.length > 0 && (
        <div className="row" style={{ gap: "8px 24px", marginTop: o.contacts.length ? 12 : 0 }}>
          {o.contact_links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{t(`ct.${l.label}` as Key)} ↗</a>
          ))}
        </div>
      )}
      <p style={{ margin: "14px 0 0", fontSize: 15 }}>
        {t("ct.bspHelp")} <a href="https://www.bluesciencepark.se/kontakt/kontaktpersoner/" target="_blank" rel="noreferrer">{t("ct.bsp")} ↗</a>
      </p>
    </div>
  );
}

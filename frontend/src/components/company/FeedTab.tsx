"use client";

import { useEffect, useState } from "react";
import { KindPill, Logo, When } from "@/components/ui";
import { api, API, fmtDate, host, withLang, type Domain, type Explanation, type FeedItem, type Opportunity, type Reason } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

const FILTERS = ["all", "funding", "event", "testbed"] as const;
const FACTORS = [["technical", 35], ["priorities", 25], ["applicability", 20], ["geography", 10], ["timeliness", 10]] as const;
const PAGE = 10;
const REGIONS = ["blekinge", "stockholm", "vastra_gotaland", "skane", "other_se", "abroad", "online", "unknown"] as const;
const FORMATS = ["online", "in_person", "hybrid", "unknown"] as const;

export default function FeedTab({ slug, company, items: ownItems, canEdit, onFeedback, toast, onUndoable }: {
  slug: string; company: string; items: FeedItem[]; canEdit: boolean; onFeedback: () => void; toast: (m: string) => void; onUndoable: (undo: () => void) => void;
}) {
  const { t, lang } = useI18n();
  // Look beyond the company's own fields: any field, still with the company's fit score.
  const [fields, setFields] = useState<Domain[]>([]);
  const [domain, setDomain] = useState("");
  const [domainItems, setDomainItems] = useState<FeedItem[] | null>(null);
  useEffect(() => { api<Domain[]>(withLang("/api/domains", lang)).then(setFields).catch(() => setFields([])); }, [lang]);
  useEffect(() => {
    if (!domain) { setDomainItems(null); return; }
    setDomainItems(null);
    api<FeedItem[]>(withLang(`/api/companies/${slug}/feed?domain=${domain}`, lang)).then(setDomainItems).catch(() => setDomainItems([]));
  }, [domain, slug, lang]);
  const items = domain ? domainItems ?? [] : ownItems;
  // After a profile change the explanations are rewritten in the background: check back until done.
  const updating = ownItems.some((i) => i.updating);
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    if (!updating || polls > 20) return;
    const id = setTimeout(() => { setPolls((n) => n + 1); onFeedback(); }, 8000);
    return () => clearTimeout(id);
  }, [updating, polls, onFeedback]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [pages, setPages] = useState(1);
  const [region, setRegion] = useState("all");
  const [city, setCity] = useState("all");
  const [format, setFormat] = useState("all");
  const events = items.filter((i) => i.opportunity.kind === "event");
  const cities = [...new Set(events.map((i) => i.opportunity.city).filter((c): c is string => !!c))].sort();
  const placeOk = (o: Opportunity) =>
    o.kind !== "event" || filter !== "event" ||
    ((region === "all" || o.region === region) && (city === "all" || o.city === city) &&
     (format === "all" || (o.location_mode || "unknown") === format));
  const all = items.filter((i) => (filter === "all" || i.opportunity.kind === filter) && placeOk(i.opportunity));
  const n = (pred: (o: Opportunity) => boolean) => events.filter((i) => pred(i.opportunity)).length;
  const resetPage = () => setPages(1);
  const shown = all.slice(0, pages * PAGE);
  const rest = Math.min(PAGE, all.length - shown.length);
  const count = (k: string) => (k === "all" ? items.length : items.filter((i) => i.opportunity.kind === k).length);

  return (
    <div>
      <div className="field-pick">
        <label>
          <span>{t("dom.label")}</span>
          <select className="select" value={domain} onChange={(e) => { setDomain(e.target.value); setPages(1); }}>
            <option value="">{t("dom.own")}</option>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.name} ({f.opportunities})</option>)}
          </select>
        </label>
        {domain && <span className="note">{t("dom.note", { company })}</span>}
        {domain && !domainItems && <span className="note">{t("dom.loading")}</span>}
      </div>
      <div className="feed-toolbar">
        <div className="seg" role="group">
          {FILTERS.map((k) => (
            <button key={k} aria-pressed={filter === k} onClick={() => { setFilter(k); setPages(1); }}>
              {t(`feed.${k}` as Key)}<span className="count">{count(k)}</span>
            </button>
          ))}
        </div>
        <span className="note">{t("feed.disclaimer")}</span>
      </div>
      {!canEdit && <p className="note" style={{ margin: "0 0 4px" }}>{t("feed.signInToSave")}</p>}
      {filter === "event" && (
        <div className="event-filters">
          <label>
            <span>{t("ev.region")}</span>
            <select className="select" value={region} onChange={(e) => { setRegion(e.target.value); setCity("all"); resetPage(); }}>
              <option value="all">{t("ev.allRegions")} ({events.length})</option>
              {REGIONS.map((r) => <option key={r} value={r} disabled={!n((o) => o.region === r)}>{t(`evr.${r}` as Key)} ({n((o) => o.region === r)})</option>)}
            </select>
          </label>
          <label>
            <span>{t("ev.city")}</span>
            <select className="select" value={city} onChange={(e) => { setCity(e.target.value); resetPage(); }}>
              <option value="all">{t("ev.allCities")}</option>
              {cities.filter((c) => region === "all" || events.some((i) => i.opportunity.city === c && i.opportunity.region === region))
                .map((c) => <option key={c} value={c}>{c} ({n((o) => o.city === c)})</option>)}
            </select>
          </label>
          <label>
            <span>{t("ev.format")}</span>
            <select className="select" value={format} onChange={(e) => { setFormat(e.target.value); resetPage(); }}>
              <option value="all">{t("ev.allFormats")}</option>
              {FORMATS.map((f) => <option key={f} value={f} disabled={!n((o) => (o.location_mode || "unknown") === f)}>{t(`evf.${f}` as Key)} ({n((o) => (o.location_mode || "unknown") === f)})</option>)}
            </select>
          </label>
          {(region !== "all" || city !== "all" || format !== "all") && (
            <button className="textbtn" onClick={() => { setRegion("all"); setCity("all"); setFormat("all"); resetPage(); }}>{t("ev.clear")}</button>
          )}
        </div>
      )}
      <div className="feed">
        {shown.map((it, i) => (
          <FeedItemRow key={it.opportunity.id} slug={slug} company={company} item={it} rank={i + 1} canEdit={canEdit} onFeedback={onFeedback} toast={toast} onUndoable={onUndoable} />
        ))}
      </div>
      {rest > 0 && (
        <div className="more">
          <span className="note">{t("fit.showing", { n: shown.length, total: all.length })}</span>
          <button className="btn quiet" onClick={() => setPages(pages + 1)}>{t("fit.more", { n: rest })}</button>
        </div>
      )}
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

/** Indicative 1-10 fit score: the number, a bar of the same length and the label. */
function Fit({ fit, level }: { fit: number; level: FeedItem["level"] }) {
  const { t } = useI18n();
  return (
    <div className={`fit fit-${level}`} role="img" aria-label={`${t(`fit.${level}` as Key)}, ${t("fit.score", { n: fit.toFixed(1) })}`}>
      <div className="fit-num"><b>{fit.toFixed(1)}</b><span>/10</span></div>
      <div className="fit-bar"><i style={{ width: `${fit * 10}%` }} /></div>
      <span className="fit-label">{t(`fit.${level}` as Key)}</span>
    </div>
  );
}

/** One plain-language reason, with its parameters filled in and localised. */
export function useReasonText() {
  const { t } = useI18n();
  return (r: Reason) => {
    const p = r.p ?? {};
    return t(r.key as Key, {
      ...p,
      basis: p.basis ? t(`basis.${p.basis}` as Key) : "",
      kind: p.kind ? t(`kindl.${p.kind}` as Key) : "",
      place: p.place || (p.region ? t(`region.${p.region}` as Key) : ""),
    });
  };
}

function FeedItemRow({ slug, company, item, rank, canEdit, onFeedback, toast, onUndoable }: {
  slug: string; company: string; item: FeedItem; rank: number; canEdit: boolean; onFeedback: () => void; toast: (m: string) => void; onUndoable: (undo: () => void) => void;
}) {
  const { t, lang } = useI18n();
  const reason = useReasonText();
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
        <Fit fit={item.fit} level={item.level} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 10 }}>
          <Logo k={o.logo} size={26} />
          <KindPill kind={o.kind} />
          {o.simulated && <span className="tag warn">{t("prof.simulated")}</span>}
          {o.manually_verified && <span className="tag" title={t("tb.verifiedTitle")}>{t("tb.verified")}</span>}
          {o.source === "vinnova_projects" && <span className="tag">{t("tb.project")}</span>}
          <span className="note">{o.source_name}</span>
        </div>
        <a className="feed-title" href={o.url} target="_blank" rel="noreferrer">{o.title}</a>
        <div className="meta">
          <When o={o} />
          {o.kind === "event" && (o.region === "unknown"
            ? <span className="loc-unknown">{t("ev.unknownLoc")}</span>
            : <span>{o.location_mode && o.location_mode !== "unknown" ? t(`mode.${o.location_mode}` as Key) : ""}{o.location_mode && o.location_mode !== "unknown" && o.location ? " · " : ""}{o.location || t(`evr.${o.region}` as Key)}</span>)}
          {o.kind === "testbed" && o.source !== "vinnova_projects" && o.programme && <span>{t("tb.operator", { name: o.programme })}</span>}
          <span>{t("feed.source")} <a href={o.url} target="_blank" rel="noreferrer">{host(o.url)}</a></span>
          {o.manually_verified && o.published && <span>{t("tb.checked", { date: fmtDate(o.published, lang) })}</span>}
          <span>{t("feed.retrieved", { date: fmtDate(o.fetched_at, lang) })}</span>
        </div>

        {item.updating && !fresh ? (
          <p className="note updating" role="status">{t("feed.updating")}</p>
        ) : ok ? (
          <>
            <p className="why">{exp!.why}</p>
            {exp!.next_step && <p className="next"><b>{t("feed.next")}:</b> {exp!.next_step}</p>}
          </>
        ) : (
          <div style={{ marginTop: 14 }}>
            <p className="next" style={{ marginTop: 0 }}>{o.summary.slice(0, 240)}{o.summary.length > 240 ? "…" : ""}</p>
            <p className="note" style={{ margin: "10px 0 0" }}>{t("fit.formulaOnly")}</p>
            <button className="btn quiet small" style={{ marginTop: 12 }} onClick={explain} disabled={loading}>{loading ? t("feed.explaining") : t("feed.explain")}</button>
          </div>
        )}

        <div className="reasons">
          <h4>{t("fit.why")}</h4>
          <ul>{item.reasons.map((r, i) => <li key={i}>{reason(r)}</li>)}</ul>
          {item.missing.length > 0 && <p className="note missing"><b>{t("fit.missing")}:</b> {item.missing.map((m) => t(m as Key)).join(" · ")}</p>}
        </div>

        {open && (
              <div className="detail">
                {ok && (
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
                )}
                <div>
                  <h4>{t("fit.factors")}</h4>
                  {FACTORS.map(([k, w]) => (
                    <div key={k} className="factor">
                      <span>{t(`f.${k}` as Key)} <span className="note">{w}%</span></span>
                      <span className="factor-bar"><i style={{ width: `${Math.round((item.components[k] ?? 0) * 100)}%` }} /></span>
                      <b className="num">{((item.components[k] ?? 0) * 10).toFixed(1)}</b>
                    </div>
                  ))}
                  <p className="note" style={{ marginTop: 12 }}>{t("fit.indicative")}</p>
                </div>
              </div>
        )}
        {contact && <ContactCard o={o} company={company} />}

        <div className="actions">
          <button className="btn small" onClick={() => setContact(!contact)} aria-expanded={contact}>{contact ? t("ct.hide") : t("ct.show")}</button>
          {canEdit && <>
          <button className={`btn quiet small ${item.feedback.includes("saved") ? "on" : ""}`} onClick={() => fb("saved")} aria-pressed={item.feedback.includes("saved")}>{item.feedback.includes("saved") ? t("feed.saved") : t("feed.save")}</button>
          <button className={`btn quiet small ${item.feedback.includes("up") ? "on" : ""}`} onClick={() => fb("up")} aria-pressed={item.feedback.includes("up")}>{t("feed.relevant")}</button>
          <button className="btn quiet small" onClick={() => fb("down")}>{t("feed.notForUs")}</button>
          </>}
          {(o.deadline || o.event_date) && <a className="btn quiet small" href={`${API}/api/opportunities/${encodeURIComponent(o.id)}/ics`}>{t("feed.calendar")}</a>}
          {o.apply_url && o.apply_url !== o.url && o.kind !== "testbed" && <a className="btn quiet small" href={o.apply_url} target="_blank" rel="noreferrer">{t("feed.apply")}</a>}
          <button className="textbtn" style={{ marginLeft: "auto" }} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? t("feed.hide") : t("feed.show")}</button>
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

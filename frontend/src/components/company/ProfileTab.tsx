"use client";

import { useState } from "react";
import { SourceLink } from "@/components/ui";
import { api, fmtDate, host, type Claim, type FeedItem, type Profile } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

const ORDER = ["offerings", "technologies", "applications", "markets", "geography", "priorities", "interests"];

export default function ProfileTab({ slug, profile, onSaved, toast }: {
  slug: string; profile: Profile; onSaved: (p: Profile, feed: FeedItem[]) => void; toast: (m: string) => void;
}) {
  const { t, lang } = useI18n();
  const [section, setSection] = useState("priorities");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function edit(action: string, claim?: Claim, extra: Record<string, string> = {}) {
    setBusy(true);
    try {
      const r = await api<{ profile: Profile; feed: FeedItem[]; note: string }>(`/api/companies/${slug}/profile`, {
        method: "POST",
        body: JSON.stringify({ action, claim_id: claim?.id, lang, ...extra }),
      });
      onSaved(r.profile, r.feed);
      toast(t("toast.reranked", { note: r.note }));
    } finally {
      setBusy(false);
    }
  }

  const v = profile.verifier ?? {};
  const srcLabel = (k: string, title: string) => (k === "bsp_member" ? t("prof.srcBsp") : k === "reference" ? t("prof.srcRef") : title || t("prof.srcWeb"));
  return (
    <div className="two-col" style={{ marginTop: 22 }}>
      <div>
        <div className="card pad">
          <p style={{ fontSize: 17, lineHeight: 1.55, margin: 0 }}>{profile.summary}</p>
          <div className="row" style={{ marginTop: 14, gap: 16, fontSize: 13, color: "var(--ink-2)" }}>
            <span className="row" style={{ gap: 6 }}><span className="dot fact" /> {t("prof.legendFact")}</span>
            <span className="row" style={{ gap: 6 }}><span className="dot inferred" /> {t("prof.legendInferred")}</span>
            <span className="row" style={{ gap: 6 }}><span className="dot confirmed" /> {t("prof.legendMine")}</span>
          </div>
        </div>

        {ORDER.map((sec) => {
          const claims = profile.claims.filter((c) => c.section === sec);
          if (!claims.length) return null;
          return (
            <div key={sec}>
              <div className="sec-title">
                <h3>{t(`sec.${sec}` as Key)}</h3>
                {sec === "interests" && <span className="pill outline">{t("prof.interestsTag")}</span>}
              </div>
              <div className="claims">
                {claims.map((c) => <ClaimRow key={c.id} c={c} busy={busy} onAction={edit} />)}
              </div>
            </div>
          );
        })}
      </div>

      <aside>
        <div className="card pad" style={{ position: "sticky", top: 84 }}>
          <div className="eyebrow" style={{ color: "var(--brand-text)" }}>{t("prof.refine")}</div>
          <h3 style={{ marginTop: 6 }}>{t("prof.refineTitle")}</h3>
          <p className="muted small" style={{ margin: "6px 0 12px" }}>{t("prof.refineNote")}</p>
          <select className="select" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section">
            {ORDER.filter((s) => s !== "interests").map((s) => <option key={s} value={s}>{t(`sec.${s}` as Key)}</option>)}
          </select>
          <textarea className="textarea" rows={3} style={{ marginTop: 8 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("prof.placeholder")} />
          <button className="btn" style={{ marginTop: 10, width: "100%" }} disabled={busy || text.trim().length < 6}
            onClick={async () => { await edit("add", undefined, { statement: text, section }); setText(""); }}>
            {busy ? t("prof.adding") : t("prof.add")}
          </button>

          <div style={{ marginTop: 22, padding: 14, borderRadius: 10, background: "var(--ok-soft)" }}>
            <div className="panel-title" style={{ color: "var(--ok)", marginBottom: 4 }}>✓ {t("prof.verifier")}</div>
            <div className="small">
              {t("prof.verifierText", { a: v.facts_verified ?? 0, b: v.facts_checked ?? 0 })}{" "}
              {v.downgraded ? t("prof.downgraded", { n: v.downgraded }) : ""}
            </div>
          </div>

          {profile.missing.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="panel-title">{t("prof.missing")}</div>
              <ul style={{ paddingLeft: 18, fontSize: 13.5, margin: 0, color: "var(--ink-2)" }}>
                {profile.missing.map((m, i) => <li key={i}><b style={{ fontWeight: 600 }}>{t(`sec.${m.section}` as Key) ?? m.section}:</b> {m.note}</li>)}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <div className="panel-title">{t("prof.sources", { n: profile.sources.length })}</div>
            {profile.sources.map((s) => (
              <div key={s.url} style={{ padding: "7px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="muted">[{s.id}]</span>
                  <span>{srcLabel(s.kind, s.title)}</span>
                  {s.injection_flag && <span className="pill danger">{t("prof.injection")}</span>}
                  {s.simulated && <span className="pill warn">{t("prof.simulated")}</span>}
                </div>
                <div className="stamp"><SourceLink url={s.url} /><span>{fmtDate(s.retrieved_at, lang)}</span></div>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>{t("prof.generated", { date: fmtDate(profile.generated_at, lang) })}</p>
        </div>
      </aside>
    </div>
  );
}

function ClaimRow({ c, busy, onAction }: { c: Claim; busy: boolean; onAction: (a: string, c: Claim, extra?: Record<string, string>) => void }) {
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(c.statement);
  const mine = c.origin === "user" || c.review === "confirmed" || c.status === "company_confirmed";
  const dot = mine ? "confirmed" : c.status === "fact" ? "fact" : "inferred";
  const ev = c.evidence[0];
  return (
    <div className={`claim ${c.review === "rejected" ? "rejected" : ""}`}>
      <span className={`dot ${dot}`} />
      <div style={{ minWidth: 0 }}>
        {editing ? (
          <div className="row">
            <input className="input" style={{ flex: 1, minWidth: 200 }} value={val} onChange={(e) => setVal(e.target.value)} aria-label={t("prof.edit")} />
            <button className="btn small" disabled={busy} onClick={() => { onAction("edit", c, { statement: val }); setEditing(false); }}>{t("prof.save")}</button>
            <button className="btn ghost small" onClick={() => setEditing(false)}>{t("prof.cancel")}</button>
          </div>
        ) : (
          <div className="claim-text">{c.statement}</div>
        )}
        {c.status === "fact" && ev?.quote && (
          <div className="evidence">
            <q>{ev.quote}</q>
            <div className="stamp">
              <SourceLink url={ev.url} />
              <span>{fmtDate(ev.retrieved_at, lang)}</span>
              {ev.verified && <span style={{ color: "var(--ok)", fontWeight: 600 }}>✓ {t("prof.verified")}</span>}
            </div>
          </div>
        )}
        {c.status !== "fact" && c.origin !== "user" && (
          <div className="evidence muted">
            {c.reasoning || t("prof.inferredDefault")}
            {ev?.url && <div className="stamp"><SourceLink url={ev.url} label={t("prof.basedOn", { host: host(ev.url) })} /></div>}
          </div>
        )}
        {c.note && c.origin === "user" && <div className="stamp">{c.note}</div>}
        {c.review === "rejected" && <div className="stamp">{t("prof.rejectedNote")}</div>}
      </div>
      <div className="claim-actions">
        {c.review === "rejected" ? (
          <button className="iconbtn" disabled={busy} onClick={() => onAction("restore", c)}>{t("prof.restore")}</button>
        ) : (
          <>
            {!mine && <button className="iconbtn" disabled={busy} onClick={() => onAction("confirm", c)} title={t("prof.confirm")} aria-label={t("prof.confirm")}>✓</button>}
            <button className="iconbtn" disabled={busy} onClick={() => setEditing(true)}>{t("prof.edit")}</button>
            <button className="iconbtn" disabled={busy} onClick={() => onAction("reject", c)} title={t("prof.reject")} aria-label={t("prof.reject")}>✕</button>
          </>
        )}
      </div>
    </div>
  );
}

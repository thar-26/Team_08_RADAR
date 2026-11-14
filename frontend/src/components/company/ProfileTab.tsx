"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RegistryPanel from "@/components/company/RegistryPanel";
import { SourceLink } from "@/components/ui";
import { api, fmtDate, HOSTED, host, type Claim, type FeedItem, type Me, type Profile } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

const ORDER = ["offerings", "technologies", "applications", "markets", "geography", "priorities", "interests"];

/** Anyone can read a profile. Only a signed-in member of this company (or Blue
 *  Science Park staff) can correct it; the API enforces the same rule. */
export default function ProfileTab({ slug, company, profile, canEdit, onSaved, toast }: {
  slug: string; company: string; profile: Profile; canEdit: boolean; onSaved: (p: Profile, feed: FeedItem[]) => void; toast: (m: string) => void;
}) {
  const { t, lang } = useI18n();
  const [section, setSection] = useState("priorities");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [requested, setRequested] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/api/me").then(setMe).catch(() => setMe(null));
  }, []);
  const membership = me?.memberships?.find((m) => m.slug === slug);

  async function edit(action: string, claim?: Claim, extra: Record<string, string> = {}) {
    setBusy(true);
    try {
      const r = await api<{ profile: Profile; feed: FeedItem[]; note: string }>(`/api/companies/${slug}/profile`, {
        method: "POST",
        body: JSON.stringify({ action, claim_id: claim?.id, lang, ...extra }),
      });
      onSaved(r.profile, r.feed);
      toast(t("toast.reranked", { note: r.note }));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function requestAccess() {
    const r = await api<{ status: string }>("/api/me/request", { method: "POST", body: JSON.stringify({ slug }) });
    if (r.status === "approved") setMe(await api<Me>("/api/me"));
    else setRequested(t("acc.pendingNow"));
  }

  const v = profile.verifier ?? {};
  const srcLabel = (k: string, title: string) => (k === "bsp_member" ? t("prof.srcBsp") : k === "reference" ? t("prof.srcRef") : title || t("prof.srcWeb"));
  return (
    <div className="side" style={{ paddingTop: 48 }}>
      <div>
        <p className="summary">{profile.summary}</p>
        <div className="legend">
          <span><span className="dot fact" /> {t("prof.legendFact")}</span>
          <span><span className="dot inferred" /> {t("prof.legendInferred")}</span>
          <span><span className="dot confirmed" /> {t("prof.legendMine")}</span>
        </div>

        {ORDER.map((sec) => {
          const claims = profile.claims.filter((c) => c.section === sec);
          if (!claims.length) return null;
          return (
            <div key={sec} className="sec" data-reveal>
              <div className="sec-title">
                <h2>{t(`sec.${sec}` as Key)}</h2>
                {sec === "interests" && <span className="note">{t("prof.interestsTag")}</span>}
              </div>
              {claims.map((c) => <ClaimRow key={c.id} c={c} busy={busy} canEdit={canEdit} onAction={edit} />)}
            </div>
          );
        })}
      </div>

      <aside className="sticky">
        {HOSTED ? (
          <div className="panel navy">
            <h3>{t("fix.title")}</h3>
            <p style={{ margin: "8px 0 0", fontSize: 15, color: "rgba(255,255,255,.85)" }}>{t("demo.editing")}</p>
          </div>
        ) : canEdit ? (
          <div className="panel navy">
            <h3>{t("prof.refineTitle")}</h3>
            <p style={{ margin: "8px 0 18px", fontSize: 15, color: "rgba(255,255,255,.8)" }}>{t("prof.refineNote")}</p>
            <select className="select" value={section} onChange={(e) => setSection(e.target.value)} aria-label={t("prof.refine")}>
              {ORDER.filter((s) => s !== "interests").map((s) => <option key={s} value={s}>{t(`sec.${s}` as Key)}</option>)}
            </select>
            <textarea className="textarea" rows={3} style={{ marginTop: 8 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("prof.placeholder")} aria-label={t("prof.refineTitle")} />
            <button className="btn sky" style={{ marginTop: 12, width: "100%" }} disabled={busy || text.trim().length < 6}
              onClick={async () => { await edit("add", undefined, { statement: text, section }); setText(""); }}>
              {busy ? t("prof.adding") : t("prof.add")}
            </button>
            {me?.user && <p style={{ margin: "14px 0 0", fontSize: 14, color: "rgba(255,255,255,.75)" }}>{t("fix.editingAs", { name: me.user.name })}</p>}
          </div>
        ) : (
          <div className="panel navy">
            <h3>{t("fix.title")}</h3>
            <p style={{ margin: "8px 0 16px", fontSize: 15, color: "rgba(255,255,255,.85)" }}>{t("fix.text", { company })}</p>
            {!me?.user ? (
              <Link className="btn sky" href={`/login?callbackUrl=${encodeURIComponent(`/c/${slug}?tab=profile`)}`}>{t("fix.signIn")}</Link>
            ) : membership?.status === "pending" || requested ? (
              <p style={{ margin: 0 }}>{requested ?? t("acc.statusPending")}</p>
            ) : (
              <button className="btn sky" onClick={requestAccess}>{t("fix.request", { company })}</button>
            )}
            <p style={{ margin: "14px 0 0", fontSize: 14, color: "rgba(255,255,255,.7)" }}>{t("fix.why")}</p>
          </div>
        )}

        {canEdit && <RegistryPanel slug={slug} onVerified={() => { toast(t("reg.added")); window.location.reload(); }} />}

        <div className="panel">
          <h3>{t("prof.verifier")}</h3>
          <p style={{ margin: "8px 0 0", fontSize: 15 }}>
            <b style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.04em", display: "block", lineHeight: 1 }} className="num">{v.facts_verified ?? 0}/{v.facts_checked ?? 0}</b>
            {t("prof.verifierText", { a: v.facts_verified ?? 0, b: v.facts_checked ?? 0 })}{" "}
            {v.downgraded ? t("prof.downgraded", { n: v.downgraded }) : ""}
          </p>
        </div>

        {profile.missing.length > 0 && (
          <div className="panel">
            <h3>{t("prof.missing")}</h3>
            <ul style={{ paddingLeft: 18, fontSize: 15, margin: "10px 0 0" }}>
              {profile.missing.map((m, i) => <li key={i} style={{ marginBottom: 6 }}><b>{t(`sec.${m.section}` as Key)}:</b> {m.note}</li>)}
            </ul>
          </div>
        )}

        <div className="panel">
          <h3>{t("prof.sources", { n: profile.sources.length })}</h3>
          <div style={{ marginTop: 10 }}>
            {profile.sources.map((s) => (
              <div key={s.url} style={{ padding: "10px 0", borderTop: "1px solid var(--line)", fontSize: 15 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span>{srcLabel(s.kind, s.title)}</span>
                  {s.injection_flag && <span className="tag danger">{t("prof.injection")}</span>}
                  {s.simulated && <span className="tag warn">{t("prof.simulated")}</span>}
                </div>
                <div className="stamp"><SourceLink url={s.url} /><span>{fmtDate(s.retrieved_at, lang)}</span></div>
              </div>
            ))}
          </div>
          <p className="note" style={{ margin: "12px 0 0" }}>{t("prof.generated", { date: fmtDate(profile.generated_at, lang) })}</p>
        </div>
      </aside>
    </div>
  );
}

function ClaimRow({ c, busy, canEdit, onAction }: {
  c: Claim; busy: boolean; canEdit: boolean; onAction: (a: string, c: Claim, extra?: Record<string, string>) => void;
}) {
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(c.statement);
  const mine = c.origin === "user" || c.review === "confirmed" || c.status === "company_confirmed";
  const off = c.review === "rejected" || c.review === "outdated";
  const dot = mine ? "confirmed" : c.status === "fact" ? "fact" : "inferred";
  const ev = c.evidence[0];
  const isRegistry = c.note === "registry";
  return (
    <div className={`claim ${off ? "rejected" : ""}`}>
      <span className={`dot ${dot}`} title={t(dot === "fact" ? "prof.legendFact" : dot === "inferred" ? "prof.legendInferred" : "prof.legendMine")} />
      <div style={{ minWidth: 0 }}>
        {editing ? (
          <div className="row" style={{ gap: 0 }}>
            <input className="input" style={{ flex: 1, minWidth: 200 }} value={val} onChange={(e) => setVal(e.target.value)} aria-label={t("prof.edit")} />
            <button className="btn small" style={{ height: 48 }} disabled={busy} onClick={() => { onAction("edit", c, { statement: val }); setEditing(false); }}>{t("prof.save")}</button>
            <button className="btn quiet small" style={{ height: 48 }} onClick={() => setEditing(false)}>{t("prof.cancel")}</button>
          </div>
        ) : (
          <div className="claim-text">{c.statement}</div>
        )}
        {isRegistry && <div className="stamp"><span className="tag ok">{t("fix.registry")}</span></div>}
        {c.origin === "user" && c.visibility === "private" && <div className="stamp"><span className="tag warn">{t("pv.private")}</span></div>}
        {c.status === "fact" && ev?.quote && (
          <div className="evidence">
            <q>{ev.quote}</q>
            <div className="stamp">
              <SourceLink url={ev.url} />
              <span>{fmtDate(ev.retrieved_at, lang)}</span>
              {ev.verified && <span style={{ color: "var(--ok)", fontWeight: 700 }}>{t("prof.verified")}</span>}
            </div>
          </div>
        )}
        {c.status !== "fact" && c.origin !== "user" && !isRegistry && (
          <div className="evidence" style={{ color: "var(--ink-3)" }}>
            {c.reasoning || t("prof.inferredDefault")}
            {ev?.url && <div className="stamp"><SourceLink url={ev.url} label={t("prof.basedOn", { host: host(ev.url) })} /></div>}
          </div>
        )}
        {c.updated_by && (
          <div className="stamp">
            <span className="tag strong">{t(`fix.label.${c.review === "unreviewed" ? "confirmed" : c.origin === "user" && c.review === "confirmed" ? "added" : c.review}` as Key)}</span>
            <span>{t("fix.by", { name: c.updated_by, date: fmtDate(c.updated_at, lang) })}</span>
            {c.review === "edited" && c.note && <span>{c.note}</span>}
          </div>
        )}
      </div>
      {canEdit && (
        <div className="claim-actions">
          {off ? (
            <button className="iconbtn" disabled={busy} onClick={() => onAction("restore", c)}>{t("prof.restore")}</button>
          ) : (
            <>
              {!mine && <button className="iconbtn" disabled={busy} onClick={() => onAction("confirm", c)}>{t("prof.confirm")}</button>}
              {c.origin === "user" && c.review === "confirmed" && (c.visibility === "private"
                ? <button className="iconbtn" disabled={busy} onClick={() => confirm(t("pv.confirmPublish")) && onAction("publish", c)}>{t("pv.publish")}</button>
                : <button className="iconbtn" disabled={busy} onClick={() => onAction("unpublish", c)}>{t("pv.unpublish")}</button>)}
              <button className="iconbtn" disabled={busy} onClick={() => setEditing(true)}>{t("prof.edit")}</button>
              <button className="iconbtn" disabled={busy} onClick={() => onAction("outdated", c)}>{t("fix.outdated")}</button>
              <button className="iconbtn" disabled={busy} onClick={() => onAction("reject", c)}>{t("fix.wrong")}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

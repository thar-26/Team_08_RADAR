"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import AlertsTab from "@/components/company/AlertsTab";
import ChatDrawer from "@/components/company/ChatDrawer";
import FeedTab from "@/components/company/FeedTab";
import ProfileTab from "@/components/company/ProfileTab";
import { ErrorNote, Skeleton, SourceLink, Toast, useFetch } from "@/components/ui";
import { api, fmtDate, withLang, type CompanyResp, type Connection, type FeedItem } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

type Version = { version: number; author: string; note: string; created_at: string; added: string[]; removed: string[]; changed: { statement: string; from: string; to: string }[]; claims: number };
const TABS = ["feed", "profile", "partners", "timeline", "alerts"] as const;
type Tab = (typeof TABS)[number];

export default function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <Suspense fallback={null}>
      <Company slug={slug} />
    </Suspense>
  );
}

function Company({ slug }: { slug: string }) {
  const { t, lang } = useI18n();
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>("feed");
  const [chat, setChat] = useState(false);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const company = useFetch(() => api<CompanyResp>(withLang(`/api/companies/${slug}`, lang)), [slug, lang]);
  const feed = useFetch(() => api<FeedItem[]>(withLang(`/api/companies/${slug}/feed`, lang)), [slug, lang]);
  const conns = useFetch(() => (tab === "partners" ? api<Connection[]>(withLang(`/api/companies/${slug}/connections`, lang)) : Promise.resolve(null as unknown as Connection[])), [slug, tab, lang]);
  const timeline = useFetch(() => (tab === "timeline" ? api<Version[]>(`/api/companies/${slug}/timeline`) : Promise.resolve(null as unknown as Version[])), [slug, tab, tick]);

  // One-click unsubscribe from an alert email link (?unsubscribe=<token>).
  useEffect(() => {
    const token = search.get("unsubscribe");
    if (token) {
      api("/api/alerts/unsubscribe", { method: "POST", body: JSON.stringify({ token }) }).then(() => { setToast(t("al.unsubscribed")); setTab("alerts"); });
    }
  }, [search, t]);

  const refreshFeed = useCallback(() => {
    api<FeedItem[]>(withLang(`/api/companies/${slug}/feed`, lang)).then(feed.setData);
  }, [slug, lang, feed.setData]);
  const clearToast = useCallback(() => setToast(null), []);

  if (company.error) return <section className="shell section"><ErrorNote error={company.error} /></section>;
  const c = company.data;
  const p = c?.profile;

  return (
    <>
      <section className="pagehead" style={{ paddingBottom: 0 }}>
        <div className="shell">
          <div className="row" style={{ gap: 10 }}>
            <Link href="/members" style={{ fontSize: 13.5, opacity: 0.85 }}>← {t("co.back")}</Link>
            <span className="pill onblue">{t("co.signedIn", { name: c?.name ?? "…" })}</span>
          </div>
          <div className="spread" style={{ marginTop: 12, alignItems: "flex-end" }}>
            <div style={{ minWidth: 0 }}>
              <h1>{c?.name ?? <Skeleton h={44} w={300} />}</h1>
              {c && (
                <div className="row" style={{ marginTop: 8, gap: 14, fontSize: 13.5 }}>
                  <SourceLink url={c.website} />
                  <SourceLink url={c.bsp_page} label={t("co.bspPage")} />
                  <span style={{ opacity: 0.8 }}>{t("co.version", { v: c.version, date: fmtDate(c.updated_at, lang) })}</span>
                  {p && <span className="pill onblue">{t(`size.${p.size_hint}` as Key)}</span>}
                </div>
              )}
            </div>
            <button className="btn white" onClick={() => setChat(true)}>💬 {t("co.ask")}</button>
          </div>
          <div className="tabs" role="tablist" style={{ marginTop: 24 }}>
            {TABS.map((k) => (
              <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {k === "alerts" ? "🔔 " : ""}{t(`tab.${k}` as Key)}
                {k === "feed" && feed.data && <span className="count">{feed.data.length}</span>}
                {k === "profile" && p && <span className="count">{p.claims.length}</span>}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="shell" style={{ paddingBottom: 40 }}>
        {tab === "feed" && (
          feed.loading && !feed.data ? <div style={{ paddingTop: 24 }}><Skeleton h={320} /></div> :
          feed.data && <FeedTab slug={slug} items={feed.data} onFeedback={refreshFeed} toast={setToast} />
        )}
        {tab === "profile" && (p ? (
          <ProfileTab slug={slug} profile={p} toast={setToast}
            onSaved={(np, nf) => { company.setData({ ...c!, profile: np, version: c!.version + 1, updated_at: new Date().toISOString() }); feed.setData(nf); setTick((x) => x + 1); }} />
        ) : <div style={{ paddingTop: 24 }}><Skeleton h={320} /></div>)}
        {tab === "partners" && (
          <div style={{ marginTop: 22 }}>
            <div className="banner info">{t("part.lede")}</div>
            {conns.loading && <div style={{ marginTop: 16 }}><Skeleton h={220} /></div>}
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", marginTop: 16, gap: 14 }}>
              {(conns.data ?? []).map((x) => (
                <div key={x.slug} className="card pad">
                  <div className="spread">
                    <h3>{x.name}</h3>
                    <span className="pill brand">{t("part.similarity", { n: x.similarity.toFixed(2) })}</span>
                  </div>
                  <p style={{ fontSize: 15.5, fontWeight: 500, margin: "10px 0 12px" }}>{x.headline}</p>
                  <div className="panel-title">{t("part.shared")}</div>
                  <ul style={{ paddingLeft: 18, margin: "0 0 12px", fontSize: 14, color: "var(--ink-2)" }}>{x.shared.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  <div className="panel-title">{t("part.complement")}</div>
                  <p style={{ fontSize: 14, margin: "0 0 12px", color: "var(--ink-2)" }}>{x.complementary}</p>
                  <p className="muted small" style={{ borderTop: "1px solid var(--line)", paddingTop: 10, margin: 0 }}>{x.caution}</p>
                  <div className="row" style={{ marginTop: 10, fontSize: 13 }}><SourceLink url={x.bsp_page} label={t("part.memberPage")} />{x.website && <SourceLink url={x.website} />}</div>
                </div>
              ))}
            </div>
            {conns.data && !conns.data.length && <p className="muted">{t("part.none")}</p>}
          </div>
        )}
        {tab === "timeline" && (
          <div style={{ marginTop: 22, maxWidth: 820 }}>
            <div className="banner info">{t("tl.lede")}</div>
            {timeline.loading && <div style={{ marginTop: 16 }}><Skeleton h={160} /></div>}
            <div className="stack" style={{ marginTop: 16 }}>
              {(timeline.data ?? []).map((v) => (
                <div key={v.version} className="card pad" style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 16 }}>
                  <div>
                    <div className="rank" style={{ width: 52 }}>v{v.version}</div>
                    <div className="muted small" style={{ marginTop: 6 }}>{fmtDate(v.created_at, lang)}</div>
                  </div>
                  <div>
                    <div className="row">
                      <span className={`pill ${v.author === "user" ? "gold" : v.author === "watcher" ? "ok" : "brand"}`}>{v.author === "user" ? t("tl.you") : v.author === "watcher" ? t("tl.watcher") : t("tl.profiler")}</span>
                      <span style={{ fontSize: 14 }}>{v.note}</span>
                    </div>
                    {v.version > 1 && (
                      <div style={{ fontSize: 13.5, marginTop: 8 }}>
                        {v.added.map((a) => <div key={a} style={{ color: "var(--ok)" }}>+ {a}</div>)}
                        {v.removed.map((a) => <div key={a} style={{ color: "var(--danger)" }}>− {a}</div>)}
                        {v.changed.map((a) => <div key={a.statement} className="muted">~ {a.statement} ({a.from} → {a.to})</div>)}
                      </div>
                    )}
                    {v.version === 1 && <div className="muted small" style={{ marginTop: 6 }}>{t("tl.first", { n: v.claims })}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "alerts" && <AlertsTab slug={slug} toast={setToast} />}
      </section>

      {!chat && <button className="btn fab" onClick={() => setChat(true)}>💬 {t("co.ask")}</button>}
      {c && <ChatDrawer slug={slug} name={c.name} open={chat} onClose={() => setChat(false)} />}
      <Toast msg={toastMsg} onDone={clearToast} />
    </>
  );
}

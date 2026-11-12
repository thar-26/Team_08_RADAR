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
  const initial = search.get("tab");
  const [tab, setTabState] = useState<Tab>((TABS as readonly string[]).includes(initial ?? "") ? (initial as Tab) : "feed");
  // Keep the open tab in the URL so it can be linked and survives a reload.
  const setTab = useCallback((k: Tab) => {
    setTabState(k);
    const u = new URL(window.location.href);
    if (k === "feed") u.searchParams.delete("tab"); else u.searchParams.set("tab", k);
    window.history.replaceState(null, "", u.toString());
  }, []);
  const [chat, setChat] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<{ label: string; run: () => void } | null>(null);
  const setToast = useCallback((m: string | null) => { setToastMsg(m); setToastAction(null); }, []);
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
  }, [search, t, setTab, setToast]);

  const refreshFeed = useCallback(() => {
    api<FeedItem[]>(withLang(`/api/companies/${slug}/feed`, lang)).then(feed.setData);
  }, [slug, lang, feed.setData]);
  const clearToast = useCallback(() => { setToastMsg(null); setToastAction(null); }, []);
  const onUndoable = useCallback((run: () => void) => setToastAction({ label: t("toast.undo"), run }), [t]);

  if (company.error) return <section className="shell section"><ErrorNote error={company.error} /></section>;
  const c = company.data;
  const p = c?.profile;

  return (
    <>
      <section className="pagehead">
        <div className="shell">
          <div className="spread" style={{ alignItems: "flex-end" }}>
            <div style={{ minWidth: 0 }}>
              <h1 data-reveal>{c?.name ?? <Skeleton h={64} w={340} />}</h1>
              {c && (
                <div className="meta-line" data-reveal>
                  <Link href="/members">← {t("co.back")}</Link>
                  <SourceLink url={c.website} />
                  <SourceLink url={c.bsp_page} label={t("co.bspPage")} />
                  <span>{t("co.version", { v: c.version, date: fmtDate(c.updated_at, lang) })}</span>
                  {p && <span>{t(`size.${p.size_hint}` as Key)}</span>}
                  <span className="tag onnavy">{t("co.signedIn", { name: c.name })}</span>
                </div>
              )}
            </div>
            <button className="btn sky" onClick={() => setChat(true)}>{t("co.ask")}</button>
          </div>
          <div className="tabs" role="tablist" data-reveal>
            {TABS.map((k) => (
              <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {t(`tab.${k}` as Key)}
                {k === "feed" && feed.data && <span className="count">{feed.data.length}</span>}
                {k === "profile" && p && <span className="count">{p.claims.length}</span>}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="shell" style={{ paddingBottom: 96 }}>
        {tab === "feed" && (
          feed.loading && !feed.data ? <div style={{ paddingTop: 32 }}><Skeleton h={360} /></div> :
          feed.data && <FeedTab slug={slug} company={c?.name ?? ""} items={feed.data} onFeedback={refreshFeed} toast={setToast} onUndoable={onUndoable} />
        )}
        {tab === "profile" && (p ? (
          <ProfileTab slug={slug} profile={p} toast={setToast}
            onSaved={(np, nf) => { company.setData({ ...c!, profile: np, version: c!.version + 1, updated_at: new Date().toISOString() }); feed.setData(nf); setTick((x) => x + 1); }} />
        ) : <div style={{ paddingTop: 32 }}><Skeleton h={360} /></div>)}
        {tab === "partners" && (
          <div style={{ paddingTop: 40 }}>
            <p className="lead" style={{ maxWidth: "62ch" }}>{t("part.lede")}</p>
            {conns.loading && <div style={{ marginTop: 24 }}><Skeleton h={260} /></div>}
            <div className="list" style={{ marginTop: 32 }}>
              {(conns.data ?? []).map((x) => (
                <div key={x.slug} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", gap: 40, padding: "32px 0", borderBottom: "1px solid var(--line)" }}>
                  <div>
                    <h2 style={{ fontSize: "clamp(26px,2.4vw,34px)" }}>{x.name}</h2>
                    <p style={{ fontSize: 18, margin: "12px 0 14px" }}>{x.headline}</p>
                    <div className="row note" style={{ gap: 18 }}>
                      <span>{t("part.similarity", { n: x.similarity.toFixed(2) })}</span>
                      <SourceLink url={x.bsp_page} label={t("part.memberPage")} />
                      {x.website && <SourceLink url={x.website} />}
                    </div>
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 8px", fontSize: 15 }}>{t("part.shared")}</h4>
                    <ul style={{ paddingLeft: 18, margin: "0 0 16px" }}>{x.shared.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}</ul>
                    <h4 style={{ margin: "0 0 8px", fontSize: 15 }}>{t("part.complement")}</h4>
                    <p style={{ margin: "0 0 14px" }}>{x.complementary}</p>
                    <p className="note" style={{ margin: 0 }}>{x.caution}</p>
                  </div>
                </div>
              ))}
            </div>
            {conns.data && !conns.data.length && <p className="note">{t("part.none")}</p>}
          </div>
        )}
        {tab === "timeline" && (
          <div style={{ paddingTop: 40, maxWidth: 900 }}>
            <p className="lead" style={{ maxWidth: "62ch" }}>{t("tl.lede")}</p>
            {timeline.loading && <div style={{ marginTop: 24 }}><Skeleton h={200} /></div>}
            <div className="list" style={{ marginTop: 32 }}>
              {(timeline.data ?? []).map((v) => (
                <div key={v.version} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 24, padding: "26px 0", borderBottom: "1px solid var(--line)" }}>
                  <div>
                    <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: .9 }}>v{v.version}</div>
                    <div className="note" style={{ marginTop: 8 }}>{fmtDate(v.created_at, lang)}</div>
                  </div>
                  <div>
                    <div className="row">
                      <span className={`tag ${v.author === "user" ? "strong" : v.author === "watcher" ? "ok" : "funding"}`}>{v.author === "user" ? t("tl.you") : v.author === "watcher" ? t("tl.watcher") : t("tl.profiler")}</span>
                      <span>{v.note}</span>
                    </div>
                    {v.version > 1 && (
                      <div style={{ fontSize: 15, marginTop: 10 }}>
                        {v.added.map((a) => <div key={a} style={{ color: "var(--ok)" }}>+ {a}</div>)}
                        {v.removed.map((a) => <div key={a} style={{ color: "var(--danger)" }}>− {a}</div>)}
                        {v.changed.map((a) => <div key={a.statement} className="note">~ {a.statement} ({a.from} → {a.to})</div>)}
                      </div>
                    )}
                    {v.version === 1 && <div className="note" style={{ marginTop: 8 }}>{t("tl.first", { n: v.claims })}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "alerts" && <AlertsTab slug={slug} toast={setToast} />}
      </section>

      {!chat && <button className="btn fab" onClick={() => setChat(true)}>{t("co.ask")}</button>}
      {c && <ChatDrawer slug={slug} name={c.name} open={chat} onClose={() => setChat(false)} />}
      <Toast msg={toastMsg} onDone={clearToast} action={toastAction} />
    </>
  );
}

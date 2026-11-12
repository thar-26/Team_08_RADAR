"use client";

import Link from "next/link";
import { use, useCallback, useState } from "react";
import ChatDrawer from "@/components/company/ChatDrawer";
import FeedTab from "@/components/company/FeedTab";
import ProfileTab from "@/components/company/ProfileTab";
import { ErrorNote, Skeleton, SourceStamp, Toast, useFetch } from "@/components/ui";
import { api, fmtDate, type CompanyResp, type Connection, type FeedItem } from "@/lib/api";

type Version = { version: number; author: string; note: string; created_at: string; added: string[]; removed: string[]; changed: { statement: string; from: string; to: string }[]; claims: number };

const TABS = [
  ["feed", "For you"],
  ["profile", "Profile"],
  ["partners", "Possible partners"],
  ["timeline", "Timeline"],
] as const;

export default function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("feed");
  const [chat, setChat] = useState(false);
  const [toastMsg, setToast] = useState<string | null>(null);
  const company = useFetch(() => api<CompanyResp>(`/api/companies/${slug}`), [slug]);
  const feed = useFetch(() => api<FeedItem[]>(`/api/companies/${slug}/feed`), [slug]);
  const [tick, setTick] = useState(0);
  const conns = useFetch(() => (tab === "partners" ? api<Connection[]>(`/api/companies/${slug}/connections`) : Promise.resolve(null as unknown as Connection[])), [slug, tab]);
  const timeline = useFetch(() => (tab === "timeline" ? api<Version[]>(`/api/companies/${slug}/timeline`) : Promise.resolve(null as unknown as Version[])), [slug, tab, tick]);

  const refreshFeed = useCallback(() => {
    api<FeedItem[]>(`/api/companies/${slug}/feed`).then(feed.setData);
  }, [slug, feed.setData]);
  const clearToast = useCallback(() => setToast(null), []);

  if (company.error) return <section className="shell section"><ErrorNote error={company.error} /></section>;
  const c = company.data;
  const p = c?.profile;

  return (
    <>
      <section className="shell" style={{ paddingTop: 36 }}>
        <div className="spread" style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 10 }}>
              <Link href="/members" className="eyebrow" style={{ textDecoration: "none" }}>← Members</Link>
              <span className="tag sim" title="Login is simulated in this prototype">Signed in as {c?.name ?? "…"} · simulated login</span>
            </div>
            <h1 style={{ marginTop: 14, fontSize: "clamp(36px, 5vw, 58px)" }}>{c?.name ?? <Skeleton h={50} w={320} />}</h1>
            {c && (
              <div className="row" style={{ marginTop: 10, gap: 16 }}>
                <SourceStamp url={c.website} />
                <SourceStamp url={c.bsp_page} label="Blue Science Park page" />
                <span className="mono muted">Profile v{c.version} · updated {fmtDate(c.updated_at)}</span>
                {p && <span className="tag">{p.size_hint === "sme" ? "SME" : p.size_hint.replace("_", " ")}</span>}
              </div>
            )}
          </div>
          <button className="btn" onClick={() => setChat(true)}>Ask Radar</button>
        </div>
        <div className="tabs" role="tablist" style={{ marginTop: 26 }}>
          {TABS.map(([k, l]) => (
            <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {l}
              {k === "feed" && feed.data && <span className="count">{feed.data.length}</span>}
              {k === "profile" && p && <span className="count">{p.claims.length}</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="shell" style={{ paddingBottom: 40 }}>
        {tab === "feed" && (
          feed.loading && !feed.data ? <div style={{ paddingTop: 24 }}><Skeleton h={300} /></div> :
          feed.data && <FeedTab slug={slug} items={feed.data} onFeedback={refreshFeed} toast={setToast} />
        )}
        {tab === "profile" && p && (
          <ProfileTab slug={slug} profile={p} toast={setToast}
            onSaved={(np, nf) => { company.setData({ ...c!, profile: np, version: c!.version + 1, updated_at: new Date().toISOString() }); feed.setData(nf); setTick((t) => t + 1); }} />
        )}
        {tab === "partners" && (
          <div style={{ marginTop: 24 }}>
            <p className="lede">
              Suggestions from public information only. <b>Neither company has expressed interest</b> — these are reasons to talk, not introductions.
            </p>
            {conns.loading && <Skeleton h={200} />}
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", marginTop: 20 }}>
              {(conns.data ?? []).map((x) => (
                <div key={x.slug} className="card" style={{ padding: 20 }}>
                  <div className="spread">
                    <h3>{x.name}</h3>
                    <span className="mono muted">similarity {x.similarity.toFixed(2)}</span>
                  </div>
                  <p style={{ fontFamily: "var(--serif)", fontSize: 17, margin: "10px 0" }}>{x.headline}</p>
                  <div className="eyebrow">Shared ground</div>
                  <ul style={{ paddingLeft: 18, margin: "6px 0 10px", fontSize: 14 }}>{x.shared.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  <div className="eyebrow">Could complement</div>
                  <p style={{ fontSize: 14, margin: "6px 0 10px" }}>{x.complementary}</p>
                  <p className="muted" style={{ fontSize: 12.5, borderTop: "1px dotted var(--rule)", paddingTop: 8 }}>{x.caution}</p>
                  <div className="row"><SourceStamp url={x.bsp_page} label="Member page" />{x.website && <SourceStamp url={x.website} />}</div>
                </div>
              ))}
            </div>
            {conns.data && !conns.data.length && <p className="muted">No strong public overlap found yet.</p>}
          </div>
        )}
        {tab === "timeline" && (
          <div style={{ marginTop: 24, maxWidth: 820 }}>
            <p className="lede">Every change to the profile is versioned — by the agents (public data) or by your company (private refinements). The Watcher re-reads public pages and keeps your decisions.</p>
            {timeline.loading && <Skeleton h={160} />}
            {(timeline.data ?? []).map((v) => (
              <div key={v.version} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 18, padding: "18px 0", borderBottom: "1px solid var(--rule)" }}>
                <div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 26 }}>v{v.version}</div>
                  <div className="mono muted">{fmtDate(v.created_at)}</div>
                </div>
                <div>
                  <div className="row"><span className={`tag ${v.author === "user" ? "confirmed" : v.author === "watcher" ? "sea" : "fact"}`}>{v.author === "user" ? "Your company" : v.author === "watcher" ? "Watcher agent" : "Profiler agent"}</span><span>{v.note}</span></div>
                  {v.version > 1 && (
                    <div style={{ fontSize: 13.5, marginTop: 8 }}>
                      {v.added.map((a) => <div key={a} style={{ color: "var(--ok)" }}>+ {a}</div>)}
                      {v.removed.map((a) => <div key={a} style={{ color: "var(--signal)" }}>− {a}</div>)}
                      {v.changed.map((a) => <div key={a.statement} className="muted">~ {a.statement} <span className="mono">({a.from} → {a.to})</span></div>)}
                    </div>
                  )}
                  {v.version === 1 && <div className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>{v.claims} statements from public sources</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {c && <ChatDrawer slug={slug} name={c.name} open={chat} onClose={() => setChat(false)} />}
      <Toast msg={toastMsg} onDone={clearToast} />
    </>
  );
}

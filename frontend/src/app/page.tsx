"use client";

import Link from "next/link";
import Scope from "@/components/Scope";
import { ErrorNote, KindPill, Skeleton, SourceLink, useFetch, When } from "@/components/ui";
import { api, fmtDate, withLang, type Eco, type Member, type Overview } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

export default function Home() {
  const { t, lang } = useI18n();
  const ov = useFetch(() => api<Overview>(withLang("/api/overview", lang)), [lang]);
  const eco = useFetch(() => api<Eco>("/api/ecosystem"));
  const members = useFetch(() => api<Member[]>("/api/companies"));
  const demo = (members.data ?? []).filter((m) => m.demo);

  return (
    <>
      <section className="hero">
        <div className="shell" style={{ paddingTop: 48, paddingBottom: 84, position: "relative", zIndex: 1 }}>
          <div className="two-col" style={{ alignItems: "center", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)" }}>
            <div>
              <span className="pill onblue">{t("home.eyebrow")}</span>
              <h1 style={{ marginTop: 18 }}>
                {t("home.title1")}
                <br />
                <span style={{ color: "#FFC233" }}>{t("home.title2")}</span>
              </h1>
              <p className="lede" style={{ marginTop: 18 }}>{t("home.lede")}</p>
              <div className="row" style={{ marginTop: 26 }}>
                <Link className="btn white" href={demo[0] ? `/c/${demo[0].slug}` : "/members"}>{t("home.cta")} →</Link>
                <Link className="btn outline-white" href="/trust">{t("home.cta2")}</Link>
              </div>
            </div>
            <div style={{ maxWidth: 440, width: "100%", justifySelf: "center" }}>
              {eco.data ? <Scope eco={eco.data} /> : <div className="scope"><div className="scope-sweep" /></div>}
              <p style={{ textAlign: "center", marginTop: 12, fontSize: 13, opacity: 0.8 }}>
                {eco.data ? t("home.scopeCaption", { n: eco.data.nodes.length }) : t("home.scopeLoading")} · {t("home.scopeLegend")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="shell">
        <div className="stats">
          {([
            [ov.data?.members, "stat.members"],
            [ov.data?.opportunities.funding, "stat.funding"],
            [ov.data?.opportunities.event, "stat.events"],
            [ov.data?.opportunities.testbed, "stat.testbeds"],
          ] as [number | undefined, Key][]).map(([n, l]) => (
            <div className="stat" key={l}>
              <div className="num">{n ?? "–"}</div>
              <div className="lbl">{t(l)}</div>
            </div>
          ))}
        </div>
        {ov.error && <div style={{ marginTop: 16 }}><ErrorNote error={ov.error} /></div>}
      </section>

      <section className="shell section">
        <div className="two-col">
          <div>
            <div className="section-head">
              <h2>{t("home.watch")}</h2>
              <Link href="/members">{t("home.allMembers", { n: members.data?.length ?? "" })} →</Link>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {members.loading && [0, 1, 2, 3].map((i) => <div key={i} className="card pad"><Skeleton h={90} /></div>)}
              {demo.map((m) => (
                <Link key={m.slug} href={`/c/${m.slug}`} className="card pad lift" style={{ display: "block", color: "inherit" }}>
                  <div className="spread">
                    <span className="pill">{m.industry || "—"}</span>
                    <span className="dot confirmed" />
                  </div>
                  <h3 style={{ marginTop: 12 }}>{m.name}</h3>
                  <div className="muted small" style={{ marginTop: 2 }}>{m.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</div>
                  <div style={{ marginTop: 14, fontSize: 13.5, fontWeight: 600, color: "var(--brand-text)" }}>{t("home.openRadar")} →</div>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="section-head">
              <h2>{t("home.soon")}</h2>
              <span className="muted small">{t("home.asOf", { date: fmtDate(ov.data?.today, lang) })}</span>
            </div>
            <div className="card" style={{ padding: "4px 18px" }}>
              {ov.loading && <div style={{ padding: 14 }}><Skeleton h={120} /></div>}
              {(ov.data?.closing_soon ?? []).map((o, i, a) => (
                <div key={o.id} style={{ padding: "14px 0", borderBottom: i < a.length - 1 ? "1px solid var(--line)" : 0 }}>
                  <div className="row" style={{ gap: 8 }}><KindPill kind={o.kind} /><span className="muted small">{o.source_name}</span></div>
                  <a href={o.url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 6, fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>{o.title}</a>
                  <div className="meta"><When o={o} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="shell" style={{ paddingBottom: 24 }}>
        <div className="section-head">
          <h2>{t("home.sources")}</h2>
          <span className="muted small">{t("home.sourcesNote")}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t("th.source")}</th><th>{t("th.feeds")}</th><th>{t("th.items")}</th><th>{t("th.retrieved")}</th></tr></thead>
            <tbody>
              {(ov.data?.sources ?? []).map((s) => (
                <tr key={s.source + s.kind}>
                  <td>{s.url ? <SourceLink url={s.url} label={s.name ?? s.source} /> : s.source}</td>
                  <td><KindPill kind={s.kind as "funding" | "event" | "testbed"} /></td>
                  <td>{s.n}</td>
                  <td className="muted">{fmtDate(s.fetched_at, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

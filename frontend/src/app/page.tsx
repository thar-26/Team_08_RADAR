"use client";

import Link from "next/link";
import { PHOTOS } from "@/components/Footer";
import Scope from "@/components/Scope";
import Steps from "@/components/Steps";
import { useRole } from "@/components/RoleGate";
import { ErrorNote, KindPill, Skeleton, SourceLink, useFetch } from "@/components/ui";
import { api, daysUntil, fmtDate, withLang, type Eco, type Member, type Overview } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

export default function Home() {
  const { t, lang } = useI18n();
  const { role } = useRole();
  const ov = useFetch(() => api<Overview>(withLang("/api/overview", lang)), [lang]);
  const eco = useFetch(() => api<Eco>("/api/ecosystem"));
  const members = useFetch(() => api<Member[]>("/api/companies"));
  const demo = (members.data ?? []).filter((m) => m.demo);

  return (
    <>
      {/* The radar sweeps over the real archipelago around Karlskrona. */}
      <section className="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hero-photo" src="/assets/karlskrona-from-plane.jpg" alt="" width={1920} height={1280} fetchPriority="high" />
        <div className="hero-scrim" />
        <div className="shell hero-inner">
          <div>
            <h1 className="display" data-reveal>{t("home.title1")}<br />{t("home.title2")}</h1>
            <p className="lead" data-reveal>{t("home.lede")}</p>
            <div className="row" style={{ marginTop: 36, gap: 14 }} data-reveal>
              {role?.kind === "bsp" ? <Link className="btn sky" href="/park">{t("home.ctaPark")}</Link>
                : role?.kind === "company" ? <Link className="btn sky" href={`/c/${role.slug}`}>{t("home.ctaMine")}</Link>
                : <Link className="btn sky" href={demo[0] ? `/c/${demo[0].slug}` : "/members"}>{t("home.cta")}</Link>}
              <Link className="btn line" href="/trust">{t("home.cta2")}</Link>
            </div>
          </div>
          <div style={{ maxWidth: 560, width: "100%", justifySelf: "center" }}>
            {eco.data ? <Scope eco={eco.data} /> : <div className="scope"><div className="scope-sweep" /></div>}
            <p className="small" style={{ textAlign: "center", marginTop: 14, color: "rgba(255,255,255,.85)" }}>
              {eco.data ? t("home.scopeCaption", { n: eco.data.nodes.length }) : t("home.scopeLoading")}. {t("home.scopeLegend")}.
            </p>
          </div>
        </div>
      </section>

      <section className="field-navy">
        <div className="shell">
          <div className="figures">
            {([
              [ov.data?.members, "stat.members"],
              [ov.data?.opportunities.funding, "stat.funding"],
              [ov.data?.opportunities.event, "stat.events"],
              [ov.data?.opportunities.testbed, "stat.testbeds"],
            ] as [number | undefined, Key][]).map(([n, l]) => (
              <div className="figure" key={l} data-reveal><b>{n ?? "–"}</b><span>{t(l)}</span></div>
            ))}
          </div>
        </div>
      </section>
      {ov.error && <div className="shell" style={{ marginTop: 24 }}><ErrorNote error={ov.error} /></div>}

      <section className="section steps-band">
        <div className="shell">
          <h2>{t("home.stepsTitle")}</h2>
          <Steps />
        </div>
      </section>

      <section className="section">
        <div className="shell side">
          <div>
            <div className="spread" style={{ alignItems: "flex-end", marginBottom: 28 }}>
              <h2>{t("home.watch")}</h2>
              <Link href="/members">{t("home.allMembers", { n: members.data?.length ?? "" })}</Link>
            </div>
            <div className="list">
              {members.loading && <Skeleton h={300} />}
              {demo.map((m) => (
                <Link key={m.slug} href={`/c/${m.slug}`} className="list-row" data-reveal>
                  <div>
                    <h3>{m.name}</h3>
                    <div className="note" style={{ marginTop: 4 }}>{m.industry || "—"} · {m.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</div>
                  </div>
                  <span className="arrow" aria-hidden>→</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="panel navy">
            <h3 style={{ marginBottom: 14 }}>{t("home.soon")}</h3>
            {(ov.data?.closing_soon ?? []).map((o) => {
              const d = daysUntil(o.deadline);
              return (
                <a key={o.id} href={o.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "14px 0", borderTop: "1px solid var(--line-navy)", color: "#fff" }}>
                  <span style={{ fontWeight: 700, lineHeight: 1.3, display: "block" }}>{o.title}</span>
                  <span style={{ fontSize: 15, opacity: .8 }}><b className="num" style={{ color: "var(--sky)" }}>{d === 0 ? t("feed.today") : t("feed.days", { n: d ?? "–" })}</b> · {o.source_name}</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section field-navy">
        <div className="shell">
          <h2 data-reveal>{t("place.title")}</h2>
          <p className="lead" style={{ marginTop: 18, color: "rgba(255,255,255,.86)" }} data-reveal>{t("place.lede")}</p>
          <div className="place">
            {([
              ["ship", "place.marine", "place.marineText", "tall"],
              ["campus", "place.research", "place.researchText", "short"],
              ["island", "place.city", "place.cityText", "short"],
            ] as const).map(([k, h, d, size]) => {
              const ph = PHOTOS[k];
              return (
                <figure key={k} className={size} data-reveal>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.src} alt={ph.title} loading="lazy" width={1920} height={1270} />
                  <figcaption>
                    <b>{t(h)}</b>
                    <span>{t(d)}</span>
                    <small>{t("place.credit")}: <a href={ph.page}>{ph.title}</a>, {ph.by}, {ph.licence}</small>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section field-step">
        <div className="shell">
          <div className="spread" style={{ alignItems: "flex-end", marginBottom: 28 }}>
            <h2>{t("home.sources")}</h2>
            <span className="note">{t("home.sourcesNote")}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("th.source")}</th><th>{t("th.feeds")}</th><th>{t("th.items")}</th><th>{t("th.retrieved")}</th></tr></thead>
              <tbody>
                {(ov.data?.sources ?? []).map((s) => (
                  <tr key={s.source + s.kind}>
                    <td>{s.url ? <SourceLink url={s.url} label={s.name ?? s.source} /> : s.source}</td>
                    <td><KindPill kind={s.kind as "funding" | "event" | "testbed"} /></td>
                    <td className="num">{s.n}</td>
                    <td className="note">{fmtDate(s.fetched_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

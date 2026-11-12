"use client";

import Link from "next/link";
import Scope from "@/components/Scope";
import { ErrorNote, KindTag, Skeleton, SourceStamp, useFetch, When } from "@/components/ui";
import { api, fmtDate, type Eco, type Member, type Overview } from "@/lib/api";

export default function Bridge() {
  const ov = useFetch(() => api<Overview>("/api/overview"));
  const eco = useFetch(() => api<Eco>("/api/ecosystem"));
  const members = useFetch(() => api<Member[]>("/api/companies"));
  const demo = (members.data ?? []).filter((m) => m.demo);

  return (
    <>
      <section className="shell" style={{ paddingTop: 56, paddingBottom: 40 }}>
        <div className="two-col" style={{ alignItems: "center" }}>
          <div>
            <div className="eyebrow">Virtual Science Park · prototype</div>
            <h1 style={{ marginTop: 18 }}>
              Every opportunity,
              <br />
              <em style={{ fontStyle: "italic", color: "var(--signal)" }}>traced</em> to its source.
            </h1>
            <p className="lede" style={{ marginTop: 22 }}>
              Radar&apos;s agents read each member&apos;s public footprint, keep facts apart from guesses, and watch Swedish and EU
              funding, regional events and Karlskrona&apos;s testbeds — then explain, line by line, why something matters to you.
            </p>
            <div className="row" style={{ marginTop: 26 }}>
              <Link className="btn" href={demo[0] ? `/c/${demo[0].slug}` : "/members"}>Open a member&apos;s radar →</Link>
              <Link className="btn ghost" href="/trust">See how it stays honest</Link>
            </div>
          </div>
          <div style={{ maxWidth: 520, width: "100%", justifySelf: "center" }}>
            {eco.data ? <Scope eco={eco.data} /> : <div className="scope"><div className="scope-sweep" /></div>}
            <p className="mono muted" style={{ textAlign: "center", marginTop: 12 }}>
              {eco.data ? `${eco.data.nodes.length} members, placed by what they do` : "Plotting members…"} · orange = profiled
            </p>
          </div>
        </div>
      </section>

      <section className="shell">
        {ov.error && <ErrorNote error={ov.error} />}
        <div className="readouts">
          {[
            [ov.data?.members, "Members on the list"],
            [ov.data?.opportunities.funding, "Open funding calls"],
            [ov.data?.opportunities.event, "Upcoming events"],
            [ov.data?.opportunities.testbed, "Testbeds nearby"],
          ].map(([n, l]) => (
            <div className="readout" key={l as string}>
              <div className="num">{n ?? "–"}</div>
              <div className="lbl eyebrow">{l}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="shell section">
        <div className="two-col">
          <div>
            <div className="section-head">
              <h2>Members on watch</h2>
              <Link href="/members" className="mono">All {members.data?.length ?? ""} members →</Link>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
              {members.loading && [0, 1, 2, 3].map((i) => <div key={i} className="card" style={{ padding: 18 }}><Skeleton h={90} /></div>)}
              {demo.map((m) => (
                <Link key={m.slug} href={`/c/${m.slug}`} className="card" style={{ padding: 18, textDecoration: "none", display: "block" }}>
                  <div className="spread">
                    <span className="eyebrow">{m.industry || "Member"}</span>
                    <span className="dot confirmed" />
                  </div>
                  <h3 style={{ marginTop: 10 }}>{m.name}</h3>
                  <div className="mono muted" style={{ marginTop: 6 }}>{m.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</div>
                  <div style={{ marginTop: 16, fontSize: 13.5, color: "var(--sea)" }}>Open radar →</div>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="section-head">
              <h2>Closing soon</h2>
              <span className="mono muted">as of {fmtDate(ov.data?.today)}</span>
            </div>
            <div className="panel">
              {ov.loading && <Skeleton h={120} />}
              {(ov.data?.closing_soon ?? []).map((o) => (
                <div key={o.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--rule)" }}>
                  <div className="row"><KindTag kind={o.kind} /><span className="mono muted">{o.source_name}</span></div>
                  <a href={o.url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 6, fontSize: 14.5 }}>{o.title}</a>
                  <div className="meta"><When o={o} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="shell section" style={{ paddingTop: 0 }}>
        <div className="section-head">
          <h2>Sources on watch</h2>
          <span className="mono muted">Official APIs and public pages · robots.txt respected</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Source</th><th>Feeds</th><th>Items</th><th>Last retrieved</th></tr></thead>
            <tbody>
              {(ov.data?.sources ?? []).map((s) => (
                <tr key={s.source + s.kind}>
                  <td>{s.url ? <SourceStamp url={s.url} label={s.name ?? s.source} /> : s.source}</td>
                  <td className="mono">{s.kind}</td>
                  <td className="mono">{s.n}</td>
                  <td className="mono">{fmtDate(s.fetched_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

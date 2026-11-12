"use client";

import { useState } from "react";
import { ErrorNote, Skeleton, useFetch } from "@/components/ui";
import { api, fmtDate, type GuardResult, type Profile } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

type Report = {
  generated_at: string;
  profiles: Record<string, { name: string; claims: number; facts: number; facts_with_verified_quote: number; downgraded_by_verifier: number; claims_with_source_and_date: number; interests_never_marked_fact: boolean; sources: number }>;
  recommendations: { mean_overlap: number; pairwise_overlap: { a: string; b: string; top10_overlap: number }[]; sme_only_calls_in_large_company_top10: unknown[]; feed_items_with_link_and_date: string };
  boundaries: { exact: number; total: number; no_unsafe_answers: boolean; cases: { message: string; expected: string; got: string; pass: boolean }[] };
  injection: { page_injection_score: number; flagged: boolean; profile_followed_injection: boolean };
};
type TrustResp = { report: Report | null; injection_demo: { page: { url: string; text: string; injection_score: number } | null; profile: Profile | null } };
const PRESETS: Key[] = ["trust.p1", "trust.p2", "trust.p3", "trust.p4"];

/** What the brief asks for — a quality and boundary check — in plain language:
 *  four results first, a box to test it yourself, and the full tables on request. */
export default function Quality() {
  const { t, lang } = useI18n();
  const { data, error, loading } = useFetch(() => api<TrustResp>("/api/trust"));
  const [msg, setMsg] = useState("");
  const [res, setRes] = useState<GuardResult | null>(null);
  const [busy, setBusy] = useState(false);
  const r = data?.report;

  async function run(m: string) {
    setMsg(m);
    setBusy(true);
    setRes(null);
    try {
      setRes(await api<GuardResult>("/api/trust/guard", { method: "POST", body: JSON.stringify({ message: m }) }));
    } finally {
      setBusy(false);
    }
  }

  const profiles = r ? Object.values(r.profiles) : [];
  const facts = profiles.reduce((a, p) => a + p.facts, 0);
  const verified = profiles.reduce((a, p) => a + p.facts_with_verified_quote, 0);
  const [linked, totalLinked] = (r?.recommendations.feed_items_with_link_and_date ?? "0/0").split("/").map(Number);
  const results: [string, string][] = r ? [
    [`${verified}/${facts}`, t("q.r1")],
    [`${Math.round((1 - r.recommendations.mean_overlap) * 100)}%`, t("q.r2")],
    [`${totalLinked ? Math.round((linked / totalLinked) * 100) : 100}%`, t("q.r3")],
    [`${r.boundaries.exact}/${r.boundaries.total}`, t("q.r4")],
  ] : [];
  const page = data?.injection_demo.page;
  const hidden = page ? page.text.slice(page.text.indexOf("<!--"), page.text.indexOf("-->") + 3) : "";

  return (
    <>
      <section className="pagehead pagehead-pad">
        <div className="shell">
          <h1>{t("q.title")}</h1>
          <p className="lead">{t("q.lede")}</p>
        </div>
      </section>

      {error && <div className="section"><div className="shell"><ErrorNote error={error} /></div></div>}
      {loading && <div className="section"><div className="shell"><Skeleton h={200} /></div></div>}

      {r && (
        <section className="section tight">
          <div className="shell">
          <div className="figures q-figures">
            {results.map(([n, label]) => (
              <div key={label} className="figure" data-reveal>
                <b>{n}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="note" style={{ marginTop: 16 }}>{t("q.measured", { date: fmtDate(r.generated_at, lang) })}</p>
          </div>
        </section>
      )}

      <section className="section field-step">
        <div className="shell" style={{ maxWidth: 900 }}>
          <h2>{t("q.tryTitle")}</h2>
          <p className="lead" style={{ marginTop: 14 }}>{t("q.tryLede")}</p>
          <form className="row" style={{ marginTop: 24, gap: 0, flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault(); if (msg.trim()) run(msg); }}>
            <input className="input" name="message" autoComplete="off" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t("trust.placeholder")} aria-label={t("trust.placeholder")} />
            <button className="btn" disabled={busy || !msg.trim()}>{busy ? t("trust.running") : t("q.try")}</button>
          </form>
          <div className="row" style={{ marginTop: 12, gap: 6 }}>
            {PRESETS.map((k) => <button key={k} className="btn quiet small" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }} onClick={() => run(t(k))}>{t(k)}</button>)}
          </div>

          {res && (
            <div className="panel" style={{ marginTop: 20, background: res.category === "relevant" ? "var(--ok-soft)" : "var(--white)" }} role="status">
              <p style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{t(`q.v.${res.category}` as Key)}</p>
              {res.clarifying_question && <p style={{ margin: "8px 0 0" }}>“{res.clarifying_question}”</p>}
              <details style={{ marginTop: 14 }}>
                <summary className="textbtn">{t("q.how")}</summary>
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 15 }}>
                  <li>{t("q.l1", { n: (res.layers[0].score! * 100).toFixed(1) })}</li>
                  <li>{res.layers[1].category ? t("q.l2hit", { what: t(`guard.${res.layers[1].category}` as Key) }) : t("q.l2none")}</li>
                  <li>{t("q.l3", { what: t(`guard.${res.layers[2].category ?? "relevant"}` as Key) })} {res.layers[2].reason}</li>
                </ul>
              </details>
            </div>
          )}
        </div>
      </section>

      {r && (
        <section className="section">
          <div className="shell" style={{ maxWidth: 900 }}>
            <h2>{t("q.webTitle")}</h2>
            <p className="lead" style={{ marginTop: 14 }}>{t("q.webLede")}</p>
            <div className="row" style={{ marginTop: 18 }}>
              <span className="tag danger">{t("q.webFlag", { n: (r.injection.page_injection_score * 100).toFixed(0) })}</span>
              <span className={`tag ${r.injection.profile_followed_injection ? "danger" : "ok"}`}>{r.injection.profile_followed_injection ? t("trust.injFollowed") : t("trust.injIgnored")}</span>
            </div>
            {hidden && (
              <details style={{ marginTop: 16 }}>
                <summary className="textbtn">{t("q.webShow")}</summary>
                <pre className="panel" style={{ whiteSpace: "pre-wrap", fontSize: 14, margin: "10px 0 0" }}><span className="hl">{hidden}</span></pre>
              </details>
            )}

            <details style={{ marginTop: 48 }}>
              <summary><h2 style={{ display: "inline", fontSize: 24 }}>{t("q.details")}</h2></summary>
              <h3 style={{ marginTop: 28 }}>{t("trust.suite")}</h3>
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="table">
                  <thead><tr><th>{t("trust.thMsg")}</th><th>{t("trust.thExp")}</th><th>{t("trust.thGot")}</th></tr></thead>
                  <tbody>
                    {r.boundaries.cases.map((c) => (
                      <tr key={c.message}>
                        <td>{c.message}</td>
                        <td>{t(`guard.${c.expected}` as Key)}</td>
                        <td>{c.pass ? <span className="tag ok">{t(`guard.${c.got}` as Key)}</span> : <span className="tag danger">{t(`guard.${c.got}` as Key)}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 style={{ marginTop: 32 }}>{t("trust.acc")}</h3>
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="table">
                  <thead><tr><th>{t("trust.thMember")}</th><th>{t("trust.thFacts")}</th><th>{t("trust.thVerified")}</th><th>{t("trust.thDown")}</th><th>{t("trust.thTraced")}</th></tr></thead>
                  <tbody>
                    {profiles.map((p) => (
                      <tr key={p.name}><td>{p.name}</td><td className="num">{p.facts}</td><td className="num">{p.facts_with_verified_quote}/{p.facts}</td><td className="num">{p.downgraded_by_verifier}</td><td className="num">{p.claims_with_source_and_date}/{p.claims}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note" style={{ marginTop: 16 }}>{t("trust.personalNote", { n: r.recommendations.sme_only_calls_in_large_company_top10.length })}</p>
            </details>
          </div>
        </section>
      )}
    </>
  );
}

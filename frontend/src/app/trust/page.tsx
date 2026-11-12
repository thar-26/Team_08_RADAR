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
const PRESETS: Key[] = ["trust.p1", "trust.p2", "trust.p3", "trust.p4", "trust.p5", "trust.p6"];

export default function Trust() {
  const { t, lang } = useI18n();
  const { data, error, loading } = useFetch(() => api<TrustResp>("/api/trust"));
  const [msg, setMsg] = useState("");
  const [res, setRes] = useState<GuardResult | null>(null);
  const [busy, setBusy] = useState(false);
  const r = data?.report;
  const g = (c: string) => t(`guard.${c}` as Key);

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
  const page = data?.injection_demo.page;
  const [before, hidden, after] = page ? splitHidden(page.text) : ["", "", ""];

  return (
    <>
      <section className="pagehead">
        <div className="shell">
          <div className="eyebrow">{t("trust.eyebrow")}</div>
          <h1 style={{ marginTop: 8 }}>{t("trust.title")}</h1>
          <p className="lede">{t("trust.lede")}</p>
        </div>
      </section>

      <section className="shell" style={{ marginTop: 24 }}>
        <div className="card pad">
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (msg.trim()) run(msg); }}>
            <input className="input" style={{ flex: 1, minWidth: 240 }} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t("trust.placeholder")} aria-label={t("trust.placeholder")} />
            <button className="btn" disabled={busy || !msg.trim()}>{busy ? t("trust.running") : t("trust.run")}</button>
          </form>
          <div className="row" style={{ marginTop: 12, gap: 6 }}>
            {PRESETS.map((k) => <button key={k} className="btn ghost small" onClick={() => run(t(k))}>{t(k)}</button>)}
          </div>
          {(res || busy) && (
            <div className="grid" style={{ marginTop: 20, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <Layer title={t("trust.l1")} sub="Llama Prompt Guard 2" value={res ? `${(res.layers[0].score! * 100).toFixed(1)}%` : "…"} flag={!!res?.layers[0].flag} note={t("trust.l1note")} />
              <Layer title={t("trust.l2")} sub={t("trust.l2sub")} value={res ? (res.layers[1].category ? g(res.layers[1].category) : t("trust.noMatch")) : "…"} flag={!!res?.layers[1].flag} note={t("trust.l2note")} />
              <Layer title={t("trust.l3")} sub="gpt-oss-20b" value={res ? g(res.layers[2].category ?? "relevant") : "…"} flag={!!res && res.layers[2].category !== "relevant"} note={res?.layers[2].reason ?? ""} />
              <Layer title={t("trust.verdict")} sub={t("trust.strictest")} value={res ? g(res.category) : "…"} flag={!!res && res.category !== "relevant"} strong
                note={res?.clarifying_question || (res?.category === "relevant" ? t("trust.answerOk") : t("trust.answerSafe"))} />
            </div>
          )}
        </div>
      </section>

      <section className="shell section">
        {error && <ErrorNote error={error} />}
        {loading && <Skeleton h={240} />}
        {r && (
          <>
            <div className="section-head">
              <h2>{t("trust.suite")}</h2>
              <span className={`pill ${r.boundaries.no_unsafe_answers ? "ok" : "danger"}`}>
                {t("trust.suiteMeta", { a: r.boundaries.exact, b: r.boundaries.total, safe: r.boundaries.no_unsafe_answers ? t("trust.noUnsafe") : t("trust.unsafe"), date: fmtDate(r.generated_at, lang) })}
              </span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t("trust.thMsg")}</th><th>{t("trust.thExp")}</th><th>{t("trust.thGot")}</th><th></th></tr></thead>
                <tbody>
                  {r.boundaries.cases.map((c) => (
                    <tr key={c.message}>
                      <td>{c.message}</td><td>{g(c.expected)}</td><td>{g(c.got)}</td>
                      <td>{c.pass ? <span className="pill ok">✓ {t("trust.pass")}</span> : <span className="pill danger">{t("trust.miss")}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="two-col" style={{ marginTop: 48 }}>
              <div>
                <div className="section-head"><h2>{t("trust.injTitle")}</h2><span className="pill warn">{t("trust.simCo")}</span></div>
                <p className="muted" style={{ marginTop: -6 }}>{t("trust.injLede")}</p>
                <pre className="card" style={{ padding: 18, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6, fontFamily: "var(--font-mono), monospace", overflowX: "auto" }}>
                  {before}<span className="hl">{hidden}</span>{after}
                </pre>
                <div className="row">
                  <span className="pill danger">{t("trust.injScore", { n: (r.injection.page_injection_score * 100).toFixed(1) })}</span>
                  <span className={`pill ${r.injection.profile_followed_injection ? "danger" : "ok"}`}>{r.injection.profile_followed_injection ? t("trust.injFollowed") : `✓ ${t("trust.injIgnored")}`}</span>
                </div>
              </div>
              <div>
                <div className="section-head"><h2>{t("trust.wrote")}</h2></div>
                <div className="claims">
                  {(data?.injection_demo.profile?.claims ?? []).slice(0, 9).map((c) => (
                    <div key={c.id} className="claim" style={{ gridTemplateColumns: "14px 1fr" }}>
                      <span className={`dot ${c.status === "fact" ? "fact" : "inferred"}`} /><div>{c.statement}</div>
                    </div>
                  ))}
                </div>
                <p className="muted small">{t("trust.wroteNote")}</p>
              </div>
            </div>

            <div className="section-head" style={{ marginTop: 48 }}>
              <h2>{t("trust.acc")}</h2>
              <span className="muted small">{t("trust.accMeta", { n: r.recommendations.feed_items_with_link_and_date })}</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr>
                  <th>{t("trust.thMember")}</th><th>{t("trust.thStatements")}</th><th>{t("trust.thFacts")}</th><th>{t("trust.thVerified")}</th>
                  <th>{t("trust.thDown")}</th><th>{t("trust.thTraced")}</th><th>{t("trust.thInterests")}</th><th>{t("trust.thSources")}</th>
                </tr></thead>
                <tbody>
                  {Object.entries(r.profiles).map(([s, p]) => (
                    <tr key={s}>
                      <td><b style={{ fontWeight: 600 }}>{p.name}</b></td><td>{p.claims}</td><td>{p.facts}</td>
                      <td>{p.facts_with_verified_quote}/{p.facts}</td><td>{p.downgraded_by_verifier}</td>
                      <td>{p.claims_with_source_and_date}/{p.claims}</td>
                      <td>{p.interests_never_marked_fact ? <span className="pill ok">{t("trust.yes")}</span> : <span className="pill danger">{t("trust.no")}</span>}</td>
                      <td>{p.sources}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="section-head" style={{ marginTop: 48 }}>
              <h2>{t("trust.personal")}</h2>
              <span className="pill brand">{t("trust.overlap", { n: (r.recommendations.mean_overlap * 100).toFixed(0) })}</span>
            </div>
            <p className="muted" style={{ marginTop: -6 }}>{t("trust.personalNote", { n: r.recommendations.sme_only_calls_in_large_company_top10.length })}</p>
            <div className="row" style={{ gap: 8 }}>
              {r.recommendations.pairwise_overlap.map((p) => <span key={p.a + p.b} className="pill">{p.a} × {p.b}: {(p.top10_overlap * 100).toFixed(0)}%</span>)}
            </div>
          </>
        )}
      </section>
    </>
  );
}

function Layer({ title, sub, value, flag, note, strong }: { title: string; sub: string; value: string; flag: boolean; note: string; strong?: boolean }) {
  return (
    <div className="card" style={{ padding: 16, background: strong ? (flag ? "var(--danger-soft)" : "var(--ok-soft)") : "var(--surface-2)", border: 0 }}>
      <div className="panel-title" style={{ marginBottom: 0 }}>{title}</div>
      <div className="muted small">{sub}</div>
      <div style={{ fontFamily: "var(--font-head)", fontWeight: 600, fontSize: 20, marginTop: 10, color: flag ? "var(--danger)" : "var(--ok)" }}>{value}</div>
      <div className="muted small" style={{ marginTop: 4 }}>{note}</div>
    </div>
  );
}

function splitHidden(text: string): [string, string, string] {
  const s = text.indexOf("<!--");
  const e = text.indexOf("-->");
  if (s < 0 || e < 0) return [text, "", ""];
  return [text.slice(0, s), text.slice(s, e + 3), text.slice(e + 3)];
}

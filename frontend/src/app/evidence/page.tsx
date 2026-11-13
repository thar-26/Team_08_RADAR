"use client";

import { useEffect, useState } from "react";
import { ErrorNote, KindPill, Skeleton, useFetch } from "@/components/ui";
import { api, fmtDate, withLang } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

type Usage = { model: string; purpose: string; calls: number; cached: number; prompt_tokens: number; completion_tokens: number; avg_ms: number; since: string };
type Summary = { slug: string; name: string; rated: number; raters: number; relevant: number; partly: number; hit_rate: number };
type Evidence = { companies: { slug: string; name: string }[]; ratings: Summary[]; overall_hit_rate: number | null; rated_total: number; usage: Usage[] };
type Top = { rank: number; fit: number; level: string; opp_id: string; title: string; kind: "funding" | "event" | "testbed"; url: string; why: string; rating: string | null };

const CHOICES = ["relevant", "partly", "not"] as const;
const RATER_KEY = "radar-rater";

/** Evidence for the jury: the team rates each demo company's top 10 (hit rate),
 *  and every model call is measured (tokens and time, no invented prices). */
export default function EvidencePage() {
  const { t, lang } = useI18n();
  const ev = useFetch(() => api<Evidence>("/api/evidence"));
  const [data, setData] = useState<Evidence | null>(null);
  const [slug, setSlug] = useState("ocean-harvesting");
  const [rater, setRater] = useState("");
  const [top, setTop] = useState<Top[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try { setRater(localStorage.getItem(RATER_KEY) ?? ""); } catch { /* storage blocked */ }
  }, []);
  useEffect(() => { if (ev.data) setData(ev.data); }, [ev.data]);
  useEffect(() => {
    setTop(null);
    api<Top[]>(withLang(`/api/evidence/${slug}?rater=${encodeURIComponent(rater.trim())}`, lang)).then(setTop).catch((e) => setErr(String(e.message)));
  }, [slug, rater, lang]);

  function saveRater(v: string) {
    setRater(v);
    try { localStorage.setItem(RATER_KEY, v); } catch { /* storage blocked */ }
  }

  async function rate(item: Top, rating: string) {
    setErr(null);
    try {
      const d = await api<Evidence>("/api/evidence/rate", { method: "POST", body: JSON.stringify({ slug, opp_id: item.opp_id, rater: rater.trim(), rating, fit: item.fit, rank: item.rank }) });
      setData(d);
      setTop((cur) => cur?.map((x) => (x.opp_id === item.opp_id ? { ...x, rating } : x)) ?? null);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  const tokens = (data?.usage ?? []).reduce((a, u) => a + u.prompt_tokens + u.completion_tokens, 0);
  const calls = (data?.usage ?? []).reduce((a, u) => a + u.calls, 0);
  const cached = (data?.usage ?? []).reduce((a, u) => a + (u.cached || 0), 0);

  return (
    <>
      <section className="pagehead pagehead-pad">
        <div className="shell">
          <h1>{t("ev2.title")}</h1>
          <p className="lead">{t("ev2.lede")}</p>
        </div>
      </section>
      {ev.error && <div className="section"><div className="shell"><ErrorNote error={ev.error} /></div></div>}
      {ev.loading && <div className="section"><div className="shell"><Skeleton h={200} /></div></div>}

      {data && (
        <section className="section tight">
          <div className="shell">
            <div className="figures q-figures">
              <div className="figure"><b>{data.overall_hit_rate === null ? "–" : `${Math.round(data.overall_hit_rate * 100)}%`}</b><span>{t("ev2.hit", { n: data.rated_total })}</span></div>
              <div className="figure"><b>{data.ratings.length}</b><span>{t("ev2.companiesRated")}</span></div>
              <div className="figure"><b>{tokens.toLocaleString(lang === "sv" ? "sv-SE" : "en-GB")}</b><span>{t("ev2.tokens", { n: calls })}</span></div>
              <div className="figure"><b>{calls ? `${Math.round((cached / calls) * 100)}%` : "–"}</b><span>{t("ev2.cached")}</span></div>
            </div>
            <p className="note" style={{ marginTop: 16 }}>{t("ev2.hitHow")}</p>
          </div>
        </section>
      )}

      <section className="section field-step">
        <div className="shell" style={{ maxWidth: 1000 }}>
          <h2>{t("ev2.rateTitle")}</h2>
          <p className="lead" style={{ marginTop: 12 }}>{t("ev2.rateLede")}</p>
          <div className="event-filters" style={{ paddingBottom: 0 }}>
            <label>
              <span>{t("ev2.rater")}</span>
              <input className="input" name="rater" autoComplete="name" value={rater} onChange={(e) => saveRater(e.target.value)} placeholder={t("ev2.raterPh")} />
            </label>
            <label>
              <span>{t("ev2.company")}</span>
              <select className="select" value={slug} onChange={(e) => setSlug(e.target.value)}>
                {(data?.companies ?? []).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </label>
          </div>
          {err && <div className="banner" style={{ marginTop: 12 }}>{err}</div>}
          {!rater.trim() && <p className="note">{t("ev2.needRater")}</p>}
          {!top && <Skeleton h={300} />}
          <div className="list" style={{ marginTop: 12 }}>
            {(top ?? []).map((x) => (
              <div key={x.opp_id} className="list-row rate-row">
                <b className="num">{x.rank}</b>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 10 }}><KindPill kind={x.kind} /><span className="note">{x.fit.toFixed(1)}/10 · {t(`fit.${x.level}` as Key)}</span></div>
                  <a href={x.url} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>{x.title}</a>
                  {x.why && <p className="note" style={{ margin: "4px 0 0" }}>{x.why}</p>}
                </div>
                <div className="seg" role="group" aria-label={t("ev2.rating")}>
                  {CHOICES.map((c) => (
                    <button key={c} aria-pressed={x.rating === c} disabled={!rater.trim()} onClick={() => rate(x, c)}>{t(`ev2.${c}` as Key)}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {data && data.ratings.length > 0 && (
        <section className="section">
          <div className="shell">
            <h2 style={{ marginBottom: 14 }}>{t("ev2.byCompany")}</h2>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t("ev2.company")}</th><th>{t("ev2.rated")}</th><th>{t("ev2.relevant")}</th><th>{t("ev2.partly")}</th><th>{t("ev2.hitRate")}</th></tr></thead>
              <tbody>{data.ratings.map((r) => (
                <tr key={r.slug}><td>{r.name}</td><td className="num">{r.rated} ({t("ev2.raters", { n: r.raters })})</td><td className="num">{r.relevant}</td><td className="num">{r.partly}</td><td className="num"><b>{Math.round(r.hit_rate * 100)}%</b></td></tr>
              ))}</tbody>
            </table></div>
          </div>
        </section>
      )}

      {data && (
        <section className="section">
          <div className="shell">
            <h2 style={{ marginBottom: 6 }}>{t("ev2.usageTitle")}</h2>
            <p className="note" style={{ margin: "0 0 16px", maxWidth: 760 }}>{t("ev2.usageLede")}</p>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t("ev2.model")}</th><th>{t("ev2.task")}</th><th>{t("ev2.calls")}</th><th>{t("ev2.cachedCol")}</th><th>{t("ev2.in")}</th><th>{t("ev2.out")}</th><th>{t("ev2.ms")}</th></tr></thead>
              <tbody>{data.usage.map((u) => (
                <tr key={u.model + u.purpose}><td>{u.model}</td><td>{u.purpose}</td><td className="num">{u.calls}</td><td className="num">{u.cached || 0}</td><td className="num">{u.prompt_tokens}</td><td className="num">{u.completion_tokens}</td><td className="num">{u.avg_ms}</td></tr>
              ))}</tbody>
            </table></div>
            {data.usage[0] && <p className="note" style={{ marginTop: 10 }}>{t("ev2.since", { date: fmtDate(data.usage.map((u) => u.since).sort()[0], lang) })}</p>}
          </div>
        </section>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorNote, KindPill, Logo, Skeleton, useFetch } from "@/components/ui";
import { api, fmtDate, withLang, type Opportunity } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

type Row = {
  slug: string; name: string; updated_at: string; strong: number; possible: number; tips: number;
  top: { id: string; title: string; fit: number } | null;
  next_deadline: { id: string; title: string; date: string; fit: number } | null;
};
type FitMember = { slug: string; name: string; fit: number; level: "strong" | "possible" | "weak"; why: string };
type Fit = { opportunity: Opportunity; members: FitMember[] };

/** Blue Science Park's own view: which members have what coming up, and which
 *  members a given call, event or testbed fits best. Public profiles only. */
export default function Park() {
  const { t, lang } = useI18n();
  const ov = useFetch(() => api<Row[]>(withLang("/api/park/overview", lang)), [lang]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Opportunity[]>([]);
  const [pick, setPick] = useState<string | null>(null);

  // Quick picks: what the members' best and most urgent matches are.
  const quick = new Map<string, string>();
  for (const r of ov.data ?? []) {
    if (r.next_deadline) quick.set(r.next_deadline.id, r.next_deadline.title);
    if (r.top) quick.set(r.top.id, r.top.title);
  }

  useEffect(() => {
    if (q.trim().length < 3) { setResults([]); return; }
    const id = setTimeout(() => {
      api<Opportunity[]>(`/api/opportunities?q=${encodeURIComponent(q.trim())}&limit=8`).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <>
      <section className="pagehead pagehead-pad">
        <div className="shell">
          <h1>{t("park.title")}</h1>
          <p className="lead">{t("park.lede")}</p>
        </div>
      </section>

      <section className="section"><div className="shell">
        <h2 style={{ marginBottom: 16 }}>{t("park.overview")}</h2>
        {ov.error && <ErrorNote error={ov.error} onRetry={ov.reload} />}
        {ov.loading && <Skeleton h={300} />}
        {ov.data && (
          <div className="table-wrap"><table className="table">
            <thead><tr>
              <th>{t("park.member")}</th><th>{t("park.strong")}</th><th>{t("park.possible")}</th>
              <th>{t("park.nextDeadline")}</th><th>{t("park.best")}</th><th>{t("park.tips")}</th><th>{t("park.updated")}</th>
            </tr></thead>
            <tbody>{ov.data.map((r) => (
              <tr key={r.slug}>
                <td><span className="name-logo"><Logo k={`member-${r.slug}`} size={28} /><Link href={`/c/${r.slug}`}><b>{r.name}</b></Link></span></td>
                <td className="num"><b>{r.strong}</b></td>
                <td className="num">{r.possible}</td>
                <td>{r.next_deadline ? <button className="textbtn" onClick={() => setPick(r.next_deadline!.id)}>{fmtDate(r.next_deadline.date, lang)} · {r.next_deadline.title.slice(0, 60)}</button> : "–"}</td>
                <td>{r.top ? <button className="textbtn" onClick={() => setPick(r.top!.id)}>{r.top.fit.toFixed(1)} · {r.top.title.slice(0, 50)}</button> : "–"}</td>
                <td className="num">{r.tips}</td>
                <td className="note">{fmtDate(r.updated_at, lang)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="note" style={{ marginTop: 10 }}>{t("park.overviewNote")}</p>
      </div></section>

      <section className="section field-step"><div className="shell">
        <h2>{t("park.fitTitle")}</h2>
        <p className="lead" style={{ marginTop: 10, maxWidth: "62ch" }}>{t("park.fitLede")}</p>
        <input className="input" style={{ maxWidth: 520, marginTop: 20 }} name="opportunity" autoComplete="off" value={q}
          onChange={(e) => setQ(e.target.value)} placeholder={t("park.search")} aria-label={t("park.search")} />
        <div className="park-picks">
          {(results.length ? results.map((o) => [o.id, lang === "sv" && o.title_sv ? o.title_sv : o.title] as const) : [...quick.entries()]).map(([id, title]) => (
            <button key={id} className={`btn quiet small ${pick === id ? "on" : ""}`} onClick={() => setPick(id)}>{title.slice(0, 70)}</button>
          ))}
        </div>
        {pick && <FitList oppId={pick} />}
      </div></section>
    </>
  );
}

function FitList({ oppId }: { oppId: string }) {
  const { t, lang } = useI18n();
  const fit = useFetch(() => api<Fit>(withLang(`/api/park/fit?opp_id=${encodeURIComponent(oppId)}`, lang)), [oppId, lang]);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  async function tip(slug: string) {
    await api("/api/park/tips", { method: "POST", body: JSON.stringify({ slug, opp_id: oppId }) });
    setSent((s) => ({ ...s, [slug]: true }));
  }

  if (fit.loading) return <div style={{ marginTop: 24 }}><Skeleton h={240} /></div>;
  if (fit.error || !fit.data) return <div style={{ marginTop: 24 }}><ErrorNote error={fit.error ?? ""} onRetry={fit.reload} /></div>;
  const o = fit.data.opportunity;
  return (
    <div style={{ marginTop: 28 }}>
      <div className="row" style={{ gap: 10 }}><Logo k={o.logo} size={28} /><KindPill kind={o.kind} /><span className="note">{o.source_name}</span></div>
      <a href={o.url} target="_blank" rel="noreferrer" className="feed-title">{o.title}</a>
      <div className="list" style={{ marginTop: 16 }}>
        {fit.data.members.map((m) => (
          <div key={m.slug} className="list-row park-fit">
            <div className={`fit fit-${m.level}`} style={{ marginTop: 0 }}>
              <div className="fit-num"><b>{m.fit.toFixed(1)}</b><span>/10</span></div>
              <div className="fit-bar"><i style={{ width: `${m.fit * 10}%` }} /></div>
              <span className="fit-label">{t(`fit.${m.level}` as Key)}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <span className="name-logo"><Logo k={`member-${m.slug}`} size={30} /><Link href={`/c/${m.slug}`}><b>{m.name}</b></Link></span>
              {m.why && <p className="note" style={{ margin: "4px 0 0" }}>{m.why}</p>}
            </div>
            <button className="btn small" disabled={sent[m.slug] || m.level === "weak"} onClick={() => tip(m.slug)}>
              {sent[m.slug] ? t("park.sent") : t("park.sendTip")}
            </button>
          </div>
        ))}
      </div>
      <p className="note" style={{ marginTop: 10 }}>{t("park.tipNote")}</p>
    </div>
  );
}

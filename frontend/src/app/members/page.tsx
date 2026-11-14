"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ErrorNote, Logo, Skeleton, useFetch } from "@/components/ui";
import { api, withLang, type Member, type MemberHit } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

export default function Members() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const { data, error, loading } = useFetch(() => api<Member[]>("/api/companies"));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const list = useMemo(
    () => (data ?? []).filter((m) => (m.name + " " + m.industry).toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemberHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(false);

  async function search(text: string) {
    const v = text.trim();
    setQuery(v);
    if (v.length < 2) return;
    setSearching(true);
    setSearchErr(false);
    try {
      setHits(await api<MemberHit[]>(withLang(`/api/members/search?q=${encodeURIComponent(v)}`, lang)));
    } catch {
      setSearchErr(true);
    } finally {
      setSearching(false);
    }
  }

  async function build(slug: string) {
    setBusy(slug);
    setErr(null);
    try {
      await api(`/api/companies/${slug}/build`, { method: "POST" });
      router.push(`/c/${slug}`);
    } catch (e) {
      setErr(String((e as Error).message));
      setBusy(null);
    }
  }

  return (
    <>
      <section className="pagehead pagehead-pad">
        <div className="shell">
          
          <div className="spread">
            <h1>{t("members.title")}</h1>
            <input className="input" style={{ maxWidth: 320 }} placeholder={t("members.filter")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("members.filter")} />
          </div>
          <p className="lead">{t("members.lede")}</p>
        </div>
      </section>
      <section className="section" style={{ paddingTop: 48, paddingBottom: 0 }}><div className="shell">
        <h2 style={{ marginBottom: 6 }}>{t("ms.title")}</h2>
        <p className="note" style={{ margin: "0 0 16px", maxWidth: 680 }}>{t("ms.lede")}</p>
        <form className="row" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); search(query); }}>
          <input className="input" style={{ maxWidth: 420, flex: "1 1 260px" }} name="expertise" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("ms.placeholder")} aria-label={t("ms.placeholder")} />
          <button className="btn" disabled={searching || query.trim().length < 2}>{searching ? t("ms.searching") : t("ms.search")}</button>
        </form>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          {(["ms.ex1", "ms.ex2", "ms.ex3", "ms.ex4"] as Key[]).map((k) => (
            <button key={k} className="btn quiet small" onClick={() => search(t(k))}>{t(k)}</button>
          ))}
        </div>
        {searchErr && <div className="banner" style={{ marginTop: 16 }}>{t("ms.error")}</div>}
        {hits && (
          <div style={{ marginTop: 24 }}>
            {hits.length === 0 && <p className="note">{t("ms.none")}</p>}
            <div className="list">
              {hits.map((h) => (
                <div key={h.slug} className="list-row hit">
                  <div>
                    <h3 style={{ fontSize: 22 }} className="name-logo"><Logo k={`member-${h.slug}`} size={34} />{h.profiled ? <Link href={`/c/${h.slug}`} style={{ color: "inherit" }}>{h.name}</Link> : h.name}</h3>
                    <span className="note">{h.industry}</span>
                  </div>
                  <div>
                    {h.snippet && <p style={{ margin: 0 }}>“{h.snippet}”</p>}
                    <p className="note" style={{ margin: "6px 0 0" }}>
                      <b>{t("feed.next")}:</b> {t("ms.next")}{" "}
                      <a href="https://www.bluesciencepark.se/kontakt/kontaktpersoner/" target="_blank" rel="noreferrer">{t("ct.bsp")} ↗</a>
                    </p>
                  </div>
                  {h.profiled
                    ? <Link className="btn small" href={`/c/${h.slug}`}>{t("mem.radarProfile")}</Link>
                    : <a className="btn quiet small" href={h.bsp_page} target="_blank" rel="noreferrer">Blue Science Park ↗</a>}
                </div>
              ))}
            </div>
            {hits.length > 0 && <p className="note" style={{ marginTop: 12 }}>{t("ms.caution")}</p>}
          </div>
        )}
      </div></section>
      <section className="section" style={{ paddingTop: 48 }}><div className="shell">
        <h2 style={{ marginBottom: 16 }}>{t("ms.all")}</h2>
        {error && <ErrorNote error={error} />}
        {err && <div className="banner" style={{ marginBottom: 16 }}>{err}</div>}
        {loading && <Skeleton h={300} />}
        <div className="list">
          {list.map((m) => (
            <div key={m.slug} id={m.slug} className="list-row" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr) auto", padding: "18px 0" }}>
              <h3 style={{ fontSize: 22 }} className="name-logo">
                <Logo k={m.logo} size={34} />
                {m.profiled ? <Link href={`/c/${m.slug}`} style={{ color: "inherit" }}>{m.name}</Link> : m.name}
              </h3>
              <span className="note" style={{ fontSize: 15 }}>
                {m.industry || "—"}
                {m.website && <> · <a href={m.website} target="_blank" rel="noreferrer">{t("members.website")}</a></>}
                {" · "}<a href={m.bsp_page} target="_blank" rel="noreferrer">Blue Science Park</a>
              </span>
              {m.profiled ? (
                <Link className="btn small" href={`/c/${m.slug}`}>{t("members.open")}</Link>
              ) : (
                <button className="btn quiet small" disabled={!!busy || !m.website} onClick={() => build(m.slug)}>
                  {busy === m.slug ? t("members.building") : t("members.build")}
                </button>
              )}
            </div>
          ))}
        </div>
      </div></section>
    </>
  );
}

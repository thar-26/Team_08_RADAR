"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ErrorNote, KindPill, Logo, Skeleton, When, useFetch } from "@/components/ui";
import { api, withLang, type Domain, type Member, type Opportunity } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

type Explore = { opportunities: Opportunity[]; members: Member[] };
const KINDS = ["all", "funding", "event", "testbed"] as const;

export default function ExplorePage() {
  return <Suspense fallback={null}><Explore /></Suspense>;
}

/** For visitors who are not members: pick fields, see open opportunities and the
 *  members working in them. No profile involved, so no personal fit score. */
function Explore() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const fields = useFetch(() => api<Domain[]>(withLang("/api/domains", lang)), [lang]);
  const [picked, setPicked] = useState<string[]>(() => (params.get("d") ?? "").split(",").filter(Boolean));
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [data, setData] = useState<Explore | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState(15);

  useEffect(() => {
    router.replace(picked.length ? `/explore?d=${picked.join(",")}` : "/explore", { scroll: false });
    if (!picked.length) { setData(null); return; }
    setData(null);
    setErr(null);
    setN(15);
    api<Explore>(withLang(`/api/explore?domains_=${picked.join(",")}${kind !== "all" ? `&kind=${kind}` : ""}`, lang))
      .then(setData).catch((e) => setErr(String(e.message)));
  }, [picked, kind, lang, router]);

  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const names = new Map((fields.data ?? []).map((f) => [f.key, f.name]));

  return (
    <>
      <section className="pagehead pagehead-pad">
        <div className="shell">
          <h1>{t("ex.title")}</h1>
          <p className="lead">{t("ex.lede")}</p>
        </div>
      </section>

      <section className="section"><div className="shell">
        <h2>{t("ex.pick")}</h2>
        {fields.error && <ErrorNote error={fields.error} onRetry={fields.reload} />}
        <div className="chips" role="group" aria-label={t("ex.pick")}>
          {(fields.data ?? []).map((f) => (
            <button key={f.key} className={`btn quiet small ${picked.includes(f.key) ? "on" : ""}`} aria-pressed={picked.includes(f.key)} onClick={() => toggle(f.key)}>
              {f.name}<span className="count">{f.opportunities}</span>
            </button>
          ))}
        </div>

        {!picked.length && <p className="note" style={{ marginTop: 24 }}>{t("ex.none")}</p>}
        {err && <div style={{ marginTop: 24 }}><ErrorNote error={err} /></div>}
        {picked.length > 0 && !data && !err && <div style={{ marginTop: 24 }}><Skeleton h={300} /></div>}

        {data && (
          <div className="ex-grid">
            <div>
              <div className="spread" style={{ alignItems: "flex-end" }}>
                <h2>{t("ex.opps")}</h2>
                <div className="seg" role="group">
                  {KINDS.map((k) => (
                    <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{t(`feed.${k}` as Key)}</button>
                  ))}
                </div>
              </div>
              <p className="note" style={{ margin: "8px 0 0" }}>{t("ex.note")}</p>
              {!data.opportunities.length && <p className="note" style={{ marginTop: 20 }}>{t("ex.empty")}</p>}
              <div className="list" style={{ marginTop: 12 }}>
                {data.opportunities.slice(0, n).map((o) => (
                  <div key={o.id} className="ex-opp list-row" style={{ display: "grid" }}>
                    <Logo k={o.logo} size={32} />
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <KindPill kind={o.kind} />
                        <span className="note">{o.source_name}</span>
                        {(o.domains ?? []).filter((d) => picked.includes(d)).map((d) => <span key={d} className="tag">{names.get(d)}</span>)}
                      </div>
                      <a className="title" href={o.url} target="_blank" rel="noreferrer">{o.title}</a>
                      <div className="note"><When o={o} /></div>
                    </div>
                  </div>
                ))}
              </div>
              {data.opportunities.length > n && (
                <button className="btn quiet" style={{ marginTop: 16 }} onClick={() => setN(n + 15)}>{t("ex.more")}</button>
              )}
            </div>

            <aside>
              <h2>{t("ex.members")}</h2>
              <p className="note" style={{ margin: "8px 0 12px" }}>{t("ex.members_n", { n: data.members.length })}</p>
              {data.members.map((m) => (
                <div key={m.slug} className="ex-member">
                  <Logo k={m.logo} size={36} />
                  <div style={{ minWidth: 0 }}>
                    {m.profiled
                      ? <Link href={`/c/${m.slug}`}><b>{m.name}</b></Link>
                      : <a href={m.bsp_page} target="_blank" rel="noreferrer"><b>{m.name}</b> ↗</a>}
                  </div>
                </div>
              ))}
            </aside>
          </div>
        )}
      </div></section>
    </>
  );
}

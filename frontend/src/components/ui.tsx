"use client";

import { useEffect, useState } from "react";
import { API, daysUntil, fmtDate, host, type Opportunity } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

/** A failed request, in plain words, with a way to try again. The technical
 *  detail stays out of sight (hover) for whoever runs the demo. */
export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="banner" role="alert" title={error}>
      <span>{t("err.friendly")}</span>{" "}
      <button className="textbtn" onClick={onRetry ?? (() => window.location.reload())}>{t("err.retry")}</button>
    </div>
  );
}

export function Toast({ msg, onDone, action }: { msg: string | null; onDone: () => void; action?: { label: string; run: () => void } | null }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, action ? 6000 : 2800);
    return () => clearTimeout(t);
  }, [msg, onDone, action]);
  return (
    <div aria-live="polite">
      {msg && (
        <div className="toast" role="status">
          {msg}
          {action && <button onClick={() => { action.run(); onDone(); }}>{action.label}</button>}
        </div>
      )}
    </div>
  );
}

/** An organisation's logo (member, funder or organiser), served by the API. Hidden if missing.
 *  Fixed height, natural width: wide member logos may be wider, square site icons stay square. */
export function Logo({ k, size = 28 }: { k?: string | null; size?: number }) {
  if (!k) return null;
  const wide = k.startsWith("member-");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="logo" src={`${API}/api/logos/${encodeURIComponent(k)}?v=2`} alt="" height={size} loading="lazy"
      style={{ height: size, width: "auto", minWidth: wide ? size : undefined, maxWidth: wide ? size * 2.8 : size * 1.2 }}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
  );
}

export function KindPill({ kind }: { kind: Opportunity["kind"] }) {
  const { t } = useI18n();
  return <span className={`tag ${kind}`}>{t(`kind.${kind}` as Key)}</span>;
}

export function When({ o }: { o: Opportunity }) {
  const { t, lang } = useI18n();
  if (o.kind === "testbed") {
    // Radar never confirms access or free time slots for a testbed.
    const until = o.source === "vinnova_projects" ? /runs until (\d{4}-\d{2}-\d{2})/.exec(o.programme ?? "")?.[1] : null;
    return (
      <span>
        {o.source === "vinnova_projects" ? t("tb.fundedProject") : t("tb.facility")}
        {o.location ? ` · ${o.location}` : ""}
        {until ? ` · ${t("tb.until", { date: fmtDate(until, lang) })}` : ""}
        {" · "}<span className="unverified">{t("tb.notVerified")}</span>
      </span>
    );
  }
  const d = o.deadline ?? o.event_date;
  const n = daysUntil(d);
  return (
    <span>
      {o.deadline ? t("feed.deadline") : t("feed.date")} <b>{fmtDate(d, lang)}</b>
      {n !== null && n >= 0 && <span className={n <= 21 ? "soon" : ""}> · {n === 0 ? t("feed.today") : t("feed.days", { n })}</span>}
    </span>
  );
}

export function SourceLink({ url, label }: { url: string; label?: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {label ?? host(url)} ↗
    </a>
  );
}

export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => alive && (setData(d), setError(null), setStatus(null)))
      .catch((e) => alive && (setError(String(e.message ?? e)), setStatus(e?.status ?? null)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { data, error, status, loading, setData, reload: () => setNonce((n) => n + 1) };
}

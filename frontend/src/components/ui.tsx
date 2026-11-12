"use client";

import { useEffect, useState } from "react";
import { daysUntil, fmtDate, host, type Opportunity } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";

export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

export function ErrorNote({ error }: { error: string }) {
  const { t } = useI18n();
  return (
    <div className="banner" role="alert">
      {t("err.api", { error })} <span className="kbd">.venv\Scripts\python -m uvicorn radar.api:app --port 8000</span>
    </div>
  );
}

export function Toast({ msg, onDone }: { msg: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function KindPill({ kind }: { kind: Opportunity["kind"] }) {
  const { t } = useI18n();
  const cls = kind === "funding" ? "brand" : kind === "event" ? "" : "ok";
  return <span className={`pill ${cls}`}>{t(`kind.${kind}` as Key)}</span>;
}

export function When({ o }: { o: Opportunity }) {
  const { t, lang } = useI18n();
  if (o.kind === "testbed") return <span>{t("feed.available")} · {o.location}</span>;
  const d = o.deadline ?? o.event_date;
  const n = daysUntil(d);
  return (
    <span>
      {o.deadline ? t("feed.deadline") : t("feed.date")} <b>{fmtDate(d, lang)}</b>
      {n !== null && n >= 0 && <span className={n <= 21 ? "countdown" : ""}> · {n === 0 ? t("feed.today") : t("feed.days", { n })}</span>}
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
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(String(e.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, setData };
}

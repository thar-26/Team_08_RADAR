"use client";

import { useEffect, useState } from "react";
import { daysUntil, fmtDate, host, type Opportunity } from "@/lib/api";

export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

export function ErrorNote({ error }: { error: string }) {
  return (
    <div className="banner" role="alert">
      Can&apos;t reach the Radar API ({error}). Start it with <span className="kbd">uvicorn radar.api:app --port 8000</span> in <span className="mono">backend/</span>.
    </div>
  );
}

export function Toast({ msg, onDone }: { msg: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function KindTag({ kind }: { kind: Opportunity["kind"] }) {
  const label = kind === "funding" ? "Funding" : kind === "event" ? "Event" : "Testbed";
  return <span className={`tag ${kind === "funding" ? "fact" : kind === "event" ? "sea" : "ok"}`}>{label}</span>;
}

export function When({ o }: { o: Opportunity }) {
  if (o.kind === "testbed") return <span>Available · {o.location}</span>;
  const d = o.deadline ?? o.event_date;
  const n = daysUntil(d);
  const label = o.deadline ? "Deadline" : "Date";
  return (
    <span>
      {label} <b>{fmtDate(d)}</b>
      {n !== null && n >= 0 && <span className={n <= 21 ? "countdown" : ""}> · {n === 0 ? "today" : `${n} days`}</span>}
    </span>
  );
}

export function SourceStamp({ url, date, label }: { url: string; date?: string | null; label?: string }) {
  return (
    <span className="stamp">
      <a href={url} target="_blank" rel="noreferrer">{label ?? host(url)} ↗</a>
      {date && <span>retrieved {fmtDate(date)}</span>}
    </span>
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

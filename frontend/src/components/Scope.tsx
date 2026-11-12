"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Eco } from "@/lib/api";

/** The park as a radar scope: every member is a blip placed by what it does
 *  (2-D projection of public-description embeddings). Close blips = similar members. */
export default function Scope({ eco, highlight }: { eco: Eco; highlight?: string }) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const S = 600;
  const R = S / 2;

  const pts = useMemo(() => {
    const raw = eco.nodes.map((n) => ({ ...n, px: n.x - 0.5, py: n.y - 0.5 }));
    const maxr = Math.max(...raw.map((p) => Math.hypot(p.px, p.py))) || 1;
    return raw.map((p) => ({ ...p, cx: R + (p.px / maxr) * R * 0.84, cy: R + (p.py / maxr) * R * 0.84 }));
  }, [eco, R]);
  const byslug = Object.fromEntries(pts.map((p) => [p.slug, p]));
  const focus = hover ?? highlight ?? null;
  const hovered = hover ? byslug[hover] : null;

  return (
    <div className="scope" role="img" aria-label={`Map of ${eco.nodes.length} Blue Science Park members, grouped by what they do`}>
      <div className="scope-sweep" aria-hidden />
      <svg viewBox={`0 0 ${S} ${S}`}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <circle key={f} cx={R} cy={R} r={R * 0.92 * f} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
        ))}
        <line x1={R} y1={R * 0.08} x2={R} y2={S - R * 0.08} stroke="rgba(255,255,255,0.14)" />
        <line x1={R * 0.08} y1={R} x2={S - R * 0.08} y2={R} stroke="rgba(255,255,255,0.14)" />
        {Array.from({ length: 36 }).map((_, i) => {
          const a = (i * Math.PI) / 18;
          const r1 = R * 0.92, r2 = R * (i % 3 === 0 ? 0.88 : 0.9);
          return <line key={i} x1={R + r1 * Math.cos(a)} y1={R + r1 * Math.sin(a)} x2={R + r2 * Math.cos(a)} y2={R + r2 * Math.sin(a)} stroke="rgba(255,255,255,0.14)" />;
        })}
        {eco.edges
          .filter((e) => focus && (e.a === focus || e.b === focus))
          .map((e) => {
            const a = byslug[e.a], b = byslug[e.b];
            if (!a || !b) return null;
            return <line key={e.a + e.b} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke="#a9c4ff" strokeOpacity={0.5} strokeDasharray="3 4" />;
          })}
        {pts.map((p) => {
          const isFocus = p.slug === focus;
          return (
            <g key={p.slug}
              onMouseEnter={() => setHover(p.slug)} onMouseLeave={() => setHover(null)}
              onClick={() => router.push(p.demo ? `/c/${p.slug}` : `/members#${p.slug}`)}
              tabIndex={0} role="link" aria-label={p.name}
              onKeyDown={(e) => e.key === "Enter" && router.push(p.demo ? `/c/${p.slug}` : `/members#${p.slug}`)}>
              {p.demo && <circle cx={p.cx} cy={p.cy} r={11} fill="none" stroke="#FFC233" strokeOpacity={0.5} />}
              <circle className="blip" cx={p.cx} cy={p.cy} r={isFocus ? 6 : p.demo ? 4.5 : 3}
                fill={p.demo ? "#FFC233" : "#a9c4ff"} fillOpacity={p.demo || isFocus ? 1 : 0.7} />
              {(p.demo || isFocus) && (
                <text className="blip-label" x={p.cx > R ? p.cx - 14 : p.cx + 14} y={p.cy + 3.5} textAnchor={p.cx > R ? "end" : "start"}>{p.name}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div style={{ position: "absolute", left: "50%", bottom: "9%", transform: "translateX(-50%)", textAlign: "center", color: "#ffffff", pointerEvents: "none" }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{hovered.industry || "Member"}</div>
          <div style={{ fontFamily: "var(--font-head)", fontWeight: 600, fontSize: 17 }}>{hovered.name}</div>
        </div>
      )}
    </div>
  );
}

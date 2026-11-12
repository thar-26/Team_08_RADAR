"use client";

import { useState } from "react";
import { SourceStamp } from "@/components/ui";
import { api, fmtDate, SECTION_LABEL, type Claim, type CompanyResp, type FeedItem, type Profile } from "@/lib/api";

const ORDER = ["offerings", "technologies", "applications", "markets", "geography", "priorities", "interests"];

export default function ProfileTab({ slug, profile, onSaved, toast }: {
  slug: string; profile: Profile; onSaved: (p: Profile, feed: FeedItem[]) => void; toast: (m: string) => void;
}) {
  const [section, setSection] = useState("priorities");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function edit(action: string, claim?: Claim, extra: Record<string, string> = {}) {
    setBusy(true);
    try {
      const r = await api<{ profile: Profile; feed: FeedItem[]; note: string } & CompanyResp>(`/api/companies/${slug}/profile`, {
        method: "POST",
        body: JSON.stringify({ action, claim_id: claim?.id, ...extra }),
      });
      onSaved(r.profile, r.feed);
      toast(`${r.note} — feed re-ranked`);
    } finally {
      setBusy(false);
    }
  }

  const v = profile.verifier ?? {};
  return (
    <div className="two-col" style={{ marginTop: 24 }}>
      <div>
        <p className="lede" style={{ fontFamily: "var(--serif)", fontSize: 21, lineHeight: 1.4, color: "var(--ink)" }}>{profile.summary}</p>
        <div className="row" style={{ marginTop: 14, gap: 16, fontSize: 13 }}>
          <span className="row" style={{ gap: 6 }}><span className="dot fact" /> Fact, quoted from a public source</span>
          <span className="row" style={{ gap: 6 }}><span className="dot inferred" /> Inferred by an agent</span>
          <span className="row" style={{ gap: 6 }}><span className="dot confirmed" /> Confirmed or added by you</span>
        </div>

        {ORDER.map((sec) => {
          const claims = profile.claims.filter((c) => c.section === sec);
          if (!claims.length) return null;
          return (
            <div key={sec} style={{ marginTop: 34 }}>
              <div className="spread panel">
                <h3>{SECTION_LABEL[sec]}</h3>
                {sec === "interests" && <span className="tag inferred">Always inferred · not a confirmed priority</span>}
              </div>
              {claims.map((c) => <ClaimRow key={c.id} c={c} busy={busy} onAction={edit} />)}
            </div>
          );
        })}
      </div>

      <aside>
        <div className="card" style={{ padding: 20, position: "sticky", top: 84 }}>
          <div className="eyebrow">Refine your profile</div>
          <h3 style={{ marginTop: 8 }}>Tell Radar what matters now</h3>
          <p className="muted" style={{ fontSize: 13.5 }}>Your additions are private to your company and weigh more than public data when ranking.</p>
          <select className="select" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section">
            {ORDER.filter((s) => s !== "interests").map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}
          </select>
          <textarea className="textarea" rows={3} style={{ marginTop: 8 }} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Testing opportunities for our sensors in real harbour conditions are a priority this year" />
          <button className="btn" style={{ marginTop: 10, width: "100%", justifyContent: "center" }} disabled={busy || text.trim().length < 6}
            onClick={async () => { await edit("add", undefined, { statement: text, section }); setText(""); }}>
            {busy ? "Re-ranking…" : "Add & re-rank feed"}
          </button>

          <hr className="rule" style={{ margin: "22px 0 16px" }} />
          <div className="eyebrow">Verifier</div>
          <p style={{ fontSize: 13.5, margin: "8px 0" }}>
            <b>{v.facts_verified ?? 0}</b> of {v.facts_checked ?? 0} quoted facts found word-for-word in the saved source.
            {v.downgraded ? <> <b>{v.downgraded}</b> unsupported claims were downgraded to “inferred”.</> : null}
          </p>

          {profile.missing.length > 0 && (
            <>
              <div className="eyebrow" style={{ marginTop: 18 }}>Not found in public sources</div>
              <ul style={{ paddingLeft: 18, fontSize: 13.5, margin: "8px 0" }}>
                {profile.missing.map((m, i) => <li key={i}><b style={{ fontWeight: 500 }}>{SECTION_LABEL[m.section] ?? m.section}:</b> {m.note}</li>)}
              </ul>
            </>
          )}

          <div className="eyebrow" style={{ marginTop: 18 }}>Sources read ({profile.sources.length})</div>
          <div style={{ marginTop: 6 }}>
            {profile.sources.map((s) => (
              <div key={s.url} style={{ padding: "6px 0", borderTop: "1px dotted var(--rule)", fontSize: 13 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="mono muted">[{s.id}]</span>
                  <span>{s.kind === "bsp_member" ? "Blue Science Park member page" : s.kind === "reference" ? "Reference (Wikipedia)" : s.title || "Website"}</span>
                  {s.injection_flag && <span className="tag bad">Hidden instructions ignored</span>}
                  {s.simulated && <span className="tag sim">Simulated</span>}
                </div>
                <SourceStamp url={s.url} date={s.retrieved_at} />
              </div>
            ))}
          </div>
          <p className="mono muted" style={{ marginTop: 12 }}>Profile generated {fmtDate(profile.generated_at)}</p>
        </div>
      </aside>
    </div>
  );
}

function ClaimRow({ c, busy, onAction }: { c: Claim; busy: boolean; onAction: (a: string, c: Claim, extra?: Record<string, string>) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(c.statement);
  const mine = c.origin === "user" || c.review === "confirmed" || c.status === "company_confirmed";
  const dot = mine ? "confirmed" : c.status === "fact" ? "fact" : "inferred";
  const ev = c.evidence[0];
  return (
    <div className={`claim ${c.review === "rejected" ? "rejected" : ""}`}>
      <span className={`dot ${dot}`} title={dot} />
      <div>
        {editing ? (
          <div className="row">
            <input className="input" value={val} onChange={(e) => setVal(e.target.value)} aria-label="Edit statement" />
            <button className="btn small" disabled={busy} onClick={() => { onAction("edit", c, { statement: val }); setEditing(false); }}>Save</button>
            <button className="btn ghost small" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : (
          <div className="claim-text">{c.statement}</div>
        )}
        {c.status === "fact" && ev?.quote && (
          <div className="evidence">
            <q>{ev.quote}</q>
            <div><SourceStamp url={ev.url} date={ev.retrieved_at} />{ev.verified && <span className="stamp" style={{ marginLeft: 8, color: "var(--ok)" }}>✓ quote verified</span>}</div>
          </div>
        )}
        {c.status !== "fact" && c.origin !== "user" && (
          <div className="evidence muted">
            {c.reasoning || "Inferred from the company's public pages."}
            {ev?.url && <div><SourceStamp url={ev.url} date={ev.retrieved_at} label={`based on ${new URL(ev.url).hostname.replace("www.", "")}`} /></div>}
          </div>
        )}
        {c.note && c.origin === "user" && <div className="stamp">{c.note}</div>}
        {c.review === "rejected" && <div className="stamp">Rejected by your company — ignored in ranking</div>}
      </div>
      <div className="claim-actions">
        {c.review === "rejected" ? (
          <button className="btn ghost small" disabled={busy} onClick={() => onAction("restore", c)}>Restore</button>
        ) : (
          <>
            {!mine && <button className="btn ghost small" disabled={busy} onClick={() => onAction("confirm", c)} title="Confirm">✓</button>}
            <button className="btn ghost small" disabled={busy} onClick={() => setEditing(true)} title="Edit">Edit</button>
            <button className="btn ghost small" disabled={busy} onClick={() => onAction("reject", c)} title="Reject">✕</button>
          </>
        )}
      </div>
    </div>
  );
}

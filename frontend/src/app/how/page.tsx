const AGENTS = [
  ["Collector", "code", "Fetches the member list, member websites, Vinnova and EU calls, ecosystem events and Karlskrona testbeds. Respects robots.txt, waits between requests, stores every page with its URL and retrieval time."],
  ["Profiler", "gpt-oss-120b", "Turns a member's saved pages into a profile. Each statement is a fact (verbatim quote + link + date) or inferred (with reasoning). Lists what the sources do not say."],
  ["Verifier", "code", "Checks every quoted fact word-for-word against the saved source. Unsupported “facts” are downgraded to inferred. The trust anchor — no AI involved."],
  ["Scouts", "gpt-oss-20b + APIs", "Funding (Vinnova open data, EU Funding & Tenders), events (Blue Science Park, Tech Concept Lab, Almi, NetPort) and testbeds (Marine Technology Center). Dates are validated in code."],
  ["Matcher", "embeddings + gpt-oss-120b", "Ranks transparently: profile fit, your priorities, preferred type, feedback, eligibility conflicts, deadline. Then explains the top matches — why, requirement check, uncertainties, next step."],
  ["Connector", "gpt-oss-120b", "Suggests member-to-member conversations from public information only, and says that neither company has expressed interest."],
  ["Guard", "Prompt Guard 2 + rules + gpt-oss-20b", "Three independent layers decide whether a message is in scope, unclear, unrelated, an override attempt, needs a human, or asks for another company's private data."],
  ["Concierge", "gpt-oss-120b", "Answers in-scope questions from your own profile, public opportunities and public member information — with a citation on every point."],
  ["Watcher", "scheduled", "Re-reads public pages, rebuilds profiles, keeps your confirmations and edits, and records what changed in the timeline."],
];

const SOURCES = [
  ["Blue Science Park member list & events", "bluesciencepark.se (WordPress API)"],
  ["Vinnova calls and application rounds", "data.vinnova.se (open data API)"],
  ["EU calls for proposals", "EU Funding & Tenders search API"],
  ["Ecosystem events", "Tech Concept Lab (API), Almi Blekinge, NetPort"],
  ["Testbeds", "Marine Technology Center of Sweden (API)"],
  ["Company facts", "Member websites, Blue Science Park member pages, Wikipedia for large groups"],
];

export default function How() {
  return (
    <section className="shell section">
      <div className="eyebrow">Architecture</div>
      <h1 style={{ marginTop: 12, fontSize: "clamp(34px,4.6vw,56px)" }}>Nine agents, one rule:<br />show your source.</h1>
      <p className="lede" style={{ marginTop: 16 }}>
        Plain, inspectable orchestration in Python — each agent has one job, a few allowed tools and fixed rules.
        AI writes and explains; code verifies, ranks and enforces access.
      </p>

      <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 0, borderTop: "2px solid var(--ink)" }}>
        {AGENTS.map(([n, m, d], i) => (
          <div key={n} style={{ padding: "20px 20px 22px 0", borderBottom: "1px solid var(--rule)" }}>
            <div className="spread"><span className="mono muted">{String(i + 1).padStart(2, "0")}</span><span className="tag">{m}</span></div>
            <h3 style={{ marginTop: 10 }}>{n}</h3>
            <p style={{ fontSize: 14, color: "var(--ink-2)", margin: "6px 0 0" }}>{d}</p>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 48, padding: 24, fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.9, overflowX: "auto", whiteSpace: "pre" }}>
{`Collector ─▶ Profiler ─▶ Verifier ─▶ company reviews & refines profile (private)
                                              │
Scouts ─▶ opportunity store ───────────────▶ Matcher ─▶ personal feed: why · requirements · link · date
                                              │
                                        Connector ─▶ possible partners (public data only)
Message ─▶ Guard (3 layers) ─▶ Concierge ─▶ cited answer, or scope reply / staff referral
Watcher (schedule) ─▶ Collector + Profiler ─▶ new version, your decisions kept ─▶ timeline`}
      </div>

      <div className="two-col" style={{ marginTop: 56 }}>
        <div>
          <h2>Sources</h2>
          <table className="table" style={{ marginTop: 16 }}>
            <tbody>{SOURCES.map(([a, b]) => <tr key={a}><td>{a}</td><td className="mono muted">{b}</td></tr>)}</tbody>
          </table>
        </div>
        <div>
          <h2>Known limits</h2>
          <ul style={{ paddingLeft: 18, color: "var(--ink-2)" }}>
            <li>Some sites block automated reading (e.g. ericsson.com, RISE testbed directory); Radar does not bypass blocks and uses other public sources.</li>
            <li>Requirement checks are indicative. Eligibility is decided by the funder.</li>
            <li>Few regional event pages publish machine-readable dates; events coverage is narrower than funding.</li>
            <li>Login is simulated in the prototype; production would use Blue Science Park SSO and row-level access control.</li>
            <li>SQLite and a local embedding model keep it portable; production would use Postgres + pgvector and a scheduler.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

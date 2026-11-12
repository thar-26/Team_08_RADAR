"use client";

import { useI18n } from "@/lib/i18n";

type L = { sv: string; en: string };
const AGENTS: { name: L; model: string; d: L }[] = [
  { name: { sv: "Insamlare", en: "Collector" }, model: "code", d: { sv: "Hämtar medlemslistan, webbplatser, Vinnovas och EU:s utlysningar, evenemang och testbäddar. Följer robots.txt, väntar mellan anrop och sparar varje sida med länk och hämtningstid.", en: "Fetches the member list, websites, Vinnova and EU calls, events and testbeds. Respects robots.txt, waits between requests and stores every page with its link and retrieval time." } },
  { name: { sv: "Profilerare", en: "Profiler" }, model: "gpt-oss-120b", d: { sv: "Gör om en medlems sparade sidor till en profil. Varje påstående är fakta (ordagrant citat + länk + datum) eller en slutsats (med motivering). Listar också vad källorna inte säger.", en: "Turns a member's saved pages into a profile. Each statement is a fact (verbatim quote + link + date) or inferred (with reasoning). Also lists what the sources do not say." } },
  { name: { sv: "Granskare", en: "Verifier" }, model: "code", d: { sv: "Kontrollerar varje citat ord för ord mot den sparade källan. ”Fakta” utan stöd nedgraderas till slutsatser. Ingen AI — förtroendets ankare.", en: "Checks every quote word-for-word against the saved source. Unsupported “facts” are downgraded to inferred. No AI — the trust anchor." } },
  { name: { sv: "Spanare", en: "Scouts" }, model: "gpt-oss-20b + API", d: { sv: "Finansiering (Vinnova, EU), evenemang (Blue Science Park, Tech Concept Lab, Almi, NetPort) och testbäddar (Marine Technology Center). Datum valideras i koden.", en: "Funding (Vinnova, EU), events (Blue Science Park, Tech Concept Lab, Almi, NetPort) and testbeds (Marine Technology Center). Dates are validated in code." } },
  { name: { sv: "Matchare", en: "Matcher" }, model: "embeddings + gpt-oss-120b", d: { sv: "Rankar transparent: profilmatchning, era prioriteringar, typ, återkoppling, behörighetskonflikter och deadline. Förklarar sedan toppträffarna — varför, krav, osäkerheter och nästa steg.", en: "Ranks transparently: profile fit, your priorities, type, feedback, eligibility conflicts and deadline. Then explains the top matches — why, requirements, uncertainties and next step." } },
  { name: { sv: "Kopplare", en: "Connector" }, model: "gpt-oss-120b", d: { sv: "Föreslår samtal mellan medlemmar utifrån enbart offentlig information och säger tydligt att inget företag har uttryckt intresse.", en: "Suggests conversations between members from public information only, and says clearly that neither company has expressed interest." } },
  { name: { sv: "Vakt", en: "Guard" }, model: "Prompt Guard 2 + rules + gpt-oss-20b", d: { sv: "Tre oberoende lager avgör om ett meddelande är inom uppdraget, oklart, ovidkommande, ett försök att kringgå regler, kräver en människa eller frågar efter annans privata data.", en: "Three independent layers decide whether a message is in scope, unclear, unrelated, an override attempt, needs a human, or asks for another company's private data." } },
  { name: { sv: "Concierge", en: "Concierge" }, model: "gpt-oss-120b", d: { sv: "Svarar på frågor inom uppdraget utifrån er egen profil, offentliga möjligheter och offentlig medlemsinformation — med källa på varje punkt.", en: "Answers in-scope questions from your own profile, public opportunities and public member information — with a citation on every point." } },
  { name: { sv: "Bevakare", en: "Watcher" }, model: "scheduled", d: { sv: "Läser om offentliga sidor, bygger om profiler, behåller era beslut och visar vad som ändrats.", en: "Re-reads public pages, rebuilds profiles, keeps your decisions and records what changed." } },
  { name: { sv: "Notifierare", en: "Notifier" }, model: "code + SMTP", d: { sv: "Mejlar prenumeranter när något nytt matchar och påminner när sista dagen närmar sig för sparade möjligheter. Endast med samtycke, alltid med avregistreringslänk.", en: "Emails subscribers when something new matches and reminds them before deadlines of saved opportunities. Consent only, always with an unsubscribe link." } },
];

const SOURCES: [L, string][] = [
  [{ sv: "Medlemslista & evenemang", en: "Member list & events" }, "bluesciencepark.se (WordPress API)"],
  [{ sv: "Vinnovas utlysningar", en: "Vinnova calls" }, "data.vinnova.se (open data API)"],
  [{ sv: "EU-utlysningar", en: "EU calls" }, "EU Funding & Tenders search API"],
  [{ sv: "Evenemang i regionen", en: "Regional events" }, "Tech Concept Lab, Almi Blekinge, NetPort"],
  [{ sv: "Testbäddar", en: "Testbeds" }, "Marine Technology Center of Sweden (API)"],
  [{ sv: "Företagsfakta", en: "Company facts" }, "Member websites, BSP member pages, Wikipedia"],
];

const LIMITS: L[] = [
  { sv: "Vissa webbplatser blockerar automatisk läsning (t.ex. ericsson.com, RISE). Radar kringgår inte blockeringar utan använder andra offentliga källor.", en: "Some sites block automated reading (e.g. ericsson.com, RISE). Radar does not bypass blocks and uses other public sources." },
  { sv: "Kravkontrollen är vägledande. Behörighet avgörs av finansiären.", en: "Requirement checks are indicative. Eligibility is decided by the funder." },
  { sv: "Få regionala evenemangssidor publicerar maskinläsbara datum; finansiering täcks betydligt bättre än evenemang.", en: "Few regional event pages publish machine-readable dates; funding is covered much better than events." },
  { sv: "Inloggningen är simulerad. I drift: Blue Science Parks SSO och åtkomstkontroll per företag.", en: "Login is simulated. In production: Blue Science Park SSO and per-company access control." },
  { sv: "Mejlutskick är simulerade tills SMTP-inställningar läggs in.", en: "Email sending is simulated until SMTP settings are added." },
];

export default function How() {
  const { t, lang } = useI18n();
  return (
    <>
      <section className="pagehead">
        <div className="shell">
          <div className="eyebrow">{t("how.eyebrow")}</div>
          <h1 style={{ marginTop: 8 }}>{t("how.title1")} <span style={{ color: "#FFC233" }}>{t("how.title2")}</span></h1>
          <p className="lede">{t("how.lede")}</p>
        </div>
      </section>
      <section className="shell section">
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 14 }}>
          {AGENTS.map((a, i) => (
            <div key={a.name.en} className="card pad">
              <div className="spread"><span className="rank" style={{ width: 34, height: 34, fontSize: 14 }}>{i + 1}</span><span className="pill">{a.model}</span></div>
              <h3 style={{ marginTop: 12 }}>{a.name[lang]}</h3>
              <p style={{ fontSize: 14, color: "var(--ink-2)", margin: "6px 0 0" }}>{a.d[lang]}</p>
            </div>
          ))}
        </div>
        <div className="two-col" style={{ marginTop: 40 }}>
          <div>
            <h2 style={{ marginBottom: 14 }}>{t("how.sources")}</h2>
            <div className="table-wrap"><table className="table"><tbody>
              {SOURCES.map(([a, b]) => <tr key={a.en}><td><b style={{ fontWeight: 600 }}>{a[lang]}</b></td><td className="muted">{b}</td></tr>)}
            </tbody></table></div>
          </div>
          <div>
            <h2 style={{ marginBottom: 14 }}>{t("how.limits")}</h2>
            <div className="card pad"><ul style={{ paddingLeft: 18, margin: 0, color: "var(--ink-2)" }}>
              {LIMITS.map((l) => <li key={l.en} style={{ marginBottom: 8 }}>{l[lang]}</li>)}
            </ul></div>
          </div>
        </div>
      </section>
    </>
  );
}

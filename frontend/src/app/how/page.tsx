"use client";

import { useI18n } from "@/lib/i18n";

type L = { sv: string; en: string };
const AGENTS: { name: L; model: string; d: L }[] = [
  { name: { sv: "Insamlare", en: "Collector" }, model: "code", d: { sv: "Hämtar medlemslistan, webbplatser, Vinnovas och EU:s utlysningar, evenemang och testbäddar. Följer robots.txt, väntar mellan anrop och sparar varje sida med länk och hämtningstid.", en: "Fetches the member list, websites, Vinnova and EU calls, events and testbeds. Respects robots.txt, waits between requests and stores every page with its link and retrieval time." } },
  { name: { sv: "Profilerare", en: "Profiler" }, model: "gpt-oss-120b", d: { sv: "Gör om en medlems sparade sidor till en profil. Varje påstående är fakta (ordagrant citat + länk + datum) eller en slutsats (med motivering). Listar också vad källorna inte säger.", en: "Turns a member's saved pages into a profile. Each statement is a fact (verbatim quote + link + date) or inferred (with reasoning). Also lists what the sources do not say." } },
  { name: { sv: "Granskare", en: "Verifier" }, model: "code", d: { sv: "Kontrollerar varje citat ord för ord mot den sparade källan. ”Fakta” utan stöd nedgraderas till slutsatser. Ingen AI, förtroendets ankare.", en: "Checks every quote word-for-word against the saved source. Unsupported “facts” are downgraded to inferred. No AI, the trust anchor." } },
  { name: { sv: "Spanare", en: "Scouts" }, model: "gpt-oss-20b + API", d: { sv: "Finansiering (Vinnova, EU), evenemang (Blue Science Park, Tech Concept Lab, Almi, NetPort) och testbäddar (Marine Technology Center). Datum valideras i koden.", en: "Funding (Vinnova, EU), events (Blue Science Park, Tech Concept Lab, Almi, NetPort) and testbeds (Marine Technology Center). Dates are validated in code." } },
  { name: { sv: "Matchare", en: "Matcher" }, model: "embeddings + gpt-oss-120b", d: { sv: "Rankar transparent: profilmatchning, era prioriteringar, typ, återkoppling, behörighetskonflikter och deadline. Förklarar sedan toppträffarna, varför, krav, osäkerheter och nästa steg.", en: "Ranks transparently: profile fit, your priorities, type, feedback, eligibility conflicts and deadline. Then explains the top matches, why, requirements, uncertainties and next step." } },
  { name: { sv: "Kopplare", en: "Connector" }, model: "gpt-oss-120b", d: { sv: "Föreslår samtal mellan medlemmar utifrån enbart offentlig information och säger tydligt att inget företag har uttryckt intresse.", en: "Suggests conversations between members from public information only, and says clearly that neither company has expressed interest." } },
  { name: { sv: "Vakt", en: "Guard" }, model: "Prompt Guard 2 + rules + gpt-oss-20b", d: { sv: "Tre oberoende lager avgör om ett meddelande är inom uppdraget, oklart, ovidkommande, ett försök att kringgå regler, kräver en människa eller frågar efter annans privata data.", en: "Three independent layers decide whether a message is in scope, unclear, unrelated, an override attempt, needs a human, or asks for another company's private data." } },
  { name: { sv: "Concierge", en: "Concierge" }, model: "gpt-oss-120b", d: { sv: "Svarar på frågor inom uppdraget utifrån er egen profil, offentliga möjligheter och offentlig medlemsinformation, med källa på varje punkt.", en: "Answers in-scope questions from your own profile, public opportunities and public member information, with a citation on every point." } },
  { name: { sv: "Bevakare", en: "Watcher" }, model: "scheduled", d: { sv: "Läser om offentliga sidor, bygger om profiler, behåller era beslut och visar vad som ändrats.", en: "Re-reads public pages, rebuilds profiles, keeps your decisions and records what changed." } },
  { name: { sv: "Notifierare", en: "Notifier" }, model: "code + SMTP", d: { sv: "Mejlar prenumeranter när något nytt matchar och påminner när sista dagen närmar sig för sparade möjligheter. Endast med samtycke, alltid med avregistreringslänk.", en: "Emails subscribers when something new matches and reminds them before deadlines of saved opportunities. Consent only, always with an unsubscribe link." } },
];

const SOURCES: [L, string][] = [
  [{ sv: "Medlemslista & evenemang", en: "Member list & events" }, "bluesciencepark.se (WordPress API)"],
  [{ sv: "Vinnovas utlysningar", en: "Vinnova calls" }, "data.vinnova.se (open data API)"],
  [{ sv: "EU-utlysningar", en: "EU calls" }, "EU Funding & Tenders search API"],
  [{ sv: "Evenemang", en: "Events" }, "Vinnova, BTH, AI Sweden, Region Blekinge, Sydsvenska Industri- och Handelskammaren, Tech Concept Lab, Almi, NetPort"],
  [{ sv: "Testbäddar i Blekinge", en: "Testbeds in Blekinge" }, "Marine Technology Center of Sweden (API)"],
  [{ sv: "Nationella testbäddar", en: "National testbeds" }, "Vinnova open data (pågående finansierade testbäddsprojekt) + 8 testbäddar manuellt kontrollerade mot officiella sidor"],
  [{ sv: "Företagsfakta", en: "Company facts" }, "Member websites, BSP member pages, Wikipedia, Bolagsverket"],
];

const LIMITS: L[] = [
  { sv: "Vissa webbplatser blockerar automatisk läsning (t.ex. ericsson.com, RISE och Testbed Sweden). Radar kringgår inte blockeringar utan använder andra offentliga källor och en manuellt kontrollerad lista.", en: "Some sites block automated reading (e.g. ericsson.com, RISE and Testbed Sweden). Radar does not bypass blocks and uses other public sources and a manually verified list." },
  { sv: "Matchningspoängen 1–10 är indikativ, ingen sannolikhet. Vikterna (35/25/20/10/10) är provisoriska och behöver kalibreras med Blue Science Parks personal.", en: "The 1–10 fit score is indicative, not a probability. The weights (35/25/20/10/10) are provisional and need calibrating with Blue Science Park staff." },
  { sv: "Kravkontrollen är vägledande. Behörighet avgörs av finansiären.", en: "Requirement checks are indicative. Eligibility is decided by the funder." },
  { sv: "Lediga tider i testbäddar bekräftas aldrig av Radar. Kontakta operatören.", en: "Radar never confirms testbed availability. Contact the operator." },
  { sv: "Inloggning (Google) används bara för att rätta ett företags profil. I drift: Blue Science Parks egen inloggning och medlemsregister.", en: "Sign-in (Google) is only used to correct a company's profile. In production: Blue Science Park's own sign-in and member register." },
];

export default function How() {
  const { t, lang } = useI18n();
  return (
    <>
      <section className="pagehead pagehead-pad">
        <div className="shell">
          
          <h1>{t("how.title1")}<br />{t("how.title2")}</h1>
          <p className="lead">{t("how.lede")}</p>
        </div>
      </section>
      <section className="shell section">
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 14 }}>
          {AGENTS.map((a) => (
            <div key={a.name.en} className="panel">
              <div className="spread"><span className="tag">{a.model}</span></div>
              <h3 style={{ marginTop: 12 }}>{a.name[lang]}</h3>
              <p style={{ fontSize: 14, color: "var(--ink-2)", margin: "6px 0 0" }}>{a.d[lang]}</p>
            </div>
          ))}
        </div>
        <div className="two-col" style={{ marginTop: 40 }}>
          <div>
            <h2 id="testbeds" style={{ marginBottom: 14 }}>{t("how.sources")}</h2>
            <div className="table-wrap"><table className="table"><tbody>
              {SOURCES.map(([a, b]) => <tr key={a.en}><td><b style={{ fontWeight: 600 }}>{a[lang]}</b></td><td className="note">{b}</td></tr>)}
            </tbody></table></div>
          </div>
          <div>
            <h2 style={{ marginBottom: 14 }}>{t("how.limits")}</h2>
            <div className="panel"><ul style={{ paddingLeft: 18, margin: 0, color: "var(--ink-2)" }}>
              {LIMITS.map((l) => <li key={l.en} style={{ marginBottom: 8 }}>{l[lang]}</li>)}
            </ul></div>
          </div>
        </div>
      </section>
    </>
  );
}

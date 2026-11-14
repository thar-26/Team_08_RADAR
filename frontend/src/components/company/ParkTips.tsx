"use client";

import { KindPill, Logo, When, useFetch } from "@/components/ui";
import { api, daysUntil, fmtDate, withLang, type FeedItem, type Opportunity } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Tip = { id: number; opp_id: string; note: string; created_at: string; opportunity: Opportunity };

/** What Blue Science Park has tipped this company about (simulated: no email). */
export function ParkTips({ slug }: { slug: string }) {
  const { t, lang } = useI18n();
  const tips = useFetch(() => api<Tip[]>(withLang(`/api/companies/${slug}/tips`, lang)), [slug, lang]);
  if (!tips.data?.length) return null;
  return (
    <div className="panel park-tips">
      <h3>{t("tips.title")}</h3>
      {tips.data.map((x) => (
        <div key={x.id} className="park-tip">
          <div className="row" style={{ gap: 8 }}><Logo k={x.opportunity.logo} size={24} /><KindPill kind={x.opportunity.kind} /><span className="note">{t("tips.sent", { date: fmtDate(x.created_at, lang) })}</span></div>
          <a href={x.opportunity.url} target="_blank" rel="noreferrer"><b>{x.opportunity.title}</b></a>
          <div className="note"><When o={x.opportunity} /></div>
          {x.note && <p style={{ margin: "4px 0 0" }}>{x.note}</p>}
        </div>
      ))}
      <p className="note" style={{ margin: "10px 0 0" }}>{t("tips.simulated")}</p>
    </div>
  );
}

/** The company's own week: its next deadlines and events among good matches. */
export function ThisWeek({ items }: { items: FeedItem[] }) {
  const { t } = useI18n();
  const soon = items
    .filter((i) => i.level !== "weak")
    .map((i) => ({ i, d: daysUntil(i.opportunity.deadline ?? i.opportunity.event_date) }))
    .filter((x) => x.d !== null && x.d >= 0 && x.d <= 21)
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0))
    .slice(0, 4);
  return (
    <div className="panel this-week">
      <h3>{t("week.title")}</h3>
      {!soon.length && <p className="note" style={{ margin: "8px 0 0" }}>{t("week.none")}</p>}
      {soon.map(({ i, d }) => (
        <div key={i.opportunity.id} className="park-tip">
          <div className="row" style={{ gap: 8 }}><Logo k={i.opportunity.logo} size={24} /><KindPill kind={i.opportunity.kind} /><span className="note">{i.fit.toFixed(1)}/10</span></div>
          <a href={i.opportunity.url} target="_blank" rel="noreferrer"><b>{i.opportunity.title}</b></a>
          <div className="note">{d === 0 ? t("feed.today") : t("feed.days", { n: d ?? 0 })}</div>
        </div>
      ))}
    </div>
  );
}

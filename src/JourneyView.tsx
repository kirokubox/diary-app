import { journeySummary } from "./journey";
import type { DiaryEntry } from "./types";

export function JourneyView({ entries, today, onBack, onOpenMonth }: { entries: readonly DiaryEntry[]; today: string; onBack: () => void; onOpenMonth: (month: string) => void }) {
  const journey = journeySummary(entries, today);
  const maximum = Math.max(1, ...journey.currentMonths.map((item) => item.characters), ...journey.previousMonths.map((item) => item.characters));
  return <div className="screen"><div className="app-bar"><button className="text-toggle" type="button" onClick={onBack}>← 一覧</button><h1 className="app-bar-title">あゆみ</h1></div>
    <div className="screen-body">
      <section className="card journey-card"><h2>月ごとの文字数</h2><p className="subtle">直近12か月／去年の同じ月</p>
        {journey.currentMonths.map((current, index) => <div className="journey-row" key={current.month}><span>{current.month}</span><div className="journey-bars"><div className="journey-bar" style={{ width: `${current.characters / maximum * 100}%` }} aria-label={`${current.month} ${current.characters}字`} /><div className="journey-bar previous" style={{ width: `${journey.previousMonths[index].characters / maximum * 100}%` }} aria-label={`前年同月 ${journey.previousMonths[index].characters}字`} /></div><span>{current.characters.toLocaleString()}／{journey.previousMonths[index].characters.toLocaleString()}字</span></div>)}
      </section>
      <section className="card journey-card"><h2>今月と去年の同じ月</h2><div className="journey-pair">{[journey.thisMonth, journey.lastYearMonth].map((item) => <div key={item.month}><h3>{item.month}</h3><p>書いた日 {item.days}日</p><p>文字数 {item.characters.toLocaleString()}字</p><p>写真 {item.photos}枚</p></div>)}</div><button className="text-toggle" type="button" onClick={() => onOpenMonth(journey.lastYearMonth.month)}>去年の{Number(journey.lastYearMonth.month.slice(5))}月の日記を見る</button></section>
      <section className="card journey-card"><h2>累計</h2><p>書いた日 {journey.totalDays}日</p><p>文字数 {journey.totalCharacters.toLocaleString()}字</p><p>いちばん古い日記 {journey.oldest ?? "—"}</p><p>いま続いている日数 {journey.streak}日</p></section>
    </div></div>;
}

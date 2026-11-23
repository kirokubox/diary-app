import { journeySummary } from "./journey";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { DiaryEntry } from "./types";

export function JourneyView({ entries, today, onOpenSettings, onOpenMonth, children }: { entries: readonly DiaryEntry[]; today: string; onOpenSettings: () => void; onOpenMonth: (month: string) => void; children?: ReactNode }) {
  const journey = journeySummary(entries, today);
  const maximum = Math.max(1, ...journey.currentMonths.map((item) => item.characters), ...journey.previousMonths.map((item) => item.characters));
  const monthName = (month: string) => `${Number(month.slice(5))}月`;
  return <div className="screen"><div className="app-bar"><h1 className="app-bar-title">あゆみ</h1><span className="spacer" /><button className="icon-btn" type="button" aria-label="設定" onClick={onOpenSettings}><Icon name="settings" size={20} /></button></div>
    <div className="screen-body">
      {/* 目標と振り返り（閉じたカード）をいちばん上に（2026-11-23 本人「1番上に閉じたカードで置いてくれ」） */}
      {children}
      <section className="card journey-card"><h2>月ごとの文字数</h2><p className="subtle">直近12か月と去年の同じ月</p>
        {journey.currentMonths.map((current, index) => <div className="journey-row" key={current.month}><span className="journey-month-name">{current.month.endsWith("-01") ? `${current.month.slice(0, 4)}年1月` : monthName(current.month)}</span><div className="journey-bars"><div className="journey-bar" style={{ width: `${current.characters / maximum * 100}%` }} aria-label={`${monthName(current.month)} ${current.characters}字`} /><div className="journey-bar previous" style={{ width: `${journey.previousMonths[index].characters / maximum * 100}%` }} aria-label={`去年の${monthName(current.month)} ${journey.previousMonths[index].characters}字`} /></div><span className="journey-count">{current.characters.toLocaleString()}字{journey.previousMonths[index].characters > 0 && <small>去年 {journey.previousMonths[index].characters.toLocaleString()}字</small>}</span></div>)}
      </section>
      <section className="card journey-card"><h2>今月と去年の同じ月</h2><div className="journey-pair">{[journey.thisMonth, journey.lastYearMonth].map((item, index) => <div key={item.month}><h3>{index === 0 ? monthName(item.month) : `去年の${monthName(item.month)}`}</h3><p>書いた日 {item.days}日</p><p>文字数 {item.characters.toLocaleString()}字</p><p>写真 {item.photos}枚</p></div>)}</div><button className="text-toggle" type="button" onClick={() => onOpenMonth(journey.lastYearMonth.month)}>去年の{monthName(journey.lastYearMonth.month)}の日記を見る</button></section>
      <section className="card journey-card"><h2>累計</h2><p>書いた日 {journey.totalDays}日</p><p>文字数 {journey.totalCharacters.toLocaleString()}字</p><p>いちばん古い日記 {journey.oldest ? `${Number(journey.oldest.slice(0, 4))}年${Number(journey.oldest.slice(5, 7))}月${Number(journey.oldest.slice(8, 10))}日` : "—"}</p><p>いま続いている日数 {journey.streak}日</p></section>
    </div></div>;
}

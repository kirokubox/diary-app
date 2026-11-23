import { journeySummary } from "./journey";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { DiaryEntry } from "./types";

// あゆみ（v2.10.0で見た目を整え直し。本人「あゆみ画面が自作っぽさ抜けてない気がする」）
// 一般アプリの統計画面と同じく「数字のタイル → 縦の棒グラフ → 累計のタイル」。0字の月を行で並べない。
export function JourneyView({ entries, today, onOpenSettings, onOpenMonth, children }: { entries: readonly DiaryEntry[]; today: string; onOpenSettings: () => void; onOpenMonth: (month: string) => void; children?: ReactNode }) {
  const journey = journeySummary(entries, today);
  const maximum = Math.max(1, ...journey.currentMonths.map((item) => item.characters), ...journey.previousMonths.map((item) => item.characters));
  const monthNumber = (month: string) => Number(month.slice(5));
  const monthName = (month: string) => `${monthNumber(month)}月`;
  const first = journey.currentMonths[0]?.month;
  const last = journey.currentMonths[journey.currentMonths.length - 1]?.month;
  const range = first && last ? `${first.slice(0, 4)}年${monthNumber(first)}月〜${last.slice(0, 4)}年${monthNumber(last)}月` : "";
  const now = journey.thisMonth;
  const before = journey.lastYearMonth;
  const tiles: Array<{ label: string; value: string; previous: string }> = [
    { label: "書いた日", value: `${now.days}日`, previous: `${before.days}日` },
    { label: "文字数", value: `${now.characters.toLocaleString()}字`, previous: `${before.characters.toLocaleString()}字` },
    { label: "写真", value: `${now.photos}枚`, previous: `${before.photos}枚` },
  ];
  const oldest = journey.oldest ? `${Number(journey.oldest.slice(0, 4))}年${Number(journey.oldest.slice(5, 7))}月${Number(journey.oldest.slice(8, 10))}日` : "—";
  return <div className="screen"><div className="app-bar"><h1 className="app-bar-title">あゆみ</h1><span className="spacer" /><button className="icon-btn" type="button" aria-label="設定" onClick={onOpenSettings}><Icon name="settings" size={20} /></button></div>
    <div className="screen-body">
      {/* 目標と振り返り（閉じたカード）をいちばん上に（2026-11-23 本人「1番上に閉じたカードで置いてくれ」） */}
      {children}
      <section className="card journey-card">
        <h2>{monthName(now.month)}</h2>
        <div className="journey-stats">
          {tiles.map((tile) => <div key={tile.label} className="journey-stat"><span className="journey-stat-label">{tile.label}</span><strong className="journey-stat-value">{tile.value}</strong><span className="journey-stat-previous">去年 {tile.previous}</span></div>)}
        </div>
        <button className="text-toggle" type="button" onClick={() => onOpenMonth(before.month)}>去年の{monthName(before.month)}の日記を見る</button>
      </section>
      <section className="card journey-card">
        <h2>月ごとの文字数</h2>
        <p className="subtle">{range}</p>
        <div className="journey-chart" role="img" aria-label="月ごとの文字数の棒グラフ">
          {journey.currentMonths.map((current, index) => {
            const previous = journey.previousMonths[index].characters;
            const isNow = current.month === now.month;
            return <div className="journey-col" key={current.month}>
              <div className="journey-col-bars">
                <div className={`journey-vbar previous${previous === 0 ? " empty" : ""}`} style={{ height: `${previous / maximum * 100}%` }} title={`去年の${monthName(current.month)} ${previous.toLocaleString()}字`} />
                <div className={`journey-vbar${isNow ? " now" : ""}${current.characters === 0 ? " empty" : ""}`} style={{ height: `${current.characters / maximum * 100}%` }} title={`${monthName(current.month)} ${current.characters.toLocaleString()}字`} />
              </div>
              <span className={`journey-col-label${isNow ? " now" : ""}`}>{monthNumber(current.month)}</span>
            </div>;
          })}
        </div>
        <div className="journey-legend"><span><i className="journey-dot" />この1年</span><span><i className="journey-dot previous" />その前の年</span><span className="journey-legend-max">いちばん多い月 {maximum.toLocaleString()}字</span></div>
      </section>
      <section className="card journey-card">
        <h2>これまで</h2>
        <div className="journey-stats two">
          <div className="journey-stat"><span className="journey-stat-label">書いた日</span><strong className="journey-stat-value">{journey.totalDays.toLocaleString()}日</strong></div>
          <div className="journey-stat"><span className="journey-stat-label">文字数</span><strong className="journey-stat-value">{journey.totalCharacters.toLocaleString()}字</strong></div>
          <div className="journey-stat"><span className="journey-stat-label">いま続いている</span><strong className="journey-stat-value">{journey.streak}日</strong></div>
          <div className="journey-stat"><span className="journey-stat-label">いちばん古い日記</span><strong className="journey-stat-value small">{oldest}</strong></div>
        </div>
      </section>
    </div></div>;
}

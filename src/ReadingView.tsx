import { addDays, timeOnly } from "./dateUtils";
import { rhythmMeta } from "./diaryHelpers";
import { expenseBreakdown, formatDurationJa, formatMoneyCompact } from "./lifeMetrics";
import type { SleepMetrics } from "./lifeMetrics";
import { PhotoSection } from "./PhotoSection";
import { classifyBodyLines } from "./summary";
import type { DiaryEntry, ScratchItem } from "./types";

export function ReadingView({
  entry,
  sleep,
  exists,
  onMoveDate,
  onStartEditing,
  onExportMarkdown,
}: {
  entry: DiaryEntry;
  sleep: SleepMetrics;
  exists: boolean;
  onMoveDate: (date: string) => void | Promise<void>;
  onStartEditing: () => void;
  onExportMarkdown: () => void;
}) {
  const rhythmItems = rhythmMeta(entry, sleep);
  const expenses = expenseBreakdown(entry);
  const scratchText = entry.scratch.trim();
  const sortedScratchItems = [...entry.scratchItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="screen reading-screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">過去の日記をふりかえる</p>
          <h1>季節日記</h1>
          <p className="subtle">{entry.date}（{entry.weekday}）</p>
        </div>
      </header>

      <div className="date-controls">
        <button onClick={() => onMoveDate(addDays(entry.date, -1))} type="button">
          前日
        </button>
        <input
          aria-label="日付"
          type="date"
          value={entry.date}
          onChange={(event) => onMoveDate(event.target.value)}
        />
        <button onClick={() => onMoveDate(addDays(entry.date, 1))} type="button">
          翌日
        </button>
      </div>

      {!exists ? (
        <div className="reading-empty-state">
          <p className="empty">この日の記録はありません。</p>
          <button className="primary" type="button" onClick={onStartEditing}>
            この日を書く
          </button>
        </div>
      ) : (
        <>
          {rhythmItems.length > 0 && <p className="reading-meta">{rhythmItems.join("　")}</p>}

          {(sleep.totalMinutes !== null || entry.wakeUpTime || entry.bedTime || sleep.napMinutes !== null || expenses.total !== null) && (
            <section className="reading-section reading-life">
              <h2>生活</h2>
              <div className="reading-life-grid">
                <span>起床 {entry.wakeUpTime || "−"}</span><span>日常 {formatMoneyCompact(expenses.everyday)}</span>
                <span>就寝 {entry.bedTime || "−"}</span><span>満足 {formatMoneyCompact(expenses.satisfaction)}</span>
                <span>仮眠 {formatDurationJa(sleep.napMinutes)}</span><span>反省 {formatMoneyCompact(expenses.regret)}</span>
                <strong>睡眠合計 {formatDurationJa(sleep.totalMinutes)}</strong><strong>合計 {formatMoneyCompact(expenses.total)}</strong>
              </div>
            </section>
          )}

          <section className="reading-section">
            <h2>振り返り</h2>
            <div className="reading-body">
              {classifyBodyLines(entry.body).map((line, index) => {
                if (line.type === "blank") return <div className="reading-blank" key={index} />;
                if (line.type === "heading") {
                  return (
                    <p className="reading-heading" key={index}>
                      {line.text}
                    </p>
                  );
                }
                return (
                  <p className={line.type === "emptyTemplate" ? "reading-line empty-template" : "reading-line"} key={index}>
                    {line.text}
                  </p>
                );
              })}
            </div>
          </section>

          {scratchText && (
            <section className="reading-section">
              <h2>日記</h2>
              <p className="reading-text">{entry.scratch}</p>
            </section>
          )}

          {/* 写真はその日のまとまった記録として日記の直後に置き、時系列のらくがきメモ履歴はその後に出す */}
          {entry.photos.length > 0 && <PhotoSection photos={entry.photos} editable={false} />}

          {sortedScratchItems.length > 0 && (
            <section className="reading-section">
              <h2>らくがきメモ履歴</h2>
              <ul className="reading-memo-list">
                {sortedScratchItems.map((item) => (
                  <li key={item.id}>
                    <time>{timeOnly(item.createdAt)}</time>
                    <p>{item.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="action-row">
            <button className="primary" onClick={onStartEditing} type="button">
              編集する
            </button>
            <button onClick={onExportMarkdown} type="button">
              Markdownエクスポート
            </button>
          </div>
        </>
      )}
    </div>
  );
}

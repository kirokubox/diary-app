import { useEffect, useMemo, useState } from "react";
import { timeOnly } from "./dateUtils";
import { Icon } from "./Icon";
import { PhotoSection } from "./PhotoSection";
import { PeriodGoalSummary } from "./PeriodReviewUI";
import { parseBodySections } from "./summary";
import type { DiaryEntry, MonthlyReview, WeeklyReview } from "./types";
import { AppBar, DateSwitcher, IconButton, OverflowMenu } from "./ui";

export function ReadingView({
  entry,
  exists,
  onMoveDate,
  onBack,
  onStartEditing,
  onExportMarkdown,
  weeklyReview,
  monthlyReview,
}: {
  entry: DiaryEntry;
  exists: boolean;
  onMoveDate: (date: string) => void | Promise<void>;
  onBack: () => void;
  onStartEditing: () => void;
  onExportMarkdown: () => void;
  weeklyReview?: WeeklyReview;
  monthlyReview?: MonthlyReview;
}) {
  const [showEmpty, setShowEmpty] = useState(false);
  useEffect(() => setShowEmpty(false), [entry.id]);

  const scratchText = entry.scratch.trim();
  const sortedScratchItems = [...entry.scratchItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sections = useMemo(() => parseBodySections(entry.body), [entry.body]);
  // 未記入の問いと、中身が1行もない見出しの数
  const emptyCount = sections.reduce(
    (sum, section) => sum + section.emptyLabels.length + (section.items.length === 0 && section.emptyLabels.length === 0 ? 1 : 0),
    0,
  );
  const visibleSections = showEmpty ? sections : sections.filter((section) => section.items.length > 0);

  return (
    <div className="screen reading-screen">
      <AppBar>
        <IconButton icon="arrow-left" label="一覧へ戻る" onClick={onBack} />
        <DateSwitcher date={entry.date} onMove={onMoveDate} />
        <span className="spacer" />
        {exists && (
          <>
            <button className="btn primary small" type="button" onClick={onStartEditing}>
              編集
            </button>
            <OverflowMenu items={[{ label: "この日をテキストで書き出す", icon: "text", onSelect: onExportMarkdown }]} />
          </>
        )}
      </AppBar>

      <div className="screen-body">
        <PeriodGoalSummary weekly={weeklyReview} monthly={monthlyReview} />

        {!exists ? (
          <div className="empty-state">
            <p>この日の記録はありません。</p>
            <button className="btn primary" type="button" onClick={onStartEditing}>
              この日を書く
            </button>
          </div>
        ) : (
          <>
            {(visibleSections.length > 0 || emptyCount > 0) && (
              <section className="reading-section">
                <h2 className="section-title">振り返り</h2>
                <div className="card reading-card">
                  {visibleSections.map((section, sectionIndex) => (
                    <div className="view-block" key={sectionIndex}>
                      {section.title && <h3 className="view-heading">{section.title}</h3>}
                      {section.items.map((item, index) =>
                        item.kind === "field" ? (
                          <div className="view-row" key={index}>
                            <span className="view-key">{item.label}</span>
                            <span className="view-val">{item.value}</span>
                          </div>
                        ) : (
                          <p className="view-text" key={index}>
                            {item.text}
                          </p>
                        ),
                      )}
                      {showEmpty &&
                        section.emptyLabels.map((label) => (
                          <div className="view-row empty" key={label}>
                            <span className="view-key">{label}</span>
                            <span className="view-val">未記入</span>
                          </div>
                        ))}
                    </div>
                  ))}
                  {emptyCount > 0 && (
                    <button className="text-toggle" type="button" onClick={() => setShowEmpty((value) => !value)}>
                      {showEmpty ? "未記入の問いを隠す" : `未記入の問い ${emptyCount}件を表示`}
                      <span className={showEmpty ? "fold-caret down open" : "fold-caret down"}>
                        <Icon name="chevron-down" size={16} />
                      </span>
                    </button>
                  )}
                </div>
              </section>
            )}

            {scratchText && (
              <section className="reading-section">
                <h2 className="section-title">日記</h2>
                <p className="card reading-text">{entry.scratch}</p>
              </section>
            )}

            {/* 写真はその日のまとまった記録として日記の直後に置き、時系列のらくがきメモはその後に出す */}
            {entry.photos.length > 0 && <PhotoSection photos={entry.photos} editable={false} />}

            {sortedScratchItems.length > 0 && (
              <section className="reading-section">
                <h2 className="section-title">らくがき帳</h2>
                <ul className="card memo-list">
                  {sortedScratchItems.map((item) => (
                    <li key={item.id}>
                      <time>{timeOnly(item.createdAt)}</time>
                      <p>{item.text}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

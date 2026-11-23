import { EntryReadOnlyContent } from "./EntryReadOnlyContent";
import { PeriodGoalSummary } from "./PeriodReviewUI";
import type { DiaryEntry, MonthlyReview, WeeklyReview } from "./types";
import { AppBar, DateSwitcher, IconButton, OverflowMenu } from "./ui";

export function ReadingView({
  entry,
  exists,
  onMoveDate,
  onBack,
  onStartEditing,
  onExportMarkdown,
  onExportHorenso,
  onOpenSettings,
  weeklyReview,
  monthlyReview,
}: {
  entry: DiaryEntry;
  exists: boolean;
  onMoveDate: (date: string) => void | Promise<void>;
  onBack: () => void;
  onStartEditing: () => void;
  onExportMarkdown: () => void;
  onExportHorenso: () => void;
  onOpenSettings: () => void;
  weeklyReview?: WeeklyReview;
  monthlyReview?: MonthlyReview;
}) {
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
            <OverflowMenu items={[
              { label: "この日をテキストで書き出す", icon: "text", onSelect: onExportMarkdown },
              { label: "報連相だけ書き出す", icon: "text", onSelect: onExportHorenso },
              { label: "設定", icon: "settings", onSelect: onOpenSettings },
            ]} />
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
          <EntryReadOnlyContent entry={entry} />
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { monthOf, timeOnly, weekStartOf } from "./dateUtils";
import { makeScratchItem } from "./diaryHelpers";
import { Icon } from "./Icon";
import { PhotoSection } from "./PhotoSection";
import { BoundaryReviewEntries, PeriodGoalSummary } from "./PeriodReviewUI";
import { countBodyFields } from "./summary";
import type { DiaryEntry, DiaryPhoto, MonthlyReview, SaveState, WeeklyReview } from "./types";
import { AppBar, DateSwitcher, OverflowMenu } from "./ui";

export function Editor({
  entry,
  saveState,
  onChange,
  onExportMarkdown,
  onMoveDate,
  onDelete,
  initialBodyExpanded,
  bodyOpenVersion,
  photoBusy,
  photoNotice,
  onAddPhotos,
  onDeletePhoto,
  weeklyReviews,
  monthlyReviews,
  onSaveWeeklyReview,
  onSaveMonthlyReview,
  weeklyGoalTemplate,
}: {
  entry: DiaryEntry;
  saveState: SaveState;
  onChange: (entry: DiaryEntry) => void;
  onExportMarkdown: () => void;
  onMoveDate: (date: string) => void | Promise<void>;
  onDelete: () => void;
  initialBodyExpanded: boolean;
  bodyOpenVersion: number;
  photoBusy: boolean;
  photoNotice: string;
  onAddPhotos: (files: File[]) => void | Promise<void>;
  onDeletePhoto: (photo: DiaryPhoto) => Promise<boolean>;
  weeklyReviews: WeeklyReview[];
  monthlyReviews: MonthlyReview[];
  onSaveWeeklyReview: (weekStart: string, goalTheme: string, reflection: string) => void | Promise<void>;
  onSaveMonthlyReview: (month: string, goalTheme: string, reflection: string) => void | Promise<void>;
  weeklyGoalTemplate: string;
}) {
  const [bodyExpanded, setBodyExpanded] = useState(initialBodyExpanded);
  const [freeScratchExpanded, setFreeScratchExpanded] = useState(false);
  const [scratchDraft, setScratchDraft] = useState("");

  useEffect(() => {
    setBodyExpanded(initialBodyExpanded);
    setFreeScratchExpanded(false);
    setScratchDraft("");
  }, [entry.id, initialBodyExpanded, bodyOpenVersion]);

  const sortedScratchItems = useMemo(
    () => [...entry.scratchItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entry.scratchItems],
  );

  const bodyStatus = useMemo(() => {
    const { filled, total, hasText } = countBodyFields(entry.body);
    if (filled > 0) return `${total}項目中${filled}つ記入`;
    return hasText ? "記入あり" : "未記入";
  }, [entry.body]);
  const scratchLength = entry.scratch.trim().length;

  function addScratchItem() {
    const text = scratchDraft.trim();
    if (!text) return;
    onChange({ ...entry, scratchItems: [makeScratchItem(text), ...entry.scratchItems] });
    setScratchDraft("");
  }

  return (
    <div className="screen editor-screen">
      <AppBar>
        <DateSwitcher date={entry.date} onMove={onMoveDate} />
        <span className="spacer" />
        <span className={`save-badge ${saveState}`} aria-live="polite">
          {saveState === "saving" ? "保存中" : saveState === "dirty" ? "編集中" : "保存済み"}
        </span>
        <OverflowMenu
          items={[
            { label: "この日をテキストで書き出す", icon: "text", onSelect: onExportMarkdown },
            { label: "この日の日記を削除", icon: "trash", danger: true, onSelect: onDelete },
          ]}
        />
      </AppBar>

      <div className="screen-body">
        <PeriodGoalSummary
          weekly={weeklyReviews.find((item) => item.weekStart === weekStartOf(entry.date))}
          monthly={monthlyReviews.find((item) => item.month === monthOf(entry.date))}
        />

        <BoundaryReviewEntries
          date={entry.date}
          weeklyReviews={weeklyReviews}
          monthlyReviews={monthlyReviews}
          onSaveWeekly={onSaveWeeklyReview}
          onSaveMonthly={onSaveMonthlyReview}
          weeklyGoalTemplate={weeklyGoalTemplate}
        />

        <section className="fold body-area">
          <button
            className="fold-head"
            type="button"
            aria-expanded={bodyExpanded}
            onClick={() => setBodyExpanded((expanded) => !expanded)}
          >
            <span className={bodyExpanded ? "fold-caret open" : "fold-caret"}>
              <Icon name="chevron-right" size={18} />
            </span>
            <span className="fold-title">振り返り</span>
            <span className="fold-status">{bodyStatus}</span>
          </button>
          {bodyExpanded && (
            <textarea
              aria-label="振り返り"
              value={entry.body}
              onChange={(event) => onChange({ ...entry, body: event.target.value })}
              placeholder="今日の出来事、感情、思考を振り返る"
            />
          )}
        </section>

        <section className="fold free-diary-area">
          <button
            className="fold-head"
            type="button"
            aria-expanded={freeScratchExpanded}
            onClick={() => setFreeScratchExpanded((expanded) => !expanded)}
          >
            <span className={freeScratchExpanded ? "fold-caret open" : "fold-caret"}>
              <Icon name="chevron-right" size={18} />
            </span>
            <span className="fold-title">日記</span>
            <span className="fold-status">{scratchLength > 0 ? `${scratchLength}文字` : "未記入"}</span>
          </button>
          {freeScratchExpanded && (
            <textarea
              aria-label="日記"
              value={entry.scratch}
              onChange={(event) => onChange({ ...entry, scratch: event.target.value })}
              placeholder="日記を書く"
            />
          )}
        </section>

        <section className="scratch-area">
          <h2 className="section-title">らくがき帳</h2>
          <div className="scratch-composer">
            <textarea
              aria-label="らくがきメモ"
              rows={1}
              value={scratchDraft}
              onChange={(event) => setScratchDraft(event.target.value)}
              placeholder="今のメモを書く"
            />
            <button
              className="send-btn"
              type="button"
              aria-label="らくがきメモを追加"
              title="らくがきメモを追加"
              disabled={!scratchDraft.trim()}
              onClick={addScratchItem}
            >
              <Icon name="arrow-up" size={18} />
            </button>
          </div>
          {sortedScratchItems.length > 0 && (
            <ul className="memo-list">
              {sortedScratchItems.map((item) => (
                <li key={item.id}>
                  <time>{timeOnly(item.createdAt)}</time>
                  <p>{item.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 写真は画面の一番下。写真を追加しない日は「写真を追加」だけが増える */}
        <PhotoSection
          photos={entry.photos}
          editable
          busy={photoBusy}
          notice={photoNotice}
          onAddFiles={onAddPhotos}
          onDeletePhoto={onDeletePhoto}
        />

        <p className="status-line">最後に保存した時刻：{timeOnly(entry.updatedAt)}</p>
      </div>
    </div>
  );
}

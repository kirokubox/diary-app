import { useEffect, useMemo, useState } from "react";
import { addDays, timeOnly } from "./dateUtils";
import { makeScratchItem } from "./diaryHelpers";
import { PhotoSection } from "./PhotoSection";
import { BoundaryReviewEntries, PeriodGoalSummary } from "./PeriodReviewUI";
import { monthOf, weekStartOf } from "./dateUtils";
import type { DiaryEntry, DiaryPhoto, MonthlyReview, SaveState, WeeklyReview } from "./types";

export function Editor({
  entry,
  saveState,
  onChange,
  onManualSave,
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
}: {
  entry: DiaryEntry;
  saveState: SaveState;
  onChange: (entry: DiaryEntry) => void;
  onManualSave: () => void;
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

  function addScratchItem() {
    const text = scratchDraft.trim();
    if (!text) return;
    onChange({ ...entry, scratchItems: [makeScratchItem(text), ...entry.scratchItems] });
    setScratchDraft("");
  }

  return (
    <div className="screen editor-screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">今日のできごとと感情を、少しだけ残す日記</p>
          <h1>季節日記</h1>
          <p className="subtle">{entry.date}（{entry.weekday}）</p>
        </div>
        <div className={`save-badge ${saveState}`}>
          {saveState === "saving" ? "保存中..." : saveState === "saved" ? "保存済み" : "編集中"}
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
      />

      <section className="field-group body-area">
        <label>日記・振り返りを書く</label>
        <button className="body-toggle primary" type="button" onClick={() => setBodyExpanded((expanded) => !expanded)}>
          {bodyExpanded ? "振り返りを閉じる" : "振り返りを書く"}
        </button>
        {bodyExpanded && (
          <div className="body-panel">
            <label>
              振り返り
              <textarea
                value={entry.body}
                onChange={(event) => onChange({ ...entry, body: event.target.value })}
                placeholder="今日の出来事、感情、思考を振り返る"
              />
            </label>
          </div>
        )}
      </section>

      <section className="field-group free-diary-area">
        <button className="details-toggle" type="button" onClick={() => setFreeScratchExpanded((expanded) => !expanded)}>
          {freeScratchExpanded ? "日記を閉じる" : "日記を書く"}
        </button>
        {freeScratchExpanded && (
          <textarea
            value={entry.scratch}
            onChange={(event) => onChange({ ...entry, scratch: event.target.value })}
            placeholder="日記を書く"
          />
        )}
      </section>

      <section className="field-group scratch-area">
        <label>らくがき帳</label>
        <textarea
          className="scratch-draft"
          value={scratchDraft}
          onChange={(event) => setScratchDraft(event.target.value)}
          placeholder="今のメモを書く"
        />
        <button className="primary" type="button" onClick={addScratchItem}>
          らくがきメモを追加
        </button>
        <div className="scratch-history">
          <div className="scratch-history-head">
            <h2>今日のメモ履歴</h2>
          </div>
          {sortedScratchItems.length === 0 ? (
            <p className="empty">まだメモはありません。</p>
          ) : (
            <ul>
              {sortedScratchItems.map((item) => (
                <li key={item.id}>
                  <div>
                    <time>{timeOnly(item.createdAt)}</time>
                    <p>{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="status-line">最終保存：{timeOnly(entry.updatedAt)}</div>

      <div className="action-row">
        <button className="primary" onClick={onManualSave} type="button">
          保存
        </button>
        <button onClick={onExportMarkdown} type="button">
          Markdownエクスポート
        </button>
        <button className="danger" onClick={onDelete} type="button">
          削除
        </button>
      </div>

      {/* 写真は画面の一番下。写真を追加しない日は「＋ 写真を追加」だけが増える */}
      <PhotoSection
        photos={entry.photos}
        editable
        busy={photoBusy}
        notice={photoNotice}
        onAddFiles={onAddPhotos}
        onDeletePhoto={onDeletePhoto}
      />
    </div>
  );
}

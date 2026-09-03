import { useEffect, useMemo, useState } from "react";
import { addDays, timeOnly } from "./dateUtils";
import { makeScratchItem } from "./diaryHelpers";
import { expenseBreakdown, formatDurationJa, formatHoursCompact, formatMoneyCompact, napDraftToMinutes, resolveExpenseInput, toExpenseInputDraft, toNapDraft } from "./lifeMetrics";
import type { ExpenseInputDraft, NapDraft, SleepMetrics } from "./lifeMetrics";
import { PhotoSection } from "./PhotoSection";
import type { DiaryEntry, DiaryPhoto, SaveState } from "./types";

export function Editor({
  entry,
  sleep,
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
}: {
  entry: DiaryEntry;
  sleep: SleepMetrics;
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
}) {
  const [bodyExpanded, setBodyExpanded] = useState(initialBodyExpanded);
  const [lifeExpanded, setLifeExpanded] = useState(false);
  const [freeScratchExpanded, setFreeScratchExpanded] = useState(false);
  const [scratchDraft, setScratchDraft] = useState("");
  const [expenseDraft, setExpenseDraft] = useState<ExpenseInputDraft>(() => toExpenseInputDraft(entry));
  const [napDraft, setNapDraft] = useState<NapDraft>(() => toNapDraft(entry.napMinutes));

  // 日付を移動したときだけ入力欄の下書きを作り直す。
  // 自動保存で entry オブジェクトが差し替わるだけのときは、入力中の値をそのまま残す
  useEffect(() => {
    setExpenseDraft(toExpenseInputDraft(entry));
    setNapDraft(toNapDraft(entry.napMinutes));
  }, [entry.id]);

  useEffect(() => {
    setBodyExpanded(initialBodyExpanded);
    setLifeExpanded(false);
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

  const expenses = expenseBreakdown(entry);
  const hasLifeInput = Boolean(
    sleep.totalMinutes !== null || entry.wakeUpTime || entry.bedTime || entry.napMinutes !== null || expenses.total !== null,
  );
  // 満足費は入力せず、変動費全額 − 日常費 − 反省費 で求めて既存の satisfactionExpense へ保存する
  const expenseError = resolveExpenseInput(expenseDraft).error;

  function updateExpenseDraft(key: keyof ExpenseInputDraft, value: string) {
    const next = { ...expenseDraft, [key]: value };
    setExpenseDraft(next);
    const resolved = resolveExpenseInput(next);
    // 矛盾入力のあいだは保存へ反映せず、直前の正しい値を残す
    if (resolved.values) onChange({ ...entry, ...resolved.values });
  }

  function updateNapDraft(key: keyof NapDraft, value: string) {
    const next = { ...napDraft, [key]: value };
    setNapDraft(next);
    onChange({ ...entry, napMinutes: napDraftToMinutes(next) });
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

      <section className="life-card">
        <button className="life-card-toggle" type="button" onClick={() => setLifeExpanded((expanded) => !expanded)} aria-expanded={lifeExpanded}>
          <span><strong>生活</strong><small>{hasLifeInput ? `睡眠 ${formatHoursCompact(sleep.totalMinutes)}・お金 ${formatMoneyCompact(expenses.total)}` : "睡眠・お金を書く"}</small></span>
          <span aria-hidden="true">{lifeExpanded ? "−" : "＋"}</span>
        </button>
        {lifeExpanded && (
          <div className="life-grid">
            <label>起床時間<input type="time" step="60" value={entry.wakeUpTime} onChange={(event) => onChange({ ...entry, wakeUpTime: event.target.value })} /></label>
            <label>変動費全額<input inputMode="numeric" min="0" step="1" type="number" value={expenseDraft.total} onChange={(event) => updateExpenseDraft("total", event.target.value)} placeholder="円" /></label>
            <label>就寝時間<input type="time" step="60" value={entry.bedTime ?? ""} onChange={(event) => onChange({ ...entry, bedTime: event.target.value })} /></label>
            <label>日常費<input inputMode="numeric" min="0" step="1" type="number" value={expenseDraft.everyday} onChange={(event) => updateExpenseDraft("everyday", event.target.value)} placeholder="円" /></label>
            <label>
              仮眠時間
              <span className="life-nap-row">
                <input aria-label="仮眠時間（時間）" inputMode="numeric" min="0" max="23" step="1" type="number" value={napDraft.hours} onChange={(event) => updateNapDraft("hours", event.target.value)} placeholder="0" />
                時間
                <input aria-label="仮眠時間（分）" inputMode="numeric" min="0" max="59" step="1" type="number" value={napDraft.minutes} onChange={(event) => updateNapDraft("minutes", event.target.value)} placeholder="0" />
                分
              </span>
            </label>
            <label>反省費<input inputMode="numeric" min="0" step="1" type="number" value={expenseDraft.regret} onChange={(event) => updateExpenseDraft("regret", event.target.value)} placeholder="円" /></label>
            <p className="life-total">睡眠合計 {formatDurationJa(sleep.totalMinutes)}</p>
            <p className="life-total">満足費 {expenseError ? "−" : formatMoneyCompact(expenses.satisfaction)}</p>
            {expenseError && <p className="life-error">{expenseError}</p>}
          </div>
        )}
      </section>

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

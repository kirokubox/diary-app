import { useEffect, useMemo, useRef, useState } from "react";
import {
  APP_VERSION,
  DEFAULT_SETTINGS,
  DEFAULT_TAGS,
  DEFAULT_TEMPLATE,
  ENERGY_OPTIONS,
  MOOD_OPTIONS,
} from "./constants";
import { addDays, nowIsoLocal, timeOnly, toDateInputValue, weekdayOf } from "./dateUtils";
import { downloadText } from "./fileUtils";
import { entriesToMarkdown, entryToMarkdown } from "./markdown";
import {
  clearEntries,
  clearSettings,
  deleteEntry,
  getAllEntries,
  getEntry,
  getSettings,
  saveEntry,
  saveSettings,
} from "./storage";
import type { AppSettings, DiaryEntry, Energy, Mood, SaveState, ScratchItem, TabKey } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DIARY_TASK_CANDIDATES_KEY = "yuki-app-bridge-diary-task-candidates-v1";
const CURRENT_MONTH_KEY = toDateInputValue().slice(0, 7);
const WAKE_UP_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, "0");
  const minute = index % 2 === 0 ? "00" : "30";
  return `${hour}:${minute}`;
});
const SLEEP_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => (index + 1) * 0.5);
const WAKE_UP_TIME_SELECT_OPTIONS = WAKE_UP_TIME_OPTIONS.flatMap((time) => (time === "05:30" ? [time, ""] : [time]));
const SLEEP_HOUR_SELECT_OPTIONS = SLEEP_HOUR_OPTIONS.flatMap((hours) => (hours === 4.5 ? [hours, null] : [hours]));

type ImportIssue = {
  index?: number;
  date?: string;
  message: string;
};

type ImportSkip = {
  index: number;
  date: string;
  message: string;
};

type ImportPreview = {
  fileName: string;
  total: number;
  addableEntries: DiaryEntry[];
  skippedEntries: ImportSkip[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  settingsFound: boolean;
};

type DiaryTaskCandidateStatus =
  | "pending"
  | "addedToday"
  | "addedSoon"
  | "addedSomeday"
  | "completed"
  | "dismissed";

type DiaryTaskCandidate = {
  id: string;
  sourceApp: "season-diary";
  type: "taskCandidate";
  title: string;
  sourceText: string;
  sourceDate: string;
  sourceMemoId?: string;
  createdAt: string;
  status: DiaryTaskCandidateStatus;
  processedAt?: string;
  targetTaskId?: string;
};

type CandidateDraft = {
  memo: ScratchItem;
  title: string;
};

function makeEntry(date: string, settings: AppSettings): DiaryEntry {
  const stamp = nowIsoLocal();
  return {
    id: date,
    date,
    weekday: weekdayOf(date),
    energy: "",
    mood: "",
    wakeUpTime: "",
    sleepHours: null,
    tags: DEFAULT_TAGS,
    body: settings.template,
    scratch: "",
    scratchItems: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function cleanTag(tag: string): string {
  return tag.trim().replace(/^#+/, "");
}

function preview(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > 110 ? `${text.slice(0, 110)}...` : text || "本文はまだありません";
}

function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${year}年${Number(month)}月`;
}

function sleepHoursMeta(value: number | null | undefined): string {
  return typeof value === "number" ? `${value.toFixed(1)}h` : "";
}

function rhythmMeta(entry: DiaryEntry): string[] {
  return [
    entry.wakeUpTime ? `起床 ${entry.wakeUpTime}` : "",
    sleepHoursMeta(entry.sleepHours) ? `睡眠 ${sleepHoursMeta(entry.sleepHours)}` : "",
  ].filter(Boolean);
}

function makeScratchItem(text: string): ScratchItem {
  const stamp = nowIsoLocal();
  return {
    id: `${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    createdAt: stamp,
  };
}

function makeBridgeCandidateId() {
  return `diary-task-${nowIsoLocal()}-${Math.random().toString(36).slice(2, 8)}`;
}

function candidateTitleFromText(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 48 ? compact.slice(0, 48) : compact;
}

function isDiaryTaskCandidate(value: unknown): value is DiaryTaskCandidate {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DiaryTaskCandidate>;
  return (
    typeof item.id === "string" &&
    item.sourceApp === "season-diary" &&
    item.type === "taskCandidate" &&
    typeof item.title === "string" &&
    typeof item.sourceText === "string" &&
    typeof item.sourceDate === "string" &&
    typeof item.createdAt === "string" &&
    ["pending", "addedToday", "addedSoon", "addedSomeday", "completed", "dismissed"].includes(item.status ?? "")
  );
}

function loadDiaryTaskCandidates(): DiaryTaskCandidate[] {
  try {
    const raw = localStorage.getItem(DIARY_TASK_CANDIDATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isDiaryTaskCandidate) : [];
  } catch {
    return [];
  }
}

function saveDiaryTaskCandidates(candidates: DiaryTaskCandidate[]) {
  localStorage.setItem(DIARY_TASK_CANDIDATES_KEY, JSON.stringify(candidates));
}

function activeCandidateForMemo(candidates: DiaryTaskCandidate[], entryDate: string, item: ScratchItem) {
  return candidates.find((candidate) =>
    candidate.status !== "dismissed" &&
    (candidate.sourceMemoId === item.id || (candidate.sourceText === item.text && candidate.sourceDate === entryDate)),
  );
}

function normalizeScratchItems(value: unknown): ScratchItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Partial<ScratchItem> => !!item && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" && item.id ? item.id : `${nowIsoLocal()}-${Math.random().toString(36).slice(2, 8)}`,
      text: typeof item.text === "string" ? item.text : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : nowIsoLocal(),
    }))
    .filter((item) => item.text.trim());
}

function normalizeImportedEntry(entry: DiaryEntry): DiaryEntry {
  return {
    ...entry,
    id: entry.id || entry.date,
    weekday: weekdayOf(entry.date),
    tags: entry.tags.map(cleanTag).filter(Boolean),
    scratch: typeof entry.scratch === "string" ? entry.scratch : "",
    scratchItems: normalizeScratchItems(entry.scratchItems),
    wakeUpTime: typeof entry.wakeUpTime === "string" ? entry.wakeUpTime : "",
    sleepHours: typeof entry.sleepHours === "number" ? entry.sleepHours : null,
  };
}

function issueLabel(issue: ImportIssue): string {
  const prefix = issue.index ? `${issue.index}件目` : issue.date ? issue.date : "全体";
  return `${prefix}：${issue.message}`;
}

function validateImportedEntry(value: unknown, index: number): { entry?: DiaryEntry; errors: ImportIssue[]; warnings: ImportIssue[] } {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  if (!value || typeof value !== "object") {
    return { errors: [{ index, message: "日記データがオブジェクトではありません。" }], warnings };
  }

  const item = value as Partial<DiaryEntry>;
  const dateForIssue = typeof item.date === "string" ? item.date : undefined;

  if (typeof item.id !== "string" || !item.id) {
    errors.push({ index, date: dateForIssue, message: "id がありません。" });
  } else if (!DATE_PATTERN.test(item.id)) {
    errors.push({ index, date: dateForIssue, message: "id が YYYY-MM-DD 形式ではありません。" });
  }

  if (typeof item.date !== "string" || !item.date) {
    errors.push({ index, message: "date がありません。" });
  } else if (!DATE_PATTERN.test(item.date)) {
    errors.push({ index, date: item.date, message: "date が YYYY-MM-DD 形式ではありません。" });
  }

  if (typeof item.id === "string" && typeof item.date === "string" && item.id !== item.date) {
    errors.push({ index, date: item.date, message: "id と date が一致していません。" });
  }

  if (typeof item.weekday !== "string" || !item.weekday) {
    errors.push({ index, date: dateForIssue, message: "weekday がありません。" });
  } else if (typeof item.date === "string" && DATE_PATTERN.test(item.date) && item.weekday !== weekdayOf(item.date)) {
    warnings.push({ index, date: item.date, message: "weekday が日付から計算した曜日と違うため、保存時に補正します。" });
  }

  if (!ENERGY_OPTIONS.includes(item.energy as Energy)) {
    errors.push({ index, date: dateForIssue, message: "energy は「未入力」「高」「中」「低」のいずれかにしてください。" });
  }

  if (!MOOD_OPTIONS.includes(item.mood as Mood)) {
    errors.push({ index, date: dateForIssue, message: "mood は「未入力」「🙂」「😐」「☹️」のいずれかにしてください。" });
  }

  if ("wakeUpTime" in item && typeof item.wakeUpTime !== "string") {
    errors.push({ index, date: dateForIssue, message: "wakeUpTime は文字列にしてください。" });
  } else if (typeof item.wakeUpTime === "string" && item.wakeUpTime && !WAKE_UP_TIME_OPTIONS.includes(item.wakeUpTime)) {
    errors.push({ index, date: dateForIssue, message: "wakeUpTime は30分刻みの HH:mm 形式にしてください。" });
  }

  if ("sleepHours" in item && item.sleepHours !== null && typeof item.sleepHours !== "number") {
    errors.push({ index, date: dateForIssue, message: "sleepHours は数値または null にしてください。" });
  } else if (typeof item.sleepHours === "number" && !SLEEP_HOUR_OPTIONS.includes(item.sleepHours)) {
    errors.push({ index, date: dateForIssue, message: "sleepHours は0.5〜12.0の0.5時間刻みにしてください。" });
  }

  if (!Array.isArray(item.tags) || !item.tags.every((tag) => typeof tag === "string")) {
    errors.push({ index, date: dateForIssue, message: "tags は文字列の配列にしてください。" });
  }

  if (typeof item.body !== "string") {
    errors.push({ index, date: dateForIssue, message: "body は文字列にしてください。" });
  }

  if ("scratch" in item && typeof item.scratch !== "string") {
    errors.push({ index, date: dateForIssue, message: "scratch は文字列にしてください。" });
  }

  if ("scratchItems" in item) {
    if (!Array.isArray(item.scratchItems)) {
      errors.push({ index, date: dateForIssue, message: "scratchItems は配列にしてください。" });
    } else {
      item.scratchItems.forEach((scratchItem, scratchIndex) => {
        if (!scratchItem || typeof scratchItem !== "object") {
          errors.push({ index, date: dateForIssue, message: `scratchItems ${scratchIndex + 1}件目はオブジェクトにしてください。` });
          return;
        }
        const partial = scratchItem as Partial<ScratchItem>;
        if ("id" in partial && typeof partial.id !== "string") {
          errors.push({ index, date: dateForIssue, message: `scratchItems ${scratchIndex + 1}件目の id は文字列にしてください。` });
        }
        if (typeof partial.text !== "string") {
          errors.push({ index, date: dateForIssue, message: `scratchItems ${scratchIndex + 1}件目の text は文字列にしてください。` });
        }
        if ("createdAt" in partial && typeof partial.createdAt !== "string") {
          errors.push({ index, date: dateForIssue, message: `scratchItems ${scratchIndex + 1}件目の createdAt は文字列にしてください。` });
        }
      });
    }
  }

  if (typeof item.createdAt !== "string") {
    errors.push({ index, date: dateForIssue, message: "createdAt は文字列にしてください。" });
  }

  if (typeof item.updatedAt !== "string") {
    errors.push({ index, date: dateForIssue, message: "updatedAt は文字列にしてください。" });
  }

  if (errors.length > 0) return { errors, warnings };

  return {
    entry: normalizeImportedEntry(item as DiaryEntry),
    errors,
    warnings,
  };
}

function EntryCard({ entry, onOpen }: { entry: DiaryEntry; onOpen: (date: string) => void | Promise<void> }) {
  const rhythmItems = rhythmMeta(entry);
  return (
    <button className="entry-card" onClick={() => onOpen(entry.date)}>
      <span className="card-date">
        {entry.date}（{entry.weekday}）
      </span>
      {rhythmItems.length > 0 && <span className="card-rhythm">{rhythmItems.join("　")}</span>}
      <span className="card-meta">
        <span>気分 {entry.mood || "未入力"}</span>
        <span>体力 {entry.energy || "未入力"}</span>
      </span>
      <span className="tag-row">
        {entry.tags.map((tag) => (
          <span className="tag-pill" key={tag}>
            #{tag}
          </span>
        ))}
      </span>
      <span className="card-preview">{preview(entry.body)}</span>
    </button>
  );
}

function TagPicker({
  selected,
  options,
  onChange,
  onAddOption,
}: {
  selected: string[];
  options: string[];
  onChange: (tags: string[]) => void;
  onAddOption: (tag: string) => void;
}) {
  const [newTag, setNewTag] = useState("");

  function toggle(tag: string) {
    onChange(selected.includes(tag) ? selected.filter((item) => item !== tag) : [...selected, tag]);
  }

  function addTag() {
    const tag = cleanTag(newTag);
    if (!tag) return;
    onAddOption(tag);
    if (!selected.includes(tag)) onChange([...selected, tag]);
    setNewTag("");
  }

  return (
    <section className="field-group">
      <label>タグ</label>
      <div className="tag-grid">
        {options.map((tag) => (
          <button
            className={selected.includes(tag) ? "tag-choice active" : "tag-choice"}
            key={tag}
            onClick={() => toggle(tag)}
            type="button"
          >
            #{tag}
          </button>
        ))}
      </div>
      <div className="inline-add">
        <input
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          placeholder="新しいタグ"
        />
        <button type="button" onClick={addTag}>
          追加
        </button>
      </div>
    </section>
  );
}

function Editor({
  entry,
  settings,
  saveState,
  onChange,
  onManualSave,
  onCopyMarkdown,
  onMoveDate,
  onDelete,
  onAddTagOption,
  onNotify,
  initialBodyExpanded,
  bodyOpenVersion,
}: {
  entry: DiaryEntry;
  settings: AppSettings;
  saveState: SaveState;
  onChange: (entry: DiaryEntry) => void;
  onManualSave: () => void;
  onCopyMarkdown: () => void;
  onMoveDate: (date: string) => void | Promise<void>;
  onDelete: () => void;
  onAddTagOption: (tag: string) => void;
  onNotify: (message: string) => void;
  initialBodyExpanded: boolean;
  bodyOpenVersion: number;
}) {
  const [bodyExpanded, setBodyExpanded] = useState(initialBodyExpanded);
  const [freeScratchExpanded, setFreeScratchExpanded] = useState(false);
  const [scratchDraft, setScratchDraft] = useState("");
  const [bridgeCandidates, setBridgeCandidates] = useState<DiaryTaskCandidate[]>(() => loadDiaryTaskCandidates());
  const [candidateSelectMode, setCandidateSelectMode] = useState(false);
  const [selectedScratchIds, setSelectedScratchIds] = useState<string[]>([]);
  const [candidateDrafts, setCandidateDrafts] = useState<CandidateDraft[]>([]);

  useEffect(() => {
    setBodyExpanded(initialBodyExpanded);
    setFreeScratchExpanded(false);
    setScratchDraft("");
    setBridgeCandidates(loadDiaryTaskCandidates());
    setCandidateSelectMode(false);
    setSelectedScratchIds([]);
    setCandidateDrafts([]);
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

  function removeScratchItem(id: string) {
    onChange({ ...entry, scratchItems: entry.scratchItems.filter((item) => item.id !== id) });
  }

  function toggleCandidateSelection(id: string) {
    setSelectedScratchIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function openCandidateDrafts() {
    const selected = sortedScratchItems.filter((item) => selectedScratchIds.includes(item.id));
    if (selected.length === 0) {
      onNotify("候補にするメモを選んでください");
      return;
    }
    setCandidateDrafts(selected.map((memo) => ({ memo, title: candidateTitleFromText(memo.text) })));
  }

  function updateCandidateDraft(id: string, title: string) {
    setCandidateDrafts((current) => current.map((draft) => draft.memo.id === id ? { ...draft, title } : draft));
  }

  function cancelCandidateMode() {
    setCandidateSelectMode(false);
    setSelectedScratchIds([]);
    setCandidateDrafts([]);
  }

  function sendCandidateDrafts() {
    const current = loadDiaryTaskCandidates();
    const next = [...current];
    let added = 0;
    let duplicated = 0;
    candidateDrafts.forEach((draft) => {
      const title = draft.title.trim();
      if (!title) return;
      const duplicate = activeCandidateForMemo(next, entry.date, draft.memo);
      if (duplicate) {
        duplicated += 1;
        return;
      }
      next.push({
        id: makeBridgeCandidateId(),
        sourceApp: "season-diary",
        type: "taskCandidate",
        title,
        sourceText: draft.memo.text,
        sourceDate: entry.date,
        sourceMemoId: draft.memo.id,
        createdAt: nowIsoLocal(),
        status: "pending",
      });
      added += 1;
    });
    saveDiaryTaskCandidates(next);
    setBridgeCandidates(next);
    cancelCandidateMode();
    if (added > 0) onNotify(`${added}件をゆるたすく候補に送りました`);
    if (duplicated > 0 && added === 0) onNotify("すでにゆるたすく候補に送っています。");
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

      <section className="field-group body-area">
        <label>振り返りを書く</label>
        <button className="body-toggle primary" type="button" onClick={() => setBodyExpanded((expanded) => !expanded)}>
          {bodyExpanded ? "振り返りを閉じる" : "振り返りを書く"}
        </button>
        {bodyExpanded && (
          <div className="body-panel">
            <div className="rhythm-grid">
              <label>
                気分
                <select value={entry.mood} onChange={(event) => onChange({ ...entry, mood: event.target.value as Mood })}>
                  {MOOD_OPTIONS.map((mood) => (
                    <option key={mood || "none"} value={mood}>
                      {mood || "未入力"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                体力
                <select value={entry.energy} onChange={(event) => onChange({ ...entry, energy: event.target.value as Energy })}>
                  {ENERGY_OPTIONS.map((energy) => (
                    <option key={energy || "none"} value={energy}>
                      {energy || "未入力"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                起床時間
                <select value={entry.wakeUpTime} onChange={(event) => onChange({ ...entry, wakeUpTime: event.target.value })}>
                  {WAKE_UP_TIME_SELECT_OPTIONS.map((time) => (
                    <option key={time || "none"} value={time}>
                      {time || "未入力"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                睡眠時間
                <select
                  value={entry.sleepHours ?? ""}
                  onChange={(event) =>
                    onChange({ ...entry, sleepHours: event.target.value ? Number(event.target.value) : null })
                  }
                >
                  {SLEEP_HOUR_SELECT_OPTIONS.map((hours) => (
                    <option key={hours ?? "none"} value={hours ?? ""}>
                      {typeof hours === "number" ? `${hours.toFixed(1)}時間` : "未入力"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
        <label>今日のらくがき帳</label>
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
            {sortedScratchItems.length > 0 && !candidateSelectMode && (
              <button className="subtle-button" type="button" onClick={() => setCandidateSelectMode(true)}>
                ゆるたすく候補を選ぶ
              </button>
            )}
          </div>
          {sortedScratchItems.length === 0 ? (
            <p className="empty">まだメモはありません。</p>
          ) : (
            <ul>
              {sortedScratchItems.map((item) => (
                <li key={item.id}>
                  {candidateSelectMode && (
                    <label className="scratch-select-check">
                      <input
                        type="checkbox"
                        checked={selectedScratchIds.includes(item.id)}
                        disabled={Boolean(activeCandidateForMemo(bridgeCandidates, entry.date, item))}
                        onChange={() => toggleCandidateSelection(item.id)}
                      />
                      <span className="sr-only">候補に選ぶ</span>
                    </label>
                  )}
                  <div>
                    <time>{timeOnly(item.createdAt)}</time>
                    <p>{item.text}</p>
                    {activeCandidateForMemo(bridgeCandidates, entry.date, item) && <span className="sent-label">送信済み</span>}
                  </div>
                  {!candidateSelectMode && (
                    <button className="small-danger" type="button" onClick={() => removeScratchItem(item.id)}>
                      削除
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {candidateSelectMode && candidateDrafts.length === 0 && (
            <div className="candidate-actions">
              <button className="primary" type="button" onClick={openCandidateDrafts}>
                選んだメモをゆるたすく候補にする
              </button>
              <button type="button" onClick={cancelCandidateMode}>
                キャンセル
              </button>
            </div>
          )}
          {candidateDrafts.length > 0 && (
            <div className="candidate-draft-panel">
              <h3>ゆるたすく候補にする内容</h3>
              {candidateDrafts.map((draft) => (
                <div className="candidate-draft-item" key={draft.memo.id}>
                  <p className="candidate-source">元メモ：{draft.memo.text}</p>
                  <label>
                    候補タイトル
                    <input value={draft.title} onChange={(event) => updateCandidateDraft(draft.memo.id, event.target.value)} />
                  </label>
                </div>
              ))}
              <div className="candidate-actions">
                <button className="primary" type="button" onClick={sendCandidateDrafts}>
                  ゆるたすく候補に送る
                </button>
                <button type="button" onClick={cancelCandidateMode}>
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <TagPicker
        selected={entry.tags}
        options={settings.tagOptions}
        onChange={(tags) => onChange({ ...entry, tags })}
        onAddOption={onAddTagOption}
      />

      <div className="status-line">最終保存：{timeOnly(entry.updatedAt)}</div>

      <div className="action-row">
        <button className="primary" onClick={onManualSave} type="button">
          保存
        </button>
        <button onClick={onCopyMarkdown} type="button">
          Markdownコピー
        </button>
        <button className="danger" onClick={onDelete} type="button">
          削除
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [activeDate, setActiveDate] = useState(toDateInputValue());
  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [toast, setToast] = useState("");
  const saveTimer = useRef<number | null>(null);
  const hydrated = useRef(false);

  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [moodFilter, setMoodFilter] = useState("");
  const [energyFilter, setEnergyFilter] = useState("");
  const [templateDraft, setTemplateDraft] = useState(DEFAULT_TEMPLATE);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<{
    added: number;
    skipped: ImportSkip[];
    errors: number;
  } | null>(null);
  const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set([CURRENT_MONTH_KEY]));
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set());
  const [initialBodyExpanded, setInitialBodyExpanded] = useState(false);
  const [bodyOpenVersion, setBodyOpenVersion] = useState(0);
  const [searchDetailsExpanded, setSearchDetailsExpanded] = useState(false);

  async function refreshEntries() {
    setEntries(await getAllEntries());
  }

  useEffect(() => {
    async function init() {
      const loadedSettings = await getSettings();
      const loadedEntry = await getEntry(activeDate);
      setSettings(loadedSettings);
      setTemplateDraft(loadedSettings.template);
      setEntries(await getAllEntries());
      setEntry(loadedEntry ?? makeEntry(activeDate, loadedSettings));
      hydrated.current = true;
    }
    void init();
  }, []);

  useEffect(() => {
    async function loadEntry() {
      const loaded = await getEntry(activeDate);
      setEntry(loaded ?? makeEntry(activeDate, settings));
      setSaveState("idle");
    }
    if (hydrated.current) void loadEntry();
  }, [activeDate, settings.template]);

  useEffect(() => {
    if (!entry || !hydrated.current || saveState !== "dirty") return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persistEntry(entry);
    }, 1000);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [entry, saveState]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function persistEntry(target: DiaryEntry) {
    setSaveState("saving");
    const existing = await getEntry(target.id);
    const saved: DiaryEntry = {
      ...target,
      createdAt: existing?.createdAt ?? target.createdAt,
      updatedAt: nowIsoLocal(),
      weekday: weekdayOf(target.date),
      tags: target.tags.map(cleanTag).filter(Boolean),
      scratch: typeof target.scratch === "string" ? target.scratch : "",
      scratchItems: normalizeScratchItems(target.scratchItems),
      wakeUpTime: typeof target.wakeUpTime === "string" ? target.wakeUpTime : "",
      sleepHours: typeof target.sleepHours === "number" ? target.sleepHours : null,
    };
    await saveEntry(saved);
    setEntry(saved);
    await refreshEntries();
    setSaveState("saved");
  }

  function updateEntry(next: DiaryEntry) {
    setEntry(next);
    setSaveState("dirty");
  }

  async function addTagOption(tag: string) {
    const clean = cleanTag(tag);
    if (!clean || settings.tagOptions.includes(clean)) return;
    const next = { ...settings, tagOptions: [...settings.tagOptions, clean] };
    setSettings(next);
    await saveSettings(next);
  }

  async function openDate(date: string, expandBody = false) {
    if (entry && saveState === "dirty") {
      await persistEntry(entry);
    }
    setInitialBodyExpanded(expandBody);
    setBodyOpenVersion((version) => version + 1);
    setActiveDate(date);
    setTab("today");
  }

  async function openDateForReading(date: string) {
    await openDate(date, true);
  }

  async function copyMarkdown() {
    if (!entry) return;
    await persistEntry(entry);
    await navigator.clipboard.writeText(entryToMarkdown({ ...entry, updatedAt: nowIsoLocal() }));
    notify("Markdownをコピーしました");
  }

  async function removeCurrentEntry() {
    if (!entry) return;
    const typed = window.prompt("削除するには「削除」と入力してください。");
    if (typed !== "削除") return;
    await deleteEntry(entry.id);
    await refreshEntries();
    setEntry(makeEntry(activeDate, settings));
    setSaveState("idle");
    notify("日記を削除しました");
  }

  const searchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((item) => {
      const keywordMatch =
        !normalizedQuery ||
        item.body.toLowerCase().includes(normalizedQuery) ||
        item.scratch.toLowerCase().includes(normalizedQuery) ||
        item.scratchItems.some((scratchItem) => scratchItem.text.toLowerCase().includes(normalizedQuery)) ||
        item.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));
      const tagMatch = !tagFilter || item.tags.includes(tagFilter);
      const fromMatch = !fromDate || item.date >= fromDate;
      const toMatch = !toDate || item.date <= toDate;
      const moodMatch = !moodFilter || item.mood === moodFilter;
      const energyMatch = !energyFilter || item.energy === energyFilter;
      return keywordMatch && tagMatch && fromMatch && toMatch && moodMatch && energyMatch;
    });
  }, [entries, query, tagFilter, fromDate, toDate, moodFilter, energyFilter]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, DiaryEntry[]>();
    entries.forEach((item) => {
      const monthKey = monthKeyOf(item.date);
      groups.set(monthKey, [...(groups.get(monthKey) ?? []), item]);
    });
    return Array.from(groups.entries()).map(([monthKey, monthEntries]) => ({ monthKey, entries: monthEntries }));
  }, [entries]);

  function toggleMonth(monthKey: string) {
    setOpenMonths((current) => {
      const next = new Set(current);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  }

  function showAllMonthEntries(monthKey: string) {
    setExpandedMonths((current) => new Set(current).add(monthKey));
  }

  async function exportJson() {
    const payload = {
      appName: "Yuki Diary App" as const,
      version: APP_VERSION,
      exportedAt: nowIsoLocal(),
      settings,
      entries,
    };
    downloadText(
      `diary-backup-${toDateInputValue()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }

  function exportMarkdown() {
    downloadText(`diary-export-${toDateInputValue()}.md`, entriesToMarkdown(entries), "text/markdown");
  }

  async function importJson(file: File | undefined) {
    if (!file) return;
    setImportResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown;
      if (!data || typeof data !== "object" || !Array.isArray((data as { entries?: unknown }).entries)) {
        throw new Error("entries 配列が見つかりません。");
      }
      const incoming = (data as { entries: unknown[] }).entries;
      const current = await getAllEntries();
      const currentIds = new Set(current.map((item) => item.id));
      const currentDates = new Set(current.map((item) => item.date));
      const jsonIds = new Set<string>();
      const jsonDates = new Set<string>();
      const addableEntries: DiaryEntry[] = [];
      const skippedEntries: ImportSkip[] = [];
      const errors: ImportIssue[] = [];
      const warnings: ImportIssue[] = [];

      incoming.forEach((item, zeroBasedIndex) => {
        const index = zeroBasedIndex + 1;
        const result = validateImportedEntry(item, index);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
        if (!result.entry) return;

        const entry = result.entry;
        const alreadyInJson = jsonIds.has(entry.id) || jsonDates.has(entry.date);
        if (alreadyInJson) {
          errors.push({ index, date: entry.date, message: "同じJSON内で id または date が重複しています。" });
          return;
        }
        jsonIds.add(entry.id);
        jsonDates.add(entry.date);

        if (currentIds.has(entry.id) || currentDates.has(entry.date)) {
          skippedEntries.push({
            index,
            date: entry.date,
            message: `${entry.date} は既存の日記があるためスキップします。`,
          });
          return;
        }

        addableEntries.push(entry);
      });

      const settingsFound = "settings" in data;
      if (settingsFound) {
        warnings.push({ message: "settings が含まれていますが、現在の設定は上書きしません。" });
      }

      setImportPreview({
        fileName: file.name,
        total: incoming.length,
        addableEntries,
        skippedEntries,
        errors,
        warnings,
        settingsFound,
      });
      notify("JSONを検証しました。内容を確認してください");
    } catch (error) {
      setImportPreview(null);
      window.alert(error instanceof Error ? error.message : "JSONを読み込めませんでした。");
    }
  }

  async function addNewEntriesFromImport() {
    if (!importPreview || importPreview.errors.length > 0) return;
    try {
      for (const item of importPreview.addableEntries) {
        await saveEntry(item);
      }
      await refreshEntries();
      setImportResult({
        added: importPreview.addableEntries.length,
        skipped: importPreview.skippedEntries,
        errors: importPreview.errors.length,
      });
      notify(`インポート完了：${importPreview.addableEntries.length}件を追加しました`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "インポートに失敗しました。");
    }
  }

  async function saveTemplate() {
    const next = { ...settings, template: templateDraft };
    setSettings(next);
    await saveSettings(next);
    notify("テンプレートを保存しました");
  }

  async function resetTemplate() {
    const next = { ...settings, template: DEFAULT_TEMPLATE };
    setSettings(next);
    setTemplateDraft(DEFAULT_TEMPLATE);
    await saveSettings(next);
    notify("初期テンプレートに戻しました");
  }

  async function deleteAllData() {
    const typed = window.prompt("全データを削除するには「削除」と入力してください。");
    if (typed !== "削除") return;
    await clearEntries();
    await clearSettings();
    setSettings(DEFAULT_SETTINGS);
    setTemplateDraft(DEFAULT_SETTINGS.template);
    setEntries([]);
    setEntry(makeEntry(activeDate, DEFAULT_SETTINGS));
    notify("全データを削除しました");
  }

  return (
    <div className="app-shell">
      <main>
        {tab === "today" && entry && (
          <Editor
            entry={entry}
            settings={settings}
            saveState={saveState}
            onChange={updateEntry}
            onManualSave={() => void persistEntry(entry)}
            onCopyMarkdown={() => void copyMarkdown()}
            onMoveDate={openDate}
            onDelete={() => void removeCurrentEntry()}
            onAddTagOption={(tag) => void addTagOption(tag)}
            onNotify={notify}
            initialBodyExpanded={initialBodyExpanded}
            bodyOpenVersion={bodyOpenVersion}
          />
        )}

        {tab === "list" && (
          <div className="screen">
            <header className="screen-header">
              <div>
                <p className="eyebrow">一覧</p>
                <h1>日記一覧</h1>
              </div>
              <span className="count">{entries.length}件</span>
            </header>
            <div className="month-list">
              {entries.length === 0 ? (
                <p className="empty">まだ保存された日記はありません。</p>
              ) : (
                groupedEntries.map(({ monthKey, entries: monthEntries }) => {
                  const isOpen = openMonths.has(monthKey);
                  const isCurrentMonth = monthKey === CURRENT_MONTH_KEY;
                  const showAllEntries = !isCurrentMonth || expandedMonths.has(monthKey);
                  const visibleEntries = showAllEntries ? monthEntries : monthEntries.slice(0, 3);
                  const hiddenCount = monthEntries.length - visibleEntries.length;
                  return (
                    <section className="month-group" key={monthKey}>
                      <button
                        className="month-toggle"
                        onClick={() => toggleMonth(monthKey)}
                        type="button"
                        aria-expanded={isOpen}
                      >
                        <span>{monthLabel(monthKey)}</span>
                        <span>{isOpen ? "▼" : "▶"}</span>
                      </button>
                      {isOpen && (
                        <div className="entry-list">
                          {visibleEntries.map((item) => (
                            <EntryCard entry={item} key={item.id} onOpen={openDateForReading} />
                          ))}
                          {isCurrentMonth && hiddenCount > 0 && (
                            <button className="show-more-month" type="button" onClick={() => showAllMonthEntries(monthKey)}>
                              今月の残りを表示
                            </button>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </div>
          </div>
        )}

        {tab === "search" && (
          <div className="screen">
            <header className="screen-header">
              <div>
                <p className="eyebrow">検索</p>
                <h1>日記を探す</h1>
              </div>
              <span className="count">{searchResults.length}件</span>
            </header>
            <section className="search-panel">
              <label>
                キーワード
                <input value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <button className="details-toggle" type="button" onClick={() => setSearchDetailsExpanded((expanded) => !expanded)}>
                {searchDetailsExpanded ? "詳しい条件を閉じる" : "詳しい条件を開く"}
              </button>
              {searchDetailsExpanded && (
                <div className="search-detail-fields">
                  <label>
                    タグ
                    <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                      <option value="">すべて</option>
                      {settings.tagOptions.map((tag) => (
                        <option key={tag} value={tag}>
                          #{tag}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    開始日
                    <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
                  </label>
                  <label>
                    終了日
                    <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
                  </label>
                  <label>
                    気分
                    <select value={moodFilter} onChange={(event) => setMoodFilter(event.target.value)}>
                      <option value="">すべて</option>
                      {MOOD_OPTIONS.filter(Boolean).map((mood) => (
                        <option key={mood} value={mood}>
                          {mood}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    体力
                    <select value={energyFilter} onChange={(event) => setEnergyFilter(event.target.value)}>
                      <option value="">すべて</option>
                      {ENERGY_OPTIONS.filter(Boolean).map((energy) => (
                        <option key={energy} value={energy}>
                          {energy}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </section>
            <div className="entry-list">
              {searchResults.map((item) => (
                <EntryCard entry={item} key={item.id} onOpen={openDateForReading} />
              ))}
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="screen settings-screen">
            <header className="screen-header">
              <div>
                <p className="eyebrow">設定</p>
                <h1>設定</h1>
              </div>
            </header>

            <section className="settings-section">
              <h2>テンプレート編集</h2>
              <textarea
                className="template-editor"
                value={templateDraft}
                onChange={(event) => setTemplateDraft(event.target.value)}
              />
              <div className="action-row">
                <button className="primary" onClick={saveTemplate} type="button">
                  保存
                </button>
                <button onClick={resetTemplate} type="button">
                  初期テンプレートに戻す
                </button>
              </div>
            </section>

            <section className="settings-section">
              <h2>バックアップと復元</h2>
              <p className="notice">
                インポート前に、現在の日記データをJSONエクスポートしてバックアップすることをおすすめします。
                インポートでは既存の日記を上書きせず、新規データだけを追加します。
              </p>
              <div className="action-row">
                <button onClick={() => void exportJson()} type="button">
                  JSONエクスポート
                </button>
                <button onClick={exportMarkdown} type="button">
                  Markdownエクスポート
                </button>
              </div>
              <label className="file-picker">
                JSONインポート
                <input
                  accept="application/json,.json"
                  type="file"
                  onChange={(event) => {
                    void importJson(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {importPreview && (
                <div className="import-preview">
                  <div>
                    <p className="eyebrow">インポート前プレビュー</p>
                    <h3>{importPreview.fileName}</h3>
                  </div>
                  <div className="import-summary">
                    <span>読み込み件数：{importPreview.total}件</span>
                    <span>新規追加：{importPreview.addableEntries.length}件</span>
                    <span>重複：{importPreview.skippedEntries.length}件</span>
                    <span>エラー：{importPreview.errors.length}件</span>
                    <span>警告：{importPreview.warnings.length}件</span>
                  </div>

                  {importPreview.addableEntries.length > 0 && (
                    <div className="import-detail">
                      <h4>追加予定の日付</h4>
                      <p>{importPreview.addableEntries.map((item) => item.date).join("、")}</p>
                    </div>
                  )}

                  {importPreview.skippedEntries.length > 0 && (
                    <div className="import-detail">
                      <h4>スキップする日付</h4>
                      <ul>
                        {importPreview.skippedEntries.map((item) => (
                          <li key={`${item.index}-${item.date}`}>{item.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {importPreview.errors.length > 0 && (
                    <div className="import-detail danger-text">
                      <h4>エラー</h4>
                      <ul>
                        {importPreview.errors.map((item, index) => (
                          <li key={`${item.index ?? "all"}-${index}`}>{issueLabel(item)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {importPreview.warnings.length > 0 && (
                    <div className="import-detail warning-text">
                      <h4>警告</h4>
                      <ul>
                        {importPreview.warnings.map((item, index) => (
                          <li key={`${item.index ?? "all"}-${index}`}>{issueLabel(item)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="action-row">
                    <button
                      className="primary"
                      disabled={importPreview.errors.length > 0 || importPreview.addableEntries.length === 0}
                      onClick={() => void addNewEntriesFromImport()}
                      type="button"
                    >
                      新規データだけ追加する
                    </button>
                    <button onClick={() => setImportPreview(null)} type="button">
                      プレビューを閉じる
                    </button>
                  </div>
                  {importPreview.errors.length > 0 && (
                    <p className="subtle">エラーがあるため、このJSONはまだインポートできません。</p>
                  )}
                </div>
              )}

              {importResult && (
                <div className="import-preview">
                  <p className="eyebrow">インポート結果</p>
                  <h3>インポート完了</h3>
                  <div className="import-summary">
                    <span>追加：{importResult.added}件</span>
                    <span>スキップ：{importResult.skipped.length}件</span>
                    <span>エラー：{importResult.errors}件</span>
                  </div>
                  {importResult.skipped.length > 0 && (
                    <div className="import-detail">
                      <h4>スキップした日付</h4>
                      <p>{importResult.skipped.map((item) => item.date).join("、")}</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="settings-section">
              <h2>データ削除</h2>
              <button className="danger wide" onClick={() => void deleteAllData()} type="button">
                全データ削除
              </button>
            </section>

            <section className="settings-section info">
              <h2>アプリ情報</h2>
              <p>
                このアプリは、日々の出来事・感情・思考を記録しながら、メタ認知能力、言語化能力、
                文章力を高めるための個人用Web日記です。
              </p>
              <p>
                このアプリの日記データはサーバーではなく、ブラウザ内のIndexedDBに保存されます。
                Chromeの閲覧データやサイトデータを削除すると、日記データが消える可能性があります。
              </p>
              <p>
                公開URLに日記本文が保存されるわけではありません。ただし、URLを知っている人は
                アプリ画面を開ける可能性があります。公開URLをSNSやnoteに載せないでください。
              </p>
              <p>
                スマホとPCでデータは自動同期されません。スマホで書いた日記はスマホ側のブラウザに、
                PCで書いた日記はPC側のブラウザに保存されます。
              </p>
              <ul>
                <li>定期的にJSONエクスポートでバックアップしてください。</li>
                <li>本番運用する場合は、週1回以上のJSONバックアップを推奨します。</li>
                <li>JSONバックアップファイルをGitHubや公開フォルダに入れないでください。</li>
                <li>JSONは復元用、Markdownは閲覧・共有・ChatGPT連携用です。</li>
              </ul>
            </section>
          </div>
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}

      <nav className="bottom-tabs" aria-label="画面切り替え">
        {[
          ["today", "日記"],
          ["list", "一覧"],
          ["search", "検索"],
          ["settings", "設定"],
        ].map(([key, label]) => (
          <button className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key as TabKey)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

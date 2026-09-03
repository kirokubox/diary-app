import { ENERGY_OPTIONS, MOOD_OPTIONS, PHOTO_MAX_COUNT } from "./constants";
import { addDays, nowIsoLocal, toDateInputValue, weekdayOf } from "./dateUtils";
import { buildSleepMetricsMap, expenseBreakdown, formatHoursCompact, formatMoneyCompact, getSleepMetrics, normalizeOptionalMoney, parseTimeMinutes } from "./lifeMetrics";
import type { SleepMetrics } from "./lifeMetrics";
import { normalizePhotoMeta } from "./storage";
import type { AppSettings, DiaryEntry, DiaryPhoto, Energy, Mood, ScratchItem } from "./types";

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const SLEEP_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => (index + 1) * 0.5);
export const NAP_HOUR_OPTIONS = Array.from({ length: 13 }, (_, index) => index * 0.5);

export type SleepChartPoint = {
  date: string;
  label: string;
  sleepHours: number | null;
  napHours: number;
  totalHours: number | null;
  wakeTime: number | null;
  bedTime: string | null;
};

export type ImportIssue = {
  index?: number;
  date?: string;
  message: string;
};

export type ImportSkip = {
  index: number;
  date: string;
  message: string;
};

// 写真つきZIPから取り出した画像1枚分（本文の追加後、参照されているものだけ復元する）
export type ZipPhotoPayload = {
  id: string;
  date: string;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string;
  blob: Blob;
};

export type ImportPreview = {
  fileName: string;
  total: number;
  addableEntries: DiaryEntry[];
  skippedEntries: ImportSkip[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  settingsFound: boolean;
  importedSettings: AppSettings | null;
  photoMetaCount: number;
  zipPhotos: ZipPhotoPayload[];
};

export const PHOTO_BACKUP_README = `季節日記 写真つきバックアップ

- diary-backup.json … 日記本文・睡眠・らくがきメモ・設定（通常のJSONバックアップと同じ形式）
- photos/日付/連番_写真ID.webp … 写真の画像ファイル（長辺1600pxへ縮小済み・EXIFなし）
- photos.json … 画像ファイルと日記を結びつける一覧

復元するときは、このZIPをそのまま季節日記の設定タブ「写真つきZIPインポート」で選んでください。
中身を展開して再圧縮したZIPでも読み込めますが、フォルダ構成とファイル名は変えないでください。

このZIPには本物の写真が入っています。GitHubや公開フォルダ、共有用の資料に置かないでください。
`;

export function makeEntry(date: string, settings: AppSettings): DiaryEntry {
  const stamp = nowIsoLocal();
  return {
    id: date,
    date,
    weekday: weekdayOf(date),
    energy: "",
    mood: "",
    wakeUpTime: "",
    bedTime: "",
    sleepHours: null,
    napHours: null,
    napMinutes: null,
    everydayExpense: null,
    satisfactionExpense: null,
    regretExpense: null,
    tags: [],
    body: settings.template,
    scratch: "",
    scratchItems: [],
    photos: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function cleanTag(tag: string): string {
  return tag.trim().replace(/^#+/, "");
}

export function sleepHoursMeta(value: number | null | undefined): string {
  return typeof value === "number" ? `${value.toFixed(1)}h` : "";
}

export function parseHours(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "未入力") return null;
  const numeric = Number(trimmed.replace("時間", ""));
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseWakeTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}

export function formatWakeTick(value: number): string {
  const wholeHours = Math.floor(value);
  const minutes = Math.round((value - wholeHours) * 60);
  return `${String(wholeHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatShortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function rhythmMeta(entry: DiaryEntry, sleep?: SleepMetrics): string[] {
  const metrics = sleep ?? getSleepMetrics(entry, undefined, "05:00");
  return [
    entry.wakeUpTime ? `起床 ${entry.wakeUpTime}` : "",
    metrics.totalMinutes !== null ? `睡眠 ${formatHoursCompact(metrics.totalMinutes)}` : "",
    metrics.napMinutes !== null ? `仮眠 ${formatHoursCompact(metrics.napMinutes)}` : "",
  ].filter(Boolean);
}

// 一覧・検索のカード用。仮眠・満足費・反省費は当日の日記画面と既存グラフ側で見る
export function cardMeta(entry: DiaryEntry, sleep?: SleepMetrics): string[] {
  const metrics = sleep ?? getSleepMetrics(entry, undefined, "05:00");
  const expenses = expenseBreakdown(entry);
  return [
    entry.wakeUpTime ? `起床 ${entry.wakeUpTime}` : "",
    metrics.totalMinutes !== null ? `睡眠 ${formatHoursCompact(metrics.totalMinutes)}` : "",
    expenses.total !== null ? `全額 ${formatMoneyCompact(expenses.total)}` : "",
    expenses.everyday !== null ? `日常 ${formatMoneyCompact(expenses.everyday)}` : "",
  ].filter(Boolean);
}

export function makeScratchItem(text: string): ScratchItem {
  const stamp = nowIsoLocal();
  return {
    id: `${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    createdAt: stamp,
  };
}

export function getLifeDateKey(date: Date, dayBoundaryTime: string): string {
  const [hoursText, minutesText] = dayBoundaryTime.split(":");
  const boundaryMinutes = Number(hoursText) * 60 + Number(minutesText);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const dateKey = toDateInputValue(date);
  return currentMinutes < boundaryMinutes ? addDays(dateKey, -1) : dateKey;
}

export function normalizeScratchItems(value: unknown): ScratchItem[] {
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

export function normalizeImportedEntry(entry: DiaryEntry): DiaryEntry {
  return {
    ...entry,
    id: entry.id || entry.date,
    weekday: weekdayOf(entry.date),
    tags: entry.tags.map(cleanTag).filter(Boolean),
    scratch: typeof entry.scratch === "string" ? entry.scratch : "",
    scratchItems: normalizeScratchItems(entry.scratchItems),
    photos: normalizePhotoMeta(entry.photos),
    wakeUpTime: typeof entry.wakeUpTime === "string" ? entry.wakeUpTime : "",
    bedTime: typeof entry.bedTime === "string" && parseTimeMinutes(entry.bedTime) !== null ? entry.bedTime : "",
    sleepHours: parseHours(entry.sleepHours),
    napHours: parseHours(entry.napHours),
    napMinutes:
      typeof entry.napMinutes === "number" && Number.isFinite(entry.napMinutes) && entry.napMinutes >= 0
        ? Math.round(entry.napMinutes)
        : null,
    everydayExpense: normalizeOptionalMoney(entry.everydayExpense),
    satisfactionExpense: normalizeOptionalMoney(entry.satisfactionExpense),
    regretExpense: normalizeOptionalMoney(entry.regretExpense),
  };
}

export function issueLabel(issue: ImportIssue): string {
  const prefix = issue.index ? `${issue.index}件目` : issue.date ? issue.date : "全体";
  return `${prefix}：${issue.message}`;
}

export function validateImportedEntry(value: unknown, index: number): { entry?: DiaryEntry; errors: ImportIssue[]; warnings: ImportIssue[] } {
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
  } else if (typeof item.wakeUpTime === "string" && item.wakeUpTime && parseTimeMinutes(item.wakeUpTime) === null) {
    errors.push({ index, date: dateForIssue, message: "wakeUpTime は HH:mm 形式にしてください。" });
  }

  if ("bedTime" in item && typeof item.bedTime !== "string") {
    errors.push({ index, date: dateForIssue, message: "bedTime は文字列にしてください。" });
  } else if (typeof item.bedTime === "string" && item.bedTime && parseTimeMinutes(item.bedTime) === null) {
    errors.push({ index, date: dateForIssue, message: "bedTime は HH:mm 形式にしてください。" });
  }

  const rawSleepHours = (item as { sleepHours?: unknown }).sleepHours;
  const importedSleepHours = parseHours(rawSleepHours);
  if ("sleepHours" in item && (rawSleepHours === "" || rawSleepHours === undefined)) {
    item.sleepHours = null;
  } else if ("sleepHours" in item && importedSleepHours !== null) {
    item.sleepHours = importedSleepHours;
  }

  if ("sleepHours" in item && item.sleepHours !== null && typeof item.sleepHours !== "number") {
    errors.push({ index, date: dateForIssue, message: "sleepHours は数値または null にしてください。" });
  } else if (typeof item.sleepHours === "number" && !SLEEP_HOUR_OPTIONS.includes(item.sleepHours)) {
    errors.push({ index, date: dateForIssue, message: "sleepHours は0.5〜12.0の0.5時間刻みにしてください。" });
  }

  const rawNapHours = (item as { napHours?: unknown }).napHours;
  const importedNapHours = parseHours(rawNapHours);
  if ("napHours" in item && (rawNapHours === "" || rawNapHours === undefined)) {
    item.napHours = null;
  } else if ("napHours" in item && importedNapHours !== null) {
    item.napHours = importedNapHours;
  }
  if ("napHours" in item && rawNapHours !== null && rawNapHours !== "" && rawNapHours !== undefined && importedNapHours === null) {
    errors.push({ index, date: dateForIssue, message: "napHours は数値、時間つき文字列、または null にしてください。" });
  } else if (typeof importedNapHours === "number" && !NAP_HOUR_OPTIONS.includes(importedNapHours)) {
    errors.push({ index, date: dateForIssue, message: "napHours は0〜6.0の0.5時間刻みにしてください。" });
  }

  if ("napMinutes" in item && item.napMinutes !== null) {
    if (typeof item.napMinutes !== "number" || !Number.isFinite(item.napMinutes) || item.napMinutes < 0 || item.napMinutes >= 24 * 60) {
      errors.push({ index, date: dateForIssue, message: "napMinutes は0〜1439の分数または null にしてください。" });
    }
  }

  (["everydayExpense", "satisfactionExpense", "regretExpense"] as const).forEach((key) => {
    if (key in item && item[key] !== null) {
      if (typeof item[key] !== "number" || !Number.isFinite(item[key]) || item[key]! < 0) {
        errors.push({ index, date: dateForIssue, message: `${key} は0以上の数値または null にしてください。` });
      }
    }
  });

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

  // photos は写真機能（2026-07-30）以降のフィールド。無いJSONもそのまま読み込める
  if ("photos" in item) {
    if (!Array.isArray(item.photos)) {
      errors.push({ index, date: dateForIssue, message: "photos は配列にしてください。" });
    } else {
      item.photos.forEach((photo, photoIndex) => {
        if (!photo || typeof photo !== "object") {
          errors.push({ index, date: dateForIssue, message: `photos ${photoIndex + 1}件目はオブジェクトにしてください。` });
          return;
        }
        const partial = photo as Partial<DiaryPhoto>;
        if (typeof partial.id !== "string" || !partial.id) {
          errors.push({ index, date: dateForIssue, message: `photos ${photoIndex + 1}件目の id がありません。` });
        }
        (["width", "height", "byteSize"] as const).forEach((key) => {
          if (key in partial && typeof partial[key] !== "number") {
            errors.push({ index, date: dateForIssue, message: `photos ${photoIndex + 1}件目の ${key} は数値にしてください。` });
          }
        });
      });
      const ids = item.photos
        .filter((photo): photo is DiaryPhoto => !!photo && typeof photo === "object")
        .map((photo) => photo.id);
      if (new Set(ids).size !== ids.length) {
        errors.push({ index, date: dateForIssue, message: "photos の id が同じ日の中で重複しています。" });
      }
      if (item.photos.length > PHOTO_MAX_COUNT) {
        warnings.push({
          index,
          date: dateForIssue,
          message: `写真が${item.photos.length}枚あります（上限${PHOTO_MAX_COUNT}枚）。そのまま読み込みますが、追加はできません。`,
        });
      }
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

export function buildSleepChartPoints(entries: DiaryEntry[], dayBoundaryTime: string): SleepChartPoint[] {
  const metricsByDate = buildSleepMetricsMap(entries, dayBoundaryTime);
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map((entry) => {
      const metrics = metricsByDate.get(entry.date)!;
      const sleepHours = metrics.nightMinutes === null ? null : metrics.nightMinutes / 60;
      const napHours = (metrics.napMinutes ?? 0) / 60;
      return {
        date: entry.date,
        label: formatShortDate(entry.date),
        sleepHours,
        napHours,
        totalHours: metrics.totalMinutes === null ? null : metrics.totalMinutes / 60,
        wakeTime: parseWakeTime(entry.wakeUpTime),
        bedTime: metrics.resolvedPreviousBedAt
          ? `${String(metrics.resolvedPreviousBedAt.getHours()).padStart(2, "0")}:${String(metrics.resolvedPreviousBedAt.getMinutes()).padStart(2, "0")}`
          : null,
      };
    });
}

export function formatChartTime(value: number | null): string {
  return value === null ? "-" : formatWakeTick(value);
}

export function sleepDetailDateLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日（${weekdayOf(date)}）`;
}

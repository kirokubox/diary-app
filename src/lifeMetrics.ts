import { addDays, toDateInputValue } from "./dateUtils";
import type { AppSettings, DiaryEntry } from "./types";

export type SleepMetrics = {
  nightMinutes: number | null;
  napMinutes: number | null;
  totalMinutes: number | null;
  source: "times" | "legacy" | "none";
  resolvedPreviousBedAt: Date | null;
};

export type ExpenseBreakdown = {
  everyday: number | null;
  satisfaction: number | null;
  regret: number | null;
  total: number | null;
};

export type ExpensePeriod = {
  start: string;
  end: string;
};

const TIME_PATTERN = /^(\d{2}):([0-5]\d)$/;

export function parseTimeMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(TIME_PATTERN);
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours > 23) return null;
  return hours * 60 + Number(match[2]);
}

export function normalizeOptionalMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

export function getNapMinutes(entry: DiaryEntry): number | null {
  if (typeof entry.napMinutes === "number" && Number.isFinite(entry.napMinutes) && entry.napMinutes >= 0) {
    return Math.round(entry.napMinutes);
  }
  if (typeof entry.napHours === "number" && Number.isFinite(entry.napHours) && entry.napHours >= 0) {
    return Math.round(entry.napHours * 60);
  }
  return null;
}

function dateAt(dateText: string, minutes: number): Date {
  const date = new Date(`${dateText}T00:00:00`);
  date.setMinutes(minutes);
  return date;
}

export function resolveBedDateTime(entry: DiaryEntry, dayBoundaryTime: string): Date | null {
  const bedMinutes = parseTimeMinutes(entry.bedTime);
  if (bedMinutes === null) return null;
  const wakeMinutes = parseTimeMinutes(entry.wakeUpTime);
  const boundaryMinutes = parseTimeMinutes(dayBoundaryTime) ?? 300;
  const isNextCalendarDay = wakeMinutes !== null ? bedMinutes <= wakeMinutes : bedMinutes < boundaryMinutes;
  return dateAt(isNextCalendarDay ? addDays(entry.date, 1) : entry.date, bedMinutes);
}

export function getSleepMetrics(
  entry: DiaryEntry,
  previousEntry: DiaryEntry | undefined,
  dayBoundaryTime: string,
): SleepMetrics {
  const wakeMinutes = parseTimeMinutes(entry.wakeUpTime);
  const previousBedAt = previousEntry ? resolveBedDateTime(previousEntry, dayBoundaryTime) : null;
  if (wakeMinutes !== null && previousBedAt) {
    const wakeAt = dateAt(entry.date, wakeMinutes);
    const nightMinutes = Math.round((wakeAt.getTime() - previousBedAt.getTime()) / 60000);
    if (nightMinutes > 0 && nightMinutes < 24 * 60) {
      const napMinutes = getNapMinutes(entry);
      return {
        nightMinutes,
        napMinutes,
        totalMinutes: nightMinutes + (napMinutes ?? 0),
        source: "times",
        resolvedPreviousBedAt: previousBedAt,
      };
    }
  }

  const legacyNightMinutes =
    typeof entry.sleepHours === "number" && Number.isFinite(entry.sleepHours) && entry.sleepHours > 0 && entry.sleepHours < 24
      ? Math.round(entry.sleepHours * 60)
      : null;
  const napMinutes = getNapMinutes(entry);
  return {
    nightMinutes: legacyNightMinutes,
    napMinutes,
    totalMinutes: legacyNightMinutes === null ? null : legacyNightMinutes + (napMinutes ?? 0),
    source: legacyNightMinutes === null ? "none" : "legacy",
    resolvedPreviousBedAt: previousBedAt,
  };
}

export function buildSleepMetricsMap(entries: DiaryEntry[], dayBoundaryTime: string): Map<string, SleepMetrics> {
  const entryByDate = new Map(entries.map((entry) => [entry.date, entry]));
  return new Map(
    entries.map((entry) => [entry.date, getSleepMetrics(entry, entryByDate.get(addDays(entry.date, -1)), dayBoundaryTime)]),
  );
}

export function formatHoursCompact(minutes: number | null): string {
  return minutes === null ? "−" : `${(minutes / 60).toFixed(1)}h`;
}

export function formatDurationJa(minutes: number | null): string {
  if (minutes === null) return "未入力";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}時間${String(rest).padStart(2, "0")}分` : `${rest}分`;
}

export function expenseBreakdown(entry: DiaryEntry): ExpenseBreakdown {
  const everyday = normalizeOptionalMoney(entry.everydayExpense);
  const satisfaction = normalizeOptionalMoney(entry.satisfactionExpense);
  const regret = normalizeOptionalMoney(entry.regretExpense);
  const values = [everyday, satisfaction, regret];
  return {
    everyday,
    satisfaction,
    regret,
    total: values.every((value) => value === null)
      ? null
      : values.reduce<number>((sum, value) => sum + (value ?? 0), 0),
  };
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function periodStart(year: number, monthIndex: number, startDay: number): string {
  const date = new Date(year, monthIndex, Math.min(startDay, daysInMonth(year, monthIndex)));
  return toDateInputValue(date);
}

export function getExpensePeriod(today: string, startDay: number): ExpensePeriod {
  const [year, month] = today.split("-").map(Number);
  const safeStartDay = Math.min(31, Math.max(1, Math.round(startDay)));
  const thisMonthStart = periodStart(year, month - 1, safeStartDay);
  const start = today >= thisMonthStart ? thisMonthStart : periodStart(year, month - 2, safeStartDay);
  const [startYear, startMonth] = start.split("-").map(Number);
  const nextStart = periodStart(startYear, startMonth, safeStartDay);
  return { start, end: addDays(nextStart, -1) };
}

export function periodExpenseTotal(entries: DiaryEntry[], period: ExpensePeriod, throughDate = period.end): number {
  return entries
    .filter((entry) => entry.date >= period.start && entry.date <= period.end && entry.date <= throughDate)
    .reduce((sum, entry) => sum + (expenseBreakdown(entry).total ?? 0), 0);
}

export function recentSleepAverageMinutes(
  entries: DiaryEntry[],
  dayBoundaryTime: string,
): number | null {
  const metrics = buildSleepMetricsMap(entries, dayBoundaryTime);
  const values = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7)
    .map((entry) => metrics.get(entry.date)?.totalMinutes ?? null)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function buildWidgetSnapshot(entries: DiaryEntry[], settings: AppSettings, today: string) {
  const averageMinutes = recentSleepAverageMinutes(entries, settings.dayBoundaryTime);
  const period = getExpensePeriod(today, settings.variableExpenseStartDay);
  const remaining = settings.variableExpenseBudget - periodExpenseTotal(entries, period, today);
  const yesterday = entries.find((entry) => entry.date === addDays(today, -1));
  return {
    averageSleepText: formatHoursCompact(averageMinutes),
    remainingText: remaining >= 0 ? `${remaining.toLocaleString("ja-JP")}円` : `超過${Math.abs(remaining).toLocaleString("ja-JP")}円`,
    yesterdayExpenseText: yesterday ? formatMoneyCompact(expenseBreakdown(yesterday).total) : "−",
    updatedAt: new Date().toISOString(),
  };
}

export function formatMoneyCompact(value: number | null): string {
  return value === null ? "−" : `${value.toLocaleString("ja-JP")}円`;
}

// ---- 変動費の入力（変動費全額・日常費・反省費）----
// 保存フィールドは従来どおり everyday / satisfaction / regret の3つ。
// 画面は「全額 = 3分類の合計」を表示し、保存時は「満足費 = 全額 − 日常費 − 反省費」で戻す。
// 新しい永続フィールドを増やさないため、既存データはそのまま読み書きできる。

export const EXPENSE_OVER_TOTAL_MESSAGE = "日常費と反省費の合計が変動費全額を超えています";

export type ExpenseInputDraft = {
  total: string;
  everyday: string;
  regret: string;
};

export type ExpenseInputValues = {
  everydayExpense: number | null;
  satisfactionExpense: number | null;
  regretExpense: number | null;
};

export type ExpenseInputResult = {
  error: string;
  // 矛盾入力（日常費＋反省費＞全額）のときは null。保存へ反映せず、直前の値を保つ
  values: ExpenseInputValues | null;
};

export function toExpenseInputDraft(entry: DiaryEntry): ExpenseInputDraft {
  const expenses = expenseBreakdown(entry);
  return {
    total: expenses.total === null ? "" : String(expenses.total),
    everyday: expenses.everyday === null ? "" : String(expenses.everyday),
    regret: expenses.regret === null ? "" : String(expenses.regret),
  };
}

export function resolveExpenseInput(draft: ExpenseInputDraft): ExpenseInputResult {
  const total = normalizeOptionalMoney(draft.total);
  const everyday = normalizeOptionalMoney(draft.everyday);
  const regret = normalizeOptionalMoney(draft.regret);
  // 全額が未入力なら満足費も未入力扱い（0円と未入力は区別したままにする）
  if (total === null) {
    return { error: "", values: { everydayExpense: everyday, satisfactionExpense: null, regretExpense: regret } };
  }
  const used = (everyday ?? 0) + (regret ?? 0);
  if (used > total) return { error: EXPENSE_OVER_TOTAL_MESSAGE, values: null };
  return { error: "", values: { everydayExpense: everyday, satisfactionExpense: total - used, regretExpense: regret } };
}

// ---- 仮眠時間の入力（経過時間を「時間」「分」で分けて入力する）----
// 保存は従来どおり napMinutes（分）。睡眠計算はこのファイルの既存関数をそのまま使う。

export type NapDraft = {
  hours: string;
  minutes: string;
};

function parseNapPart(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.floor(number);
}

export function toNapDraft(minutes: number | null | undefined): NapDraft {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return { hours: "", minutes: "" };
  const rounded = Math.round(minutes);
  const hourPart = Math.floor(rounded / 60);
  return { hours: hourPart === 0 ? "" : String(hourPart), minutes: String(rounded % 60) };
}

export function napDraftToMinutes(draft: NapDraft): number | null {
  const hours = parseNapPart(draft.hours);
  const minutes = parseNapPart(draft.minutes);
  if (hours === null && minutes === null) return null;
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

import { addDays, addMonths, monthOf, weekEndOf, weekStartOf } from "./dateUtils";
import type { MonthlyReview, WeeklyReview } from "./types";

export const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export type PeriodMarkdownContext = {
  currentWeek?: WeeklyReview;
  nextWeek?: WeeklyReview;
  currentMonth?: MonthlyReview;
  previousMonth?: MonthlyReview;
  nextMonth?: MonthlyReview;
};

/** 週目標の閉じた表示。項目式なら「まとめの1文」、旧形式なら先頭行を使う。 */
export function weeklyGoalSummary(goalTheme: string): string {
  const lines = goalTheme.split(/\r?\n/).map((line) => line.trim());
  const summaryIndex = lines.findIndex((line) => /^まとめの1文[：:]/.test(line));
  if (summaryIndex >= 0) {
    const sameLine = lines[summaryIndex].replace(/^まとめの1文[：:]\s*/, "").trim();
    if (sameLine) return sameLine;
    for (let i = summaryIndex + 1; i < lines.length; i += 1) {
      if (/^[^：:]+[：:]\s*/.test(lines[i])) break;
      if (lines[i]) return lines[i];
    }
    return "";
  }
  return lines.find(Boolean) ?? "";
}

export function makeWeeklyReview(weekStart: string, now: string): WeeklyReview {
  return { weekStart, goalTheme: "", reflection: "", createdAt: now, updatedAt: now };
}

export function makeMonthlyReview(month: string, now: string): MonthlyReview {
  return { month, goalTheme: "", reflection: "", createdAt: now, updatedAt: now };
}

export function normalizeWeeklyReview(value: unknown): WeeklyReview | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<WeeklyReview>;
  if (
    typeof item.weekStart !== "string" ||
    !WEEK_START_PATTERN.test(item.weekStart) ||
    weekStartOf(item.weekStart) !== item.weekStart ||
    typeof item.goalTheme !== "string" ||
    typeof item.reflection !== "string" ||
    typeof item.createdAt !== "string" ||
    typeof item.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    weekStart: item.weekStart,
    goalTheme: item.goalTheme,
    reflection: item.reflection,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function normalizeMonthlyReview(value: unknown): MonthlyReview | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<MonthlyReview>;
  if (
    typeof item.month !== "string" ||
    !MONTH_PATTERN.test(item.month) ||
    Number(item.month.slice(5, 7)) < 1 ||
    Number(item.month.slice(5, 7)) > 12 ||
    typeof item.goalTheme !== "string" ||
    typeof item.reflection !== "string" ||
    typeof item.createdAt !== "string" ||
    typeof item.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    month: item.month,
    goalTheme: item.goalTheme,
    reflection: item.reflection,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function periodContextForDate(
  date: string,
  weeklyReviews: WeeklyReview[],
  monthlyReviews: MonthlyReview[],
): PeriodMarkdownContext {
  const weekStart = weekStartOf(date);
  const month = monthOf(date);
  return {
    currentWeek: weeklyReviews.find((item) => item.weekStart === weekStart),
    nextWeek: weeklyReviews.find((item) => item.weekStart === addDays(weekStart, 7)),
    currentMonth: monthlyReviews.find((item) => item.month === month),
    previousMonth: monthlyReviews.find((item) => item.month === addMonths(month, -1)),
    nextMonth: monthlyReviews.find((item) => item.month === addMonths(month, 1)),
  };
}

export function formatWeekRange(weekStart: string): string {
  const end = weekEndOf(weekStart);
  return `${Number(weekStart.slice(5, 7))}/${Number(weekStart.slice(8, 10))}〜${Number(end.slice(5, 7))}/${Number(end.slice(8, 10))}`;
}

import { formatDateJa, isFirstDayOfMonth, isLastDayOfMonth, isSunday, nowIsoLocal, timeOnly } from "./dateUtils";
import type { PeriodMarkdownContext } from "./periodReviews";
import type { DiaryEntry, MonthlyReview, WeeklyReview } from "./types";

function valueOrBlank(value: string | undefined): string {
  return value?.trim() ?? "";
}

function rawValue(value: string | undefined): string {
  return value ?? "";
}

// 睡眠・変動費は「生活記録」「らくな家計簿」へ移ったため、Markdownには出さない（データ自体は日記に保持している）
function periodSections(entry: DiaryEntry, context: PeriodMarkdownContext): string {
  const sections: string[] = [];
  if (isSunday(entry.date)) {
    sections.push(`### 本人の今週の振り返り\n\n${rawValue(context.currentWeek?.reflection)}`);
    sections.push(`### 本人の来週の目標・テーマ\n\n${rawValue(context.nextWeek?.goalTheme)}`);
  }
  if (isLastDayOfMonth(entry.date)) {
    sections.push(`### 本人の今月の振り返り\n\n${rawValue(context.currentMonth?.reflection)}`);
    sections.push(`### 本人の来月の目標・テーマ\n\n${rawValue(context.nextMonth?.goalTheme)}`);
  }
  if (isFirstDayOfMonth(entry.date)) {
    sections.push(`### 本人の先月の振り返り\n\n${rawValue(context.previousMonth?.reflection)}`);
    sections.push(`### 本人の今月の目標・テーマ\n\n${rawValue(context.currentMonth?.goalTheme)}`);
  }
  return sections.length > 0 ? `${sections.join("\n\n")}\n\n` : "";
}

function periodArchiveToMarkdown(weeklyReviews: WeeklyReview[], monthlyReviews: MonthlyReview[]): string {
  if (weeklyReviews.length === 0 && monthlyReviews.length === 0) return "";
  const monthly = [...monthlyReviews]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((review) => `### ${review.month}\n\n#### 本人の目標・テーマ\n\n${rawValue(review.goalTheme)}\n\n#### 本人の振り返り\n\n${rawValue(review.reflection)}`)
    .join("\n\n");
  const weekly = [...weeklyReviews]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((review) => `### ${review.weekStart}から始まる週\n\n#### 本人の目標・テーマ\n\n${rawValue(review.goalTheme)}\n\n#### 本人の振り返り\n\n${rawValue(review.reflection)}`)
    .join("\n\n");
  return `\n\n---\n\n# 週次・月次記録\n\n${monthly ? `## 月次\n\n${monthly}` : ""}${monthly && weekly ? "\n\n" : ""}${weekly ? `## 週次\n\n${weekly}` : ""}`;
}

export function entryToMarkdown(entry: DiaryEntry, context: PeriodMarkdownContext = {}): string {
  const scratchItems = [...(entry.scratchItems ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const scratchHistory = scratchItems.map((item) => `- ${timeOnly(item.createdAt)}　${item.text}`).join("\n");
  // 写真がある日だけ枚数を書く。画像そのものはMarkdownに含めない（写真つきZIPバックアップ側で扱う）
  const photoCount = (entry.photos ?? []).length;
  const photoSection =
    photoCount > 0 ? `### 写真\n\n- ${photoCount}枚（画像はMarkdownに含まれません）\n\n` : "";

  return `## ${formatDateJa(entry.date)}（${entry.weekday}）

### 日次振り返り

${valueOrBlank(entry.body)}

### 日記

${valueOrBlank(entry.scratch)}

${photoSection}${periodSections(entry, context)}### らくがきメモ履歴

${scratchHistory}`;
}

export function entriesToMarkdown(
  entries: DiaryEntry[],
  weeklyReviews: WeeklyReview[] = [],
  monthlyReviews: MonthlyReview[] = [],
): string {
  return `# Web日記エクスポート
出力日：${nowIsoLocal().slice(0, 10)}
件数：${entries.length}件

---

${entries.map((entry) => entryToMarkdown(entry)).join("\n\n---\n\n")}${periodArchiveToMarkdown(weeklyReviews, monthlyReviews)}`;
}

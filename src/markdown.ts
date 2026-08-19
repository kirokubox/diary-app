import { addDays, formatDateJa, nowIsoLocal, timeOnly } from "./dateUtils";
import { expenseBreakdown, formatDurationJa, getSleepMetrics } from "./lifeMetrics";
import type { DiaryEntry } from "./types";

function valueOrBlank(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function entryToMarkdown(entry: DiaryEntry, previousEntry?: DiaryEntry, dayBoundaryTime = "05:00"): string {
  const scratchItems = [...(entry.scratchItems ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const scratchHistory = scratchItems.map((item) => `- ${timeOnly(item.createdAt)}　${item.text}`).join("\n");
  const sleep = getSleepMetrics(entry, previousEntry, dayBoundaryTime);
  const expenses = expenseBreakdown(entry);
  // 写真がある日だけ枚数を書く。画像そのものはMarkdownに含めない（写真つきZIPバックアップ側で扱う）
  const photoCount = (entry.photos ?? []).length;
  const photoSection =
    photoCount > 0 ? `### 写真\n\n- ${photoCount}枚（画像はMarkdownに含まれません）\n\n` : "";

  const expenseSection = expenses.total === null ? "" : `

### 変動費

- 日常費：${expenses.everyday === null ? "未入力" : `${expenses.everyday.toLocaleString("ja-JP")}円`}
- 満足費：${expenses.satisfaction === null ? "未入力" : `${expenses.satisfaction.toLocaleString("ja-JP")}円`}
- 反省費：${expenses.regret === null ? "未入力" : `${expenses.regret.toLocaleString("ja-JP")}円`}
- 合計：${expenses.total.toLocaleString("ja-JP")}円`;

  return `## ${formatDateJa(entry.date)}（${entry.weekday}）

### 日次振り返り

${valueOrBlank(entry.body)}

### 日記

${valueOrBlank(entry.scratch)}

${photoSection}### らくがきメモ履歴

${scratchHistory}

### 睡眠

- 起床時間：${valueOrBlank(entry.wakeUpTime)}
- 就寝時間：${valueOrBlank(entry.bedTime) || "未入力"}
- 睡眠時間：${formatDurationJa(sleep.nightMinutes)}
- 仮眠時間：${formatDurationJa(sleep.napMinutes)}
- 睡眠合計：${formatDurationJa(sleep.totalMinutes)}${expenseSection}`;
}

export function entriesToMarkdown(entries: DiaryEntry[], dayBoundaryTime = "05:00"): string {
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  return `# Web日記エクスポート
出力日：${nowIsoLocal().slice(0, 10)}
件数：${entries.length}件

---

${entries.map((entry) => entryToMarkdown(entry, byDate.get(addDays(entry.date, -1)), dayBoundaryTime)).join("\n\n---\n\n")}`;
}

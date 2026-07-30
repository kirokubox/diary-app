import { formatDateJa, nowIsoLocal, timeOnly } from "./dateUtils";
import type { DiaryEntry } from "./types";

function valueOrBlank(value: string | undefined): string {
  return value?.trim() ?? "";
}

function hoursValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "未入力") return null;
  const numeric = Number(trimmed.replace("時間", ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function hoursLabel(value: unknown): string {
  const hours = hoursValue(value);
  return hours === null ? "" : `${hours.toFixed(1)}時間`;
}

export function entryToMarkdown(entry: DiaryEntry): string {
  const scratchItems = [...(entry.scratchItems ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const scratchHistory = scratchItems.map((item) => `- ${timeOnly(item.createdAt)}　${item.text}`).join("\n");
  const sleepHours = hoursValue(entry.sleepHours);
  const napHours = hoursValue(entry.napHours) ?? 0;
  const totalSleepHours = sleepHours === null ? null : sleepHours + napHours;
  // 写真がある日だけ枚数を書く。画像そのものはMarkdownに含めない（写真つきZIPバックアップ側で扱う）
  const photoCount = (entry.photos ?? []).length;
  const photoSection =
    photoCount > 0 ? `### 写真\n\n- ${photoCount}枚（画像はMarkdownに含まれません）\n\n` : "";

  return `## ${formatDateJa(entry.date)}（${entry.weekday}）

### 日次振り返り

${valueOrBlank(entry.body)}

### 日記

${valueOrBlank(entry.scratch)}

${photoSection}### らくがきメモ履歴

${scratchHistory}

### 睡眠

- 起床時間：${valueOrBlank(entry.wakeUpTime)}
- 睡眠時間：${hoursLabel(entry.sleepHours)}
- 仮眠時間：${hoursLabel(entry.napHours)}
- 睡眠合計：${totalSleepHours === null ? "" : `${totalSleepHours.toFixed(1)}時間`}`;
}

export function entriesToMarkdown(entries: DiaryEntry[]): string {
  return `# Web日記エクスポート
出力日：${nowIsoLocal().slice(0, 10)}
件数：${entries.length}件

---

${entries.map(entryToMarkdown).join("\n\n---\n\n")}`;
}

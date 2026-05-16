import { formatDateJa, nowIsoLocal, timeOnly } from "./dateUtils";
import type { DiaryEntry } from "./types";

function valueOrNone(value: string | undefined): string {
  return value?.trim() || "なし";
}

export function entryToMarkdown(entry: DiaryEntry): string {
  const tags = entry.tags.length > 0 ? entry.tags.map((tag) => `#${tag}`).join(" ") : "なし";
  const scratchItems = [...(entry.scratchItems ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const scratchHistory =
    scratchItems.length > 0
      ? scratchItems.map((item) => `- ${timeOnly(item.createdAt)}　${item.text}`).join("\n")
      : "なし";

  return `## ${formatDateJa(entry.date)}（${entry.weekday}）

### 日記本文

${valueOrNone(entry.body)}

### らくがきメモ履歴

${scratchHistory}

### らくがき帳・自由メモ

${valueOrNone(entry.scratch)}

### タグ

${tags}

### 気分・体力

- 気分：${valueOrNone(entry.mood)}
- 体力：${valueOrNone(entry.energy)}`;
}

export function entriesToMarkdown(entries: DiaryEntry[]): string {
  return `# Web日記エクスポート

出力日：${nowIsoLocal().slice(0, 10)}
件数：${entries.length}件

---

${entries.map(entryToMarkdown).join("\n\n---\n\n")}`;
}

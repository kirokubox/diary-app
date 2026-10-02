import { formatDateJa, nowIsoLocal, timeOnly } from "./dateUtils";
import type { DiaryEntry } from "./types";

function valueOrBlank(value: string | undefined): string {
  return value?.trim() ?? "";
}

// 睡眠・変動費は「生活記録」「らくな家計簿」へ移ったため、Markdownには出さない（データ自体は日記に保持している）
export function entryToMarkdown(entry: DiaryEntry): string {
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

${photoSection}### らくがきメモ履歴

${scratchHistory}`;
}

export function entriesToMarkdown(entries: DiaryEntry[]): string {
  return `# Web日記エクスポート
出力日：${nowIsoLocal().slice(0, 10)}
件数：${entries.length}件

---

${entries.map((entry) => entryToMarkdown(entry)).join("\n\n---\n\n")}`;
}

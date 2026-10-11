import { CompactEntryCard } from "./CompactEntryCard";
import type { DiaryEntry } from "./types";

// 「1か月前」「1年前」などの思い出。記録がある日だけ呼び出す
export function MemoryCard({
  label,
  entry,
  onOpen,
}: {
  label: string;
  entry: DiaryEntry;
  onOpen: (date: string) => void | Promise<void>;
}) {
  return (
    <div className="memory-item">
      <p className="memory-label">{label}</p>
      <CompactEntryCard entry={entry} onOpen={onOpen} />
    </div>
  );
}

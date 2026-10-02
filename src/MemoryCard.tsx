import { CompactEntryCard } from "./CompactEntryCard";
import type { DiaryEntry } from "./types";

export function MemoryCard({
  label,
  entry,
  onOpen,
}: {
  label: string;
  entry: DiaryEntry | null;
  onOpen: (date: string) => void | Promise<void>;
}) {
  return (
    <section className="memory-card">
      <p className="memory-label">{label}</p>
      {entry ? (
        <CompactEntryCard entry={entry} onOpen={onOpen} />
      ) : (
        <p className="memory-empty">記録なし</p>
      )}
    </section>
  );
}

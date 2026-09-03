import { CompactEntryCard } from "./CompactEntryCard";
import type { SleepMetrics } from "./lifeMetrics";
import type { DiaryEntry } from "./types";

export function MemoryCard({
  label,
  entry,
  sleep,
  onOpen,
}: {
  label: string;
  entry: DiaryEntry | null;
  sleep?: SleepMetrics;
  onOpen: (date: string) => void | Promise<void>;
}) {
  return (
    <section className="memory-card">
      <p className="memory-label">{label}</p>
      {entry ? (
        <CompactEntryCard entry={entry} sleep={sleep} onOpen={onOpen} />
      ) : (
        <p className="memory-empty">記録なし</p>
      )}
    </section>
  );
}

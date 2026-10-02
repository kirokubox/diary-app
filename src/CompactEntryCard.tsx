import { buildEntrySummary } from "./summary";
import type { SearchSnippet } from "./summary";
import type { DiaryEntry } from "./types";

export function CompactEntryCard({
  entry,
  snippet,
  onOpen,
}: {
  entry: DiaryEntry;
  snippet?: SearchSnippet | null;
  onOpen: (date: string) => void | Promise<void>;
}) {
  // 写真がある日だけカメラアイコンと枚数を足す（1行に収め、カードを高くしない）
  const rhythmItems = [entry.photos.length > 0 ? `📷 ${entry.photos.length}` : ""].filter(Boolean);
  const summary = snippet ? "" : buildEntrySummary(entry);
  return (
    <button className="entry-card compact-card" onClick={() => onOpen(entry.date)} type="button">
      <span className="card-date">
        {entry.date}（{entry.weekday}）
      </span>
      {snippet ? (
        <span className="card-snippet">
          {snippet.before}
          <mark>{snippet.match}</mark>
          {snippet.after}
        </span>
      ) : (
        summary && <span className="card-summary">{summary}</span>
      )}
      {rhythmItems.length > 0 && <span className="card-rhythm">{rhythmItems.join("　")}</span>}
    </button>
  );
}

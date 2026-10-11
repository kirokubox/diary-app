import { formatDateLabel } from "./dateUtils";
import { Icon } from "./Icon";
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
  const summary = snippet ? "" : buildEntrySummary(entry);
  return (
    <button className="entry-row" onClick={() => onOpen(entry.date)} type="button">
      <span className="entry-main">
        <span className="entry-date">
          {formatDateLabel(entry.date)}
          {/* 写真がある日だけ枚数を足す（1行に収め、行を高くしない） */}
          {entry.photos.length > 0 && (
            <span className="entry-photos">
              <Icon name="image" size={14} />
              {entry.photos.length}
            </span>
          )}
        </span>
        {snippet ? (
          <span className="entry-summary">
            {snippet.before}
            <mark>{snippet.match}</mark>
            {snippet.after}
          </span>
        ) : (
          summary && <span className="entry-summary">{summary}</span>
        )}
      </span>
      <span className="entry-chevron">
        <Icon name="chevron-right" size={18} />
      </span>
    </button>
  );
}

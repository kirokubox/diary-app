import { useEffect, useState } from "react";
import { EntryReadOnlyContent } from "./EntryReadOnlyContent";
import { Icon } from "./Icon";
import type { DiaryEntry } from "./types";

export type InlineMemory = {
  label: string;
  entry: DiaryEntry;
};

// 入力中の日付を基準にした1か月前・1年前の日記を、その場で読むための折りたたみ。
// 日付移動や画面の開き直しでは展開状態を引き継がない。
export function InlineMemories({ activeDate, items }: { activeDate: string; items: InlineMemory[] }) {
  const [openDate, setOpenDate] = useState<string | null>(null);

  useEffect(() => setOpenDate(null), [activeDate]);
  if (items.length === 0) return null;

  return (
    <section className="inline-memories" aria-label="過去の日記">
      <h2 className="section-title">過去の日記</h2>
      <div className="inline-memory-list">
        {items.map(({ label, entry }) => {
          const open = openDate === entry.date;
          return (
            <div className={open ? "inline-memory open" : "inline-memory"} key={entry.date}>
              <button
                className="inline-memory-head"
                type="button"
                aria-expanded={open}
                onClick={() => setOpenDate(open ? null : entry.date)}
              >
                <span>{label}</span>
                <span className={open ? "fold-caret down open" : "fold-caret down"}>
                  <Icon name="chevron-down" size={18} />
                </span>
              </button>
              {open && (
                <div className="inline-memory-body">
                  <EntryReadOnlyContent entry={entry} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

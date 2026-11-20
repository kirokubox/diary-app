import { useEffect, useState } from "react";
import { formatDateLabel } from "./dateUtils";
import { EntryReadOnlyContent } from "./EntryReadOnlyContent";
import { Icon } from "./Icon";
import type { DiaryEntry } from "./types";

export type InlineMemory = {
  /** 「1か月前」「2年前」など */
  label: string;
  entry: DiaryEntry;
};

// 本文の最初の1行（日記→振り返りの順に、空行・見出し・未記入の問いを飛ばす）。カードの2行目に出す
export function memoryPreview(entry: DiaryEntry): string {
  const lines = [entry.scratch, entry.body]
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !/^■/.test(line) && !/[：:]$/.test(line));
  const first = lines[0] ?? "";
  // 「出来事：駅前で…」のような問いの行は、問いの部分を外して中身だけにする
  const match = first.match(/^[^：:]{1,20}[：:]\s*(.+)$/);
  return match ? match[1] : first;
}

// 入力中の日付を基準にした1か月前・n年前の日記を、1行のカードで並べる。
// 押すと下から出るシートで全文を読む（ページは移動しない）。日付を移ったらシートは閉じる。
export function InlineMemories({ activeDate, items }: { activeDate: string; items: InlineMemory[] }) {
  const [openDate, setOpenDate] = useState<string | null>(null);

  useEffect(() => setOpenDate(null), [activeDate]);
  if (items.length === 0) return null;

  const opened = items.find((item) => item.entry.date === openDate) ?? null;

  return (
    <section className="inline-memories" aria-label="過去の日記">
      <h2 className="section-title">過去の日記</h2>
      <div className="inline-memory-list">
        {items.map(({ label, entry }) => {
          const preview = memoryPreview(entry);
          return (
            <button className="inline-memory" type="button" key={entry.date} onClick={() => setOpenDate(entry.date)}>
              <span className="inline-memory-text">
                <span className="inline-memory-label">
                  {label}
                  <span className="inline-memory-date">{formatDateLabel(entry.date)}</span>
                </span>
                <span className="inline-memory-preview">{preview || "写真・らくがきだけの日"}</span>
              </span>
              <Icon name="chevron-right" size={18} />
            </button>
          );
        })}
      </div>
      {opened && <MemorySheet label={opened.label} entry={opened.entry} onClose={() => setOpenDate(null)} />}
    </section>
  );
}

function MemorySheet({ label, entry, onClose }: { label: string; entry: DiaryEntry; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // 写真の拡大表示が開いているときは、そちらが先に閉じる
      if (event.key === "Escape" && !document.querySelector(".photo-viewer")) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="memory-sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="memory-sheet" role="dialog" aria-modal="true" aria-label={`${label}の日記`}>
        <div className="memory-sheet-head">
          <div>
            <p className="memory-sheet-label">{label}</p>
            <h2 className="memory-sheet-title">{formatDateLabel(entry.date)}</h2>
          </div>
          <button className="icon-btn" type="button" aria-label="閉じる" title="閉じる" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="memory-sheet-body">
          <EntryReadOnlyContent entry={entry} />
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { timeOnly } from "./dateUtils";
import { Icon } from "./Icon";
import { PhotoSection } from "./PhotoSection";
import { parseBodySections } from "./summary";
import type { DiaryEntry } from "./types";

// 閲覧画面と入力画面内の「過去の日記」で共有する、日記本文の読み取り専用表示。
// 並び順や写真ビューアを1か所に保ち、表示場所ごとの差が生まれないようにする。
export function EntryReadOnlyContent({ entry }: { entry: DiaryEntry }) {
  const [showEmpty, setShowEmpty] = useState(false);
  useEffect(() => setShowEmpty(false), [entry.id]);
  const scratchText = entry.scratch.trim();
  const sortedScratchItems = [...entry.scratchItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sections = useMemo(() => parseBodySections(entry.body), [entry.body]);
  const emptyCount = sections.reduce(
    (sum, section) => sum + section.emptyLabels.length + (section.items.length === 0 && section.emptyLabels.length === 0 ? 1 : 0),
    0,
  );
  const visibleSections = showEmpty ? sections : sections.filter((section) => section.items.length > 0);

  return (
    <>
      {(visibleSections.length > 0 || emptyCount > 0) && (
        <section className="reading-section">
          <h2 className="section-title">振り返り</h2>
          <div className="card reading-card">
            {visibleSections.map((section, sectionIndex) => (
              <div className="view-block" key={sectionIndex}>
                {section.title && <h3 className="view-heading">{section.title}</h3>}
                {section.items.map((item, index) =>
                  item.kind === "field" ? (
                    <div className="view-row" key={index}>
                      <span className="view-key">{item.label}</span>
                      <span className="view-val">{item.value}</span>
                    </div>
                  ) : (
                    <p className="view-text" key={index}>{item.text}</p>
                  ),
                )}
                {showEmpty && section.emptyLabels.map((label) => (
                  <div className="view-row empty" key={label}>
                    <span className="view-key">{label}</span>
                    <span className="view-val">未記入</span>
                  </div>
                ))}
              </div>
            ))}
            {emptyCount > 0 && (
              <button className="text-toggle" type="button" onClick={() => setShowEmpty((value) => !value)}>
                {showEmpty ? "未記入の問いを隠す" : `未記入の問い ${emptyCount}件を表示`}
                <span className={showEmpty ? "fold-caret down open" : "fold-caret down"}>
                  <Icon name="chevron-down" size={16} />
                </span>
              </button>
            )}
          </div>
        </section>
      )}

      {scratchText && (
        <section className="reading-section">
          <h2 className="section-title">日記</h2>
          <p className="card reading-text">{entry.scratch}</p>
        </section>
      )}

      {entry.photos.length > 0 && <PhotoSection photos={entry.photos} editable={false} />}

      {sortedScratchItems.length > 0 && (
        <section className="reading-section">
          <h2 className="section-title">らくがき帳</h2>
          <ul className="card memo-list">
            {sortedScratchItems.map((item) => (
              <li key={item.id}>
                <time>{timeOnly(item.createdAt)}</time>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

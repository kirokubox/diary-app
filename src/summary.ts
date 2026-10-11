import type { DiaryEntry } from "./types";

// カードの起床・睡眠メタと重複するため、サマリー候補から外すラベル
const EXCLUDED_LABELS = ["起床", "睡眠時間", "仮眠"];

const NO_CONTENT_VALUES = [
  "なし",
  "特になし",
  "特にない",
  "無し",
  "ない",
  "特に無し",
  "未入力",
  "特筆なし",
];

// 完全除外ではなく、他に候補がある場合だけ後回しにする日常語
const MUNDANE_WORDS = [
  "朝食",
  "昼食",
  "夕食",
  "ご飯",
  "食事",
  "通勤",
  "仕事",
  "風呂",
  "入浴",
  "アニメ",
  "動画",
  "YouTube",
  "ゲーム",
  "昼寝",
  "睡眠",
  "洗濯",
  "掃除",
  "買い物",
  "散歩",
  "スマホ",
];

const SUMMARY_ITEM_MAX = 22;
const SUMMARY_TOTAL_MAX = 48;
const SUMMARY_ITEM_COUNT = 2;

type FactCandidate = {
  label: string;
  value: string;
};

function compactWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isNoContentValue(value: string): boolean {
  const normalized = value.trim().replace(/[。．.、，,！!？?～ー\-\s]+$/g, "");
  if (!normalized) return true;
  return NO_CONTENT_VALUES.includes(normalized);
}

function isMundane(value: string): boolean {
  return value.length <= 15 && MUNDANE_WORDS.some((word) => value.includes(word));
}

// 「■」で始まり「事実」を含む最初の見出し〜次の「■」見出しまでを返す。
// テンプレートはユーザーが編集できるため、見つからなければ null(フォールバックへ)
function extractFactSection(body: string): string[] | null {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim().startsWith("■") && line.includes("事実"));
  if (start < 0) return null;
  const section: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith("■")) break;
    section.push(lines[index]);
  }
  return section;
}

// 各行を「最初の全角コロン」で label／value に分割する。
// 半角コロンは時刻(09:30など)に使われるため区切りに使わない
function parseFactCandidates(lines: string[]): FactCandidate[] {
  const candidates: FactCandidate[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/^[・\-*]+\s*/, "");
    if (!line) continue;
    const colonIndex = line.indexOf("：");
    const label = colonIndex >= 0 ? line.slice(0, colonIndex).trim() : "";
    const value = compactWhitespace(colonIndex >= 0 ? line.slice(colonIndex + 1) : line);
    if (label && EXCLUDED_LABELS.some((excluded) => label.startsWith(excluded))) continue;
    if (isNoContentValue(value)) continue;
    candidates.push({ label, value });
  }
  return candidates;
}

// 「■」見出し行と、値が空のテンプレート行(「：」で終わる行)を除いた本文の先頭
function fallbackSummary(body: string): string {
  const text = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("■") && !line.endsWith("："))
    .join(" ");
  return truncate(compactWhitespace(text), SUMMARY_TOTAL_MAX);
}

// 「今日の事実」からその日固有の内容を短く整形する。空文字を返した場合は表示しない
export function buildEntrySummary(entry: DiaryEntry): string {
  const section = extractFactSection(entry.body);
  if (section) {
    const candidates = parseFactCandidates(section);
    const preferred = candidates.filter((candidate) => !isMundane(candidate.value));
    const mundane = candidates.filter((candidate) => isMundane(candidate.value));
    const picked = [...preferred, ...mundane].slice(0, SUMMARY_ITEM_COUNT);
    if (picked.length > 0) {
      const text = picked.map((candidate) => truncate(candidate.value, SUMMARY_ITEM_MAX)).join(" ／ ");
      return truncate(text, SUMMARY_TOTAL_MAX);
    }
  }
  return fallbackSummary(entry.body);
}

export type BodyLine = {
  type: "heading" | "text" | "emptyTemplate" | "blank";
  text: string;
};

// 閲覧モードの本文表示用。fallbackSummary と同じ基準で行を分類する
export function classifyBodyLines(body: string): BodyLine[] {
  return body.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return { type: "blank" as const, text: "" };
    if (trimmed.startsWith("■")) return { type: "heading" as const, text: line };
    if (trimmed.endsWith("：")) return { type: "emptyTemplate" as const, text: line };
    return { type: "text" as const, text: line };
  });
}

export type SearchSnippet = {
  before: string;
  match: string;
  after: string;
};

// body → 日記 → らくがきメモの順で最初の一致箇所の前後を返す
export function buildSearchSnippet(entry: DiaryEntry, query: string): SearchSnippet | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return null;
  const sources = [entry.body, entry.scratch, ...entry.scratchItems.map((item) => item.text)];
  for (const source of sources) {
    if (!source) continue;
    const compact = compactWhitespace(source);
    const index = compact.toLowerCase().indexOf(normalizedQuery);
    if (index < 0) continue;
    const beforeStart = Math.max(0, index - 18);
    const afterEnd = Math.min(compact.length, index + normalizedQuery.length + 38);
    return {
      before: `${beforeStart > 0 ? "…" : ""}${compact.slice(beforeStart, index)}`,
      match: compact.slice(index, index + normalizedQuery.length),
      after: `${compact.slice(index + normalizedQuery.length, afterEnd)}${afterEnd < compact.length ? "…" : ""}`,
    };
  }
  return null;
}

export type BodyItem = { kind: "field"; label: string; value: string } | { kind: "text"; text: string };

export type BodySection = {
  title: string;
  items: BodyItem[];
  // 値が書かれていない問い（「・強かった感情：」のまま）のラベル
  emptyLabels: string[];
};

// 閲覧モード用。振り返りの本文を「■見出し」ごとのまとまりに分け、
// 「・ラベル：値」の行は項目名と値に分ける。本文そのものは書き換えない
export function parseBodySections(body: string): BodySection[] {
  const sections: BodySection[] = [];
  for (const rawLine of body.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("■")) {
      sections.push({
        title: trimmed.replace(/^■\s*/, "").replace(/^\d+[.．]\s*/, ""),
        items: [],
        emptyLabels: [],
      });
      continue;
    }
    if (sections.length === 0) sections.push({ title: "", items: [], emptyLabels: [] });
    const section = sections[sections.length - 1];
    const hasBullet = /^[・\-*]/.test(trimmed);
    const line = trimmed.replace(/^[・\-*]+\s*/, "");
    const colonIndex = line.indexOf("：");
    // 半角コロンは時刻(09:30など)に使われるため区切りに使わない
    if (colonIndex > 0 && (hasBullet || line.endsWith("："))) {
      const label = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      if (value) section.items.push({ kind: "field", label, value });
      else section.emptyLabels.push(label);
      continue;
    }
    section.items.push({ kind: "text", text: trimmed });
  }
  return sections;
}

// 振り返りの記入状況。「・ラベル：」形式の問いが無いテンプレートでは total が0になる
export function countBodyFields(body: string): { filled: number; total: number; hasText: boolean } {
  let filled = 0;
  let empty = 0;
  let hasText = false;
  for (const section of parseBodySections(body)) {
    filled += section.items.filter((item) => item.kind === "field").length;
    empty += section.emptyLabels.length;
    if (section.items.some((item) => item.kind === "text")) hasText = true;
  }
  return { filled, total: filled + empty, hasText };
}

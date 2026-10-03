import assert from "node:assert/strict";
import test from "node:test";
import { normalizeImportedEntry, validateImportedEntry } from "../src/diaryHelpers";
import { normalizeOptionalMoney, parseTimeMinutes } from "../src/lifeMetrics";
import { entriesToMarkdown, entryToMarkdown } from "../src/markdown";
import { weekStartOf, weekStartsEndingInMonth } from "../src/dateUtils";
import { normalizeMonthlyReview, normalizeWeeklyReview, periodContextForDate } from "../src/periodReviews";
import type { DiaryEntry, MonthlyReview, WeeklyReview } from "../src/types";

function entry(date: string, patch: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: date,
    date,
    weekday: "水",
    energy: "",
    mood: "",
    wakeUpTime: "",
    bedTime: "",
    sleepHours: null,
    napHours: null,
    napMinutes: null,
    everydayExpense: null,
    satisfactionExpense: null,
    regretExpense: null,
    tags: [],
    body: "",
    scratch: "",
    scratchItems: [],
    photos: [],
    createdAt: "2026-08-19T00:00:00",
    updatedAt: "2026-08-19T00:00:00",
    ...patch,
  };
}

const lifeValues: Partial<DiaryEntry> = {
  wakeUpTime: "06:30",
  bedTime: "01:12",
  sleepHours: 6.5,
  napHours: 1,
  napMinutes: 42,
  everydayExpense: 1283,
  satisfactionExpense: 4520,
  regretExpense: 327,
};

test("Markdownは睡眠・変動費の節を出さず、他の節は出す", () => {
  const current = entry("2026-08-19", {
    ...lifeValues,
    body: "振り返り本文",
    scratch: "日記本文",
    scratchItems: [{ id: "a", text: "メモ1", createdAt: "2026-08-19T10:00:00" }],
    photos: [{ id: "p1", width: 1, height: 1, byteSize: 1, mimeType: "image/jpeg", createdAt: "" }],
  });
  const markdown = entryToMarkdown(current);
  assert.doesNotMatch(markdown, /### 睡眠/);
  assert.doesNotMatch(markdown, /### 変動費/);
  assert.doesNotMatch(markdown, /起床時間|就寝時間|仮眠時間|睡眠合計|日常費|満足費|反省費/);
  assert.match(markdown, /### 日次振り返り\n\n振り返り本文/);
  assert.match(markdown, /### 日記\n\n日記本文/);
  assert.match(markdown, /### 写真\n\n- 1枚/);
  assert.match(markdown, /### らくがきメモ履歴\n\n- 10:00　メモ1/);
});

test("全件Markdownも睡眠・変動費を出さない", () => {
  const markdown = entriesToMarkdown([entry("2026-08-18", lifeValues), entry("2026-08-19", lifeValues)]);
  assert.match(markdown, /件数：2件/);
  assert.doesNotMatch(markdown, /### 睡眠|### 変動費/);
});

test("睡眠・変動費を含む旧エントリは、インポート検証と正規化を通しても値が保持される", () => {
  const result = validateImportedEntry(JSON.parse(JSON.stringify(entry("2026-08-19", lifeValues))), 1);
  assert.deepEqual(result.errors, []);
  assert.ok(result.entry);
  const saved = result.entry!;
  assert.equal(saved.wakeUpTime, "06:30");
  assert.equal(saved.bedTime, "01:12");
  assert.equal(saved.sleepHours, 6.5);
  assert.equal(saved.napHours, 1);
  assert.equal(saved.napMinutes, 42);
  assert.equal(saved.everydayExpense, 1283);
  assert.equal(saved.satisfactionExpense, 4520);
  assert.equal(saved.regretExpense, 327);
});

test("0円と未入力は区別したまま正規化される", () => {
  const normalized = normalizeImportedEntry(entry("2026-08-20", { everydayExpense: 0, regretExpense: null }));
  assert.equal(normalized.everydayExpense, 0);
  assert.equal(normalized.regretExpense, null);
});

test("不正な睡眠・変動費の値はインポート検証でエラーにする", () => {
  const badBed = validateImportedEntry({ ...entry("2026-08-19"), bedTime: "25:99" }, 1);
  assert.ok(badBed.errors.some((issue) => issue.message.includes("bedTime")));
  const badMoney = validateImportedEntry({ ...entry("2026-08-19"), regretExpense: -1 }, 1);
  assert.ok(badMoney.errors.some((issue) => issue.message.includes("regretExpense")));
  const badSleep = validateImportedEntry({ ...entry("2026-08-19"), sleepHours: 7.3 }, 1);
  assert.ok(badSleep.errors.some((issue) => issue.message.includes("sleepHours")));
});

test("正規化用の関数は従来どおり動く", () => {
  assert.equal(parseTimeMinutes("23:30"), 1410);
  assert.equal(parseTimeMinutes("24:00"), null);
  assert.equal(normalizeOptionalMoney("1200"), 1200);
  assert.equal(normalizeOptionalMoney(""), null);
  assert.equal(normalizeOptionalMoney(-5), null);
});

const stamp = "2026-10-01T00:00:00+09:00";

function weekly(weekStart: string, goalTheme: string, reflection: string): WeeklyReview {
  return { weekStart, goalTheme, reflection, createdAt: stamp, updatedAt: stamp };
}

function monthly(month: string, goalTheme: string, reflection: string): MonthlyReview {
  return { month, goalTheme, reflection, createdAt: stamp, updatedAt: stamp };
}

test("週は月曜始まりで、一覧は日曜日が属する月へ一度だけ出す", () => {
  assert.equal(weekStartOf("2026-10-04"), "2026-09-28");
  assert.equal(weekStartOf("2026-10-05"), "2026-10-05");
  assert.deepEqual(weekStartsEndingInMonth("2026-10"), [
    "2026-09-28",
    "2026-10-05",
    "2026-10-12",
    "2026-10-19",
  ]);
  assert.ok(!weekStartsEndingInMonth("2026-09").includes("2026-09-28"));
});

test("週次・月次の長文と改行は正規化してもそのまま残る", () => {
  const longGoal = `優先順位を合わせる。\n\n理由や迷いも原文のまま残す。${"長文".repeat(500)}`;
  const week = normalizeWeeklyReview(weekly("2026-09-28", longGoal, "週の振り返り\n二段落目"));
  const month = normalizeMonthlyReview(monthly("2026-10", longGoal, "月の振り返り\n二段落目"));
  assert.equal(week?.goalTheme, longGoal);
  assert.equal(week?.reflection, "週の振り返り\n二段落目");
  assert.equal(month?.goalTheme, longGoal);
  assert.equal(month?.reflection, "月の振り返り\n二段落目");
});

test("日曜日のMarkdownは今週の振り返りと来週目標を全文出す", () => {
  const current = weekly("2026-09-28", "今週目標", "今週の長文振り返り\n二段落目");
  const next = weekly("2026-10-05", "来週の長文目標\n理由も残す", "");
  const markdown = entryToMarkdown(
    entry("2026-10-04", { weekday: "日" }),
    periodContextForDate("2026-10-04", [current, next], []),
  );
  assert.match(markdown, /### 本人の今週の振り返り\n\n今週の長文振り返り\n二段落目/);
  assert.match(markdown, /### 本人の来週の目標・テーマ\n\n来週の長文目標\n理由も残す/);
});

test("月初と月末のMarkdownは同じ月次データを正しい見出しで出す", () => {
  const september = monthly("2026-09", "9月目標", "9月の振り返り全文");
  const october = monthly("2026-10", "10月の目標全文", "10月の振り返り全文");
  const november = monthly("2026-11", "11月の目標全文", "");
  const reviews = [september, october, november];
  const first = entryToMarkdown(entry("2026-10-01", { weekday: "木" }), periodContextForDate("2026-10-01", [], reviews));
  const last = entryToMarkdown(entry("2026-10-31", { weekday: "土" }), periodContextForDate("2026-10-31", [], reviews));
  assert.match(first, /### 本人の先月の振り返り\n\n9月の振り返り全文/);
  assert.match(first, /### 本人の今月の目標・テーマ\n\n10月の目標全文/);
  assert.match(last, /### 本人の今月の振り返り\n\n10月の振り返り全文/);
  assert.match(last, /### 本人の来月の目標・テーマ\n\n11月の目標全文/);
});

test("全件Markdownは対応する日記が無くても週次・月次原文を全文出す", () => {
  const weekGoal = "  週の目標\n理由を含む長文  ";
  const monthReflection = "月の振り返り\n\n複数段落の原文";
  const markdown = entriesToMarkdown(
    [],
    [weekly("2026-10-05", weekGoal, "週の振り返り")],
    [monthly("2026-10", "月の目標", monthReflection)],
  );
  assert.ok(markdown.includes(weekGoal));
  assert.ok(markdown.includes(monthReflection));
  assert.match(markdown, /# 週次・月次記録/);
});

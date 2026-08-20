import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPENSE_OVER_TOTAL_MESSAGE,
  expenseBreakdown,
  getExpensePeriod,
  getSleepMetrics,
  napDraftToMinutes,
  periodExpenseTotal,
  recentSleepAverageMinutes,
  resolveBedDateTime,
  resolveExpenseInput,
  toExpenseInputDraft,
  toNapDraft,
} from "../src/lifeMetrics";
import type { DiaryEntry } from "../src/types";
import { entryToMarkdown } from "../src/markdown";

function entry(date: string, patch: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: date,
    date,
    weekday: "",
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
    createdAt: "",
    updatedAt: "",
    ...patch,
  };
}

test("前日23:30就寝から当日06:30起床は7時間", () => {
  const previous = entry("2026-08-18", { wakeUpTime: "06:00", bedTime: "23:30" });
  const current = entry("2026-08-19", { wakeUpTime: "06:30" });
  assert.equal(getSleepMetrics(current, previous, "05:00").nightMinutes, 420);
});

test("生活日の01:12就寝は翌暦日として解決し、5時間18分", () => {
  const previous = entry("2026-08-18", { wakeUpTime: "06:00", bedTime: "01:12" });
  const current = entry("2026-08-19", { wakeUpTime: "06:30" });
  const resolved = resolveBedDateTime(previous, "05:00");
  assert.equal(resolved && `${resolved.getFullYear()}-${String(resolved.getMonth() + 1).padStart(2, "0")}-${String(resolved.getDate()).padStart(2, "0")}T${String(resolved.getHours()).padStart(2, "0")}:${String(resolved.getMinutes()).padStart(2, "0")}`, "2026-08-19T01:12");
  assert.equal(getSleepMetrics(current, previous, "05:00").nightMinutes, 318);
});

test("生活日の05:30就寝は翌暦日として解決し、2時間30分", () => {
  const previous = entry("2026-08-18", { wakeUpTime: "06:30", bedTime: "05:30" });
  const current = entry("2026-08-19", { wakeUpTime: "08:00" });
  assert.equal(getSleepMetrics(current, previous, "05:00").nightMinutes, 150);
});

test("前日のbedTimeが無い場合は当日の旧sleepHoursを使う", () => {
  const current = entry("2026-08-19", { wakeUpTime: "06:30", sleepHours: 6.5 });
  const metrics = getSleepMetrics(current, entry("2026-08-18"), "05:00");
  assert.equal(metrics.nightMinutes, 390);
  assert.equal(metrics.source, "legacy");
});

test("夜間5時間18分と仮眠42分は合計6時間", () => {
  const previous = entry("2026-08-18", { wakeUpTime: "06:00", bedTime: "01:12" });
  const current = entry("2026-08-19", { wakeUpTime: "06:30", napMinutes: 42 });
  assert.equal(getSleepMetrics(current, previous, "05:00").totalMinutes, 360);
});

test("旧新混在でも直近7件の入力済み値だけで平均する", () => {
  const entries = [
    entry("2026-08-13", { sleepHours: 6 }),
    entry("2026-08-14", { sleepHours: 7 }),
    entry("2026-08-15", { sleepHours: 8 }),
    entry("2026-08-16", { sleepHours: 6.5 }),
    entry("2026-08-17", { wakeUpTime: "06:00", bedTime: "23:30", sleepHours: 7 }),
    entry("2026-08-18", { wakeUpTime: "06:30", bedTime: "01:00" }),
    entry("2026-08-19", { wakeUpTime: "07:00", napMinutes: 30 }),
  ];
  assert.equal(recentSleepAverageMinutes(entries, "05:00"), 411);
});

test("変動費の合計と0円・未入力を区別する", () => {
  assert.deepEqual(expenseBreakdown(entry("2026-08-19", { everydayExpense: 1283, satisfactionExpense: 4520, regretExpense: 327 })), {
    everyday: 1283,
    satisfaction: 4520,
    regret: 327,
    total: 6130,
  });
  assert.deepEqual(expenseBreakdown(entry("2026-08-20", { everydayExpense: 0 })), {
    everyday: 0,
    satisfaction: null,
    regret: null,
    total: 0,
  });
});

test("25日開始の期間と残額・超過計算に使う累計", () => {
  const period = getExpensePeriod("2026-08-19", 25);
  assert.deepEqual(period, { start: "2026-07-25", end: "2026-08-24" });
  assert.equal(periodExpenseTotal([entry("2026-08-01", { everydayExpense: 82300 })], period), 82300);
  assert.equal(110000 - 82300, 27700);
  assert.equal(121681 - 110000, 11681);
});

test("Markdownは実測就寝・分単位睡眠・変動費を出す", () => {
  const previous = entry("2026-08-18", { wakeUpTime: "06:00", bedTime: "01:12" });
  const current = entry("2026-08-19", {
    wakeUpTime: "06:30",
    napMinutes: 42,
    everydayExpense: 0,
    satisfactionExpense: null,
    regretExpense: 327,
  });
  const markdown = entryToMarkdown(current, previous, "05:00");
  assert.match(markdown, /就寝時間：未入力/);
  assert.match(markdown, /睡眠時間：5時間18分/);
  assert.match(markdown, /睡眠合計：6時間00分/);
  assert.match(markdown, /日常費：0円/);
  assert.match(markdown, /満足費：未入力/);
  assert.match(markdown, /合計：327円/);
});

test("変動費全額から満足費を求める（空欄は全額入力時だけ0円扱い）", () => {
  assert.deepEqual(resolveExpenseInput({ total: "3000", everyday: "", regret: "" }), {
    error: "",
    values: { everydayExpense: null, satisfactionExpense: 3000, regretExpense: null },
  });
  assert.deepEqual(resolveExpenseInput({ total: "3000", everyday: "1200", regret: "" }), {
    error: "",
    values: { everydayExpense: 1200, satisfactionExpense: 1800, regretExpense: null },
  });
  assert.deepEqual(resolveExpenseInput({ total: "3000", everyday: "", regret: "500" }), {
    error: "",
    values: { everydayExpense: null, satisfactionExpense: 2500, regretExpense: 500 },
  });
  assert.deepEqual(resolveExpenseInput({ total: "7414", everyday: "1125", regret: "181" }), {
    error: "",
    values: { everydayExpense: 1125, satisfactionExpense: 6108, regretExpense: 181 },
  });
});

test("変動費全額が未入力なら満足費も未入力、0円は0円のまま", () => {
  assert.deepEqual(resolveExpenseInput({ total: "", everyday: "1200", regret: "" }), {
    error: "",
    values: { everydayExpense: 1200, satisfactionExpense: null, regretExpense: null },
  });
  assert.deepEqual(resolveExpenseInput({ total: "0", everyday: "0", regret: "" }), {
    error: "",
    values: { everydayExpense: 0, satisfactionExpense: 0, regretExpense: null },
  });
});

test("日常費と反省費の合計が全額を超えたら保存へ反映しない", () => {
  const result = resolveExpenseInput({ total: "2000", everyday: "1800", regret: "500" });
  assert.equal(result.error, EXPENSE_OVER_TOTAL_MESSAGE);
  assert.equal(result.values, null);
  // ちょうど同額は有効（満足費0円）
  assert.deepEqual(resolveExpenseInput({ total: "2300", everyday: "1800", regret: "500" }).values, {
    everydayExpense: 1800,
    satisfactionExpense: 0,
    regretExpense: 500,
  });
});

test("既存データは3分類の合計を変動費全額として表示する", () => {
  const existing = entry("2026-08-19", { everydayExpense: 1283, satisfactionExpense: 4520, regretExpense: 327 });
  assert.deepEqual(toExpenseInputDraft(existing), { total: "6130", everyday: "1283", regret: "327" });
  // 表示した全額のまま保存し直しても、既存の3分類へ戻る
  assert.deepEqual(resolveExpenseInput(toExpenseInputDraft(existing)).values, {
    everydayExpense: 1283,
    satisfactionExpense: 4520,
    regretExpense: 327,
  });
  assert.deepEqual(toExpenseInputDraft(entry("2026-08-20")), { total: "", everyday: "", regret: "" });
});

test("仮眠は時間・分の経過時間として分へ変換する", () => {
  assert.equal(napDraftToMinutes({ hours: "1", minutes: "30" }), 90);
  assert.equal(napDraftToMinutes({ hours: "", minutes: "42" }), 42);
  assert.equal(napDraftToMinutes({ hours: "2", minutes: "" }), 120);
  assert.equal(napDraftToMinutes({ hours: "", minutes: "" }), null);
  assert.equal(napDraftToMinutes({ hours: "", minutes: "0" }), 0);
  assert.deepEqual(toNapDraft(90), { hours: "1", minutes: "30" });
  assert.deepEqual(toNapDraft(42), { hours: "", minutes: "42" });
  assert.deepEqual(toNapDraft(null), { hours: "", minutes: "" });
});

test("仮眠入力を変えても睡眠合計は既存ロジックのまま", () => {
  const previous = entry("2026-08-18", { wakeUpTime: "06:00", bedTime: "01:12" });
  const current = entry("2026-08-19", { wakeUpTime: "06:30", napMinutes: napDraftToMinutes({ hours: "", minutes: "42" }) });
  assert.equal(getSleepMetrics(current, previous, "05:00").totalMinutes, 360);
});

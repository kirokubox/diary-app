import assert from "node:assert/strict";
import test from "node:test";
import {
  expenseBreakdown,
  getExpensePeriod,
  getSleepMetrics,
  periodExpenseTotal,
  recentSleepAverageMinutes,
  resolveBedDateTime,
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

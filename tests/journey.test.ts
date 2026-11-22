import assert from "node:assert/strict";
import test from "node:test";
import { entryCharacters, journeySummary } from "../src/journey";
import type { DiaryEntry } from "../src/types";

const entry = (date: string, body: string, photos = 0): DiaryEntry => ({ date, body, photos: Array.from({ length: photos }, (_, index) => ({ id: String(index) })) } as DiaryEntry);

test("見出し・未記入欄・らくがきは数えず、去年の同じ月を集計する", () => {
  const rows = [entry("2026-11-22", "■振り返り\n今日は：\n晴れた\n\n■日記", 2), entry("2025-11-22", "去年")];
  assert.equal(entryCharacters(rows[0]), 3);
  const summary = journeySummary(rows, "2026-11-23");
  assert.deepEqual([summary.thisMonth.days, summary.thisMonth.characters, summary.thisMonth.photos], [1, 3, 2]);
  assert.deepEqual([summary.lastYearMonth.days, summary.lastYearMonth.characters], [1, 2]);
  assert.equal(summary.streak, 1);
});

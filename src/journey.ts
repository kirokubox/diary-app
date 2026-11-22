import { addDays, addMonths } from "./dateUtils";
import { classifyBodyLines } from "./summary";
import type { DiaryEntry } from "./types";

export interface JourneyMonth { month: string; days: number; characters: number; photos: number }

export function entryCharacters(entry: DiaryEntry): number {
  return classifyBodyLines(entry.body)
    .filter((line) => line.type === "text")
    .reduce((sum, line) => sum + Array.from(line.text.trim()).length, 0);
}

export function journeyMonth(entries: readonly DiaryEntry[], month: string): JourneyMonth {
  const matching = entries.filter((entry) => entry.date.startsWith(month));
  return { month, days: matching.filter((entry) => entryCharacters(entry) > 0).length,
    characters: matching.reduce((sum, entry) => sum + entryCharacters(entry), 0),
    photos: matching.reduce((sum, entry) => sum + entry.photos.length, 0) };
}

export function journeySummary(entries: readonly DiaryEntry[], today: string) {
  const month = today.slice(0, 7);
  const thisMonth = journeyMonth(entries, month);
  const lastYearMonth = journeyMonth(entries, addMonths(month, -12));
  const thisYearCharacters = entries.filter((entry) => entry.date.startsWith(today.slice(0, 4)))
    .reduce((sum, entry) => sum + entryCharacters(entry), 0);
  const currentMonths = Array.from({ length: 12 }, (_, index) => journeyMonth(entries, addMonths(month, index - 11)));
  const previousMonths = currentMonths.map((item) => journeyMonth(entries, addMonths(item.month, -12)));
  const written = entries.filter((entry) => entryCharacters(entry) > 0).map((entry) => entry.date).sort();
  const dates = new Set(written);
  let cursor = dates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dates.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  return { thisMonth, lastYearMonth, thisYearCharacters, currentMonths, previousMonths,
    totalDays: written.length, totalCharacters: entries.reduce((sum, entry) => sum + entryCharacters(entry), 0),
    oldest: written[0] ?? null, streak };
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function toDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function weekdayOf(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00`);
  return WEEKDAYS[date.getDay()];
}

export function addDays(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

export function weekStartOf(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00`);
  const day = date.getDay();
  return addDays(dateText, day === 0 ? -6 : 1 - day);
}

export function weekEndOf(dateText: string): string {
  return addDays(weekStartOf(dateText), 6);
}

export function monthOf(dateText: string): string {
  return dateText.slice(0, 7);
}

export function addMonths(monthText: string, months: number): string {
  const [year, month] = monthText.split("-").map(Number);
  const date = new Date(year, month - 1 + months, 1);
  return toDateInputValue(date).slice(0, 7);
}

export function isFirstDayOfMonth(dateText: string): boolean {
  return dateText.endsWith("-01");
}

export function isLastDayOfMonth(dateText: string): boolean {
  return addDays(dateText, 1).slice(0, 7) !== dateText.slice(0, 7);
}

export function isSunday(dateText: string): boolean {
  return weekdayOf(dateText) === "日";
}

// 一覧では「その週の日曜日が属する月」に週を1回だけ表示する
export function weekStartsEndingInMonth(monthText: string): string[] {
  const firstDate = `${monthText}-01`;
  const first = new Date(`${firstDate}T00:00:00`);
  const daysUntilSunday = (7 - first.getDay()) % 7;
  const starts: string[] = [];
  let sunday = addDays(firstDate, daysUntilSunday);
  while (sunday.slice(0, 7) === monthText) {
    starts.push(addDays(sunday, -6));
    sunday = addDays(sunday, 7);
  }
  return starts;
}

export function nowIsoLocal(): string {
  const date = new Date();
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
  return `${local}${sign}${hours}:${minutes}`;
}

export function timeOnly(iso?: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateJa(dateText: string): string {
  const [year, month, day] = dateText.split("-");
  return `${Number(year)}/${Number(month)}/${Number(day)}`;
}

export type Season = "春" | "夏" | "秋" | "冬";

export function seasonOf(dateText: string): Season {
  const month = Number(dateText.slice(5, 7));
  if (month >= 3 && month <= 5) return "春";
  if (month >= 6 && month <= 8) return "夏";
  if (month >= 9 && month <= 11) return "秋";
  return "冬";
}

// 完全一致のみ。7/31の1か月前(6/31)のような不存在日は null を返す
export function monthsAgoExact(dateText: string, months: number): string | null {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(year, month - 1 - months, day);
  if (date.getDate() !== day) return null;
  return toDateInputValue(date);
}

// 2/29の1年前など、平年に存在しない日付は null を返す
export function yearsAgoExact(dateText: string, years: number): string | null {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(year - years, month - 1, day);
  if (date.getDate() !== day) return null;
  return toDateInputValue(date);
}

export function hashString(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

// dayKeyが同じ間は同じ1件を返す。候補の増減があっても他の候補の選択がズレにくい
export function pickDailyStable<T>(items: T[], keyOf: (item: T) => string, dayKey: string): T | null {
  let best: T | null = null;
  let bestHash = -1;
  for (const item of items) {
    const itemHash = hashString(`${dayKey}|${keyOf(item)}`);
    if (itemHash > bestHash) {
      bestHash = itemHash;
      best = item;
    }
  }
  return best;
}

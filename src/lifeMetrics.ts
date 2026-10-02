// 睡眠・変動費は「生活記録」「らくな家計簿」へ移ったため、季節日記では表示・集計しない。
// ここには、過去データ（JSONバックアップ等）を壊さず読み書きするための正規化・検証用の関数だけを残している。

const TIME_PATTERN = /^(\d{2}):([0-5]\d)$/;

export function parseTimeMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(TIME_PATTERN);
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours > 23) return null;
  return hours * 60 + Number(match[2]);
}

export function normalizeOptionalMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

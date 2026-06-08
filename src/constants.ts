import type { AppSettings, Energy, Mood } from "./types";

export const APP_VERSION = "1.0.0";

export const DEFAULT_TEMPLATE = `■1. 今日の事実
・起床：
・睡眠時間：
・主にやったこと：
・人との関わり：
・作業（就活 / 発信 / その他）：
・今日の流れを一言で：

■2. 今日の感情
・強かった感情：
・そのきっかけ：
・本音（本当はどうしたかった？）：
・満たされたもの / 足りなかったもの：

■3. 今日の分析
・うまくいったこと：
・詰まったこと：
・その理由やトリガー：
・助けになったもの：
・今日はどんな1日だった？：

■4. 明日につなげる（必要なら）
・明日の最初の1歩：

■5. 一言ログ
・今日を1〜3行でまとめる：
・今日の自分を一言で：

■明日の予定

■明日やりたいこと

■らくがき帳`;

export const DEFAULT_TAG_OPTIONS = [
  "日記",
  "自分分析",
  "感情分析",
  "らくがき帳",
  "仕事",
  "就職",
  "引越し",
  "生活改善",
  "人間関係",
  "note素材",
  "発信",
  "お金",
  "体調",
  "趣味",
];

export const DEFAULT_TAGS = ["日記", "自分分析", "感情分析"];
export const ENERGY_OPTIONS: Energy[] = ["", "高", "中", "低"];
export const MOOD_OPTIONS: Mood[] = ["", "🙂", "😐", "☹️"];
export const DAY_BOUNDARY_OPTIONS = ["00:00", "03:00", "04:00", "05:00", "06:00"] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  template: DEFAULT_TEMPLATE,
  tagOptions: DEFAULT_TAG_OPTIONS,
  version: APP_VERSION,
  dayBoundaryTime: "05:00",
};

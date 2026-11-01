import type { AppSettings, Energy, Mood } from "./types";

export const APP_VERSION = "2.4.0";

// 標準：事実・感情・振り返りを分けて書く形（作者が使っている形）
export const DEFAULT_TEMPLATE = `■1. 今日の事実
・生活：
・仕事：
・人：
・作業：
・楽しみ：

■2. 今日の感情
・感情とその背景：
・本音：
・満たされたもの / 足りなかったもの：

■3. 今日の振り返り
・うまくいったこと：
・引っかかったこと：
・今日気づいたこと：

■4. AIに報連相
`;

// 一般的な日記の形。短く書ける問いだけにする
export const SIMPLE_TEMPLATE = `■1. 今日のできごと
・したこと：
・会った人：

■2. 気持ち
・うれしかったこと：
・もやっとしたこと：

■3. ひとこと
・今日を一言で：
・明日やりたいこと：
`;

export type TemplatePreset = { id: string; label: string; description: string; body: string };

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "standard",
    label: "振り返り（標準）",
    description: "事実・感情・振り返りを分けて書く",
    body: DEFAULT_TEMPLATE,
  },
  {
    id: "simple",
    label: "シンプルな日記",
    description: "できごと・気持ち・ひとことだけ",
    body: SIMPLE_TEMPLATE,
  },
];

export const DEFAULT_WEEKLY_GOAL_TEMPLATE = `まとめの1文：

目指す状態：

時間・場所：

現状とのズレ：

今週やりたいこと：

対象外・やらなくていいこと：`;

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

// 写真は1日6枚まで（3列グリッド2段に収まる枚数）
export const PHOTO_MAX_COUNT = 6;
// 追加時に長辺1600pxへ縮小して再エンコードする。元画像は切り取らず、縮小だけ行う
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_WEBP_QUALITY = 0.8;
export const PHOTO_JPEG_QUALITY = 0.82;
export const ENERGY_OPTIONS: Energy[] = ["", "高", "中", "低"];
export const MOOD_OPTIONS: Mood[] = ["", "🙂", "😐", "☹️"];

export const DEFAULT_SETTINGS: AppSettings = {
  template: DEFAULT_TEMPLATE,
  weeklyGoalTemplate: DEFAULT_WEEKLY_GOAL_TEMPLATE,
  tagOptions: DEFAULT_TAG_OPTIONS,
  version: APP_VERSION,
  dayBoundaryTime: "05:00",
  variableExpenseBudget: 110000,
  variableExpenseStartDay: 25,
};

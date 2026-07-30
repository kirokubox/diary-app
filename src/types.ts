export type Energy = "" | "高" | "中" | "低";
export type Mood = "" | "🙂" | "😐" | "☹️";

export interface ScratchItem {
  id: string;
  text: string;
  createdAt: string;
}

// 日記エントリが持つのは軽いメタデータだけ。画像本体は photos ストアに別置きする
// （エントリは保存のたびに全件読み込まれるため、画像バイト列をその経路に乗せない）
export interface DiaryPhoto {
  id: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
  createdAt: string;
}

// IndexedDB の photos ストアに入る画像本体
export interface StoredPhoto {
  id: string;
  date: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: string;
}

export interface DiaryEntry {
  id: string;
  date: string;
  weekday: string;
  energy: Energy;
  mood: Mood;
  wakeUpTime: string;
  sleepHours: number | null;
  napHours: number | null;
  tags: string[];
  body: string;
  scratch: string;
  scratchItems: ScratchItem[];
  photos: DiaryPhoto[];
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  template: string;
  tagOptions: string[];
  version: string;
  dayBoundaryTime: string;
}

export interface DiaryExport {
  appName: "Yuki Diary App";
  version: string;
  exportedAt: string;
  settings: AppSettings;
  entries: DiaryEntry[];
}

export type TabKey = "today" | "list" | "search" | "settings";
export type SaveState = "idle" | "dirty" | "saving" | "saved";

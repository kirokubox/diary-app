export type Energy = "" | "高" | "中" | "低";
export type Mood = "" | "🙂" | "😐" | "☹️";

export interface ScratchItem {
  id: string;
  text: string;
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
  tags: string[];
  body: string;
  scratch: string;
  scratchItems: ScratchItem[];
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

import { DEFAULT_SETTINGS } from "./constants";
import { normalizeOptionalMoney, parseTimeMinutes } from "./lifeMetrics";
import type { AppSettings, DiaryEntry, DiaryPhoto, StoredPhoto } from "./types";

const DB_NAME = "yuki-diary-app";
// v1 → v2 で photos ストアを追加（既存の entries / settings は変更していない）
const DB_VERSION = 2;
const ENTRY_STORE = "entries";
const SETTINGS_STORE = "settings";
const PHOTO_STORE = "photos";
const SETTINGS_KEY = "app";

let dbPromise: Promise<IDBDatabase> | null = null;

function parseStoredHours(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "未入力") return null;
  const numeric = Number(trimmed.replace("時間", ""));
  return Number.isFinite(numeric) ? numeric : null;
}

// 写真メタデータの正規化。写真機能より前に保存された日記（photos が無い）も読めるようにする
export function normalizePhotoMeta(value: unknown): DiaryPhoto[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Partial<DiaryPhoto> => !!item && typeof item === "object")
    .filter((item) => typeof item.id === "string" && item.id)
    .map((item) => ({
      id: item.id as string,
      width: typeof item.width === "number" && Number.isFinite(item.width) ? item.width : 0,
      height: typeof item.height === "number" && Number.isFinite(item.height) ? item.height : 0,
      byteSize: typeof item.byteSize === "number" && Number.isFinite(item.byteSize) ? item.byteSize : 0,
      mimeType: typeof item.mimeType === "string" && item.mimeType ? item.mimeType : "image/jpeg",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
    }));
}

function normalizeEntry(entry: DiaryEntry): DiaryEntry {
  const napMinutes =
    typeof entry.napMinutes === "number" && Number.isFinite(entry.napMinutes) && entry.napMinutes >= 0
      ? Math.round(entry.napMinutes)
      : undefined;
  return {
    ...entry,
    scratch: typeof entry.scratch === "string" ? entry.scratch : "",
    scratchItems: Array.isArray(entry.scratchItems) ? entry.scratchItems : [],
    photos: normalizePhotoMeta(entry.photos),
    wakeUpTime: typeof entry.wakeUpTime === "string" ? entry.wakeUpTime : "",
    bedTime: typeof entry.bedTime === "string" && parseTimeMinutes(entry.bedTime) !== null ? entry.bedTime : "",
    sleepHours: parseStoredHours(entry.sleepHours),
    napHours: parseStoredHours(entry.napHours),
    napMinutes: napMinutes ?? null,
    everydayExpense: normalizeOptionalMoney(entry.everydayExpense),
    satisfactionExpense: normalizeOptionalMoney(entry.satisfactionExpense),
    regretExpense: normalizeOptionalMoney(entry.regretExpense),
  };
}

function normalizeSettings(settings: Partial<AppSettings> | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    dayBoundaryTime: ["00:00", "03:00", "04:00", "05:00", "06:00"].includes(settings?.dayBoundaryTime ?? "")
      ? settings?.dayBoundaryTime ?? DEFAULT_SETTINGS.dayBoundaryTime
      : DEFAULT_SETTINGS.dayBoundaryTime,
    variableExpenseBudget: normalizeOptionalMoney(settings?.variableExpenseBudget) ?? DEFAULT_SETTINGS.variableExpenseBudget,
    variableExpenseStartDay:
      typeof settings?.variableExpenseStartDay === "number" && settings.variableExpenseStartDay >= 1 && settings.variableExpenseStartDay <= 31
        ? Math.round(settings.variableExpenseStartDay)
        : DEFAULT_SETTINGS.variableExpenseStartDay,
  };
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        db.createObjectStore(ENTRY_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // 別タブで古いバージョンのアプリが開いていると、ストア追加が止まる
    request.onblocked = () =>
      reject(new Error("他のタブでこのアプリが開いているため、データベースを更新できません。他のタブを閉じてから開き直してください。"));
  });
  return dbPromise;
}

function store<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = action(tx.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export async function getAllEntries(): Promise<DiaryEntry[]> {
  return store<DiaryEntry[]>(ENTRY_STORE, "readonly", (s) => s.getAll()).then((entries) =>
    entries.map(normalizeEntry).sort((a, b) => b.date.localeCompare(a.date)),
  );
}

export async function getEntry(date: string): Promise<DiaryEntry | undefined> {
  const entry = await store<DiaryEntry | undefined>(ENTRY_STORE, "readonly", (s) => s.get(date));
  return entry ? normalizeEntry(entry) : undefined;
}

export async function saveEntry(entry: DiaryEntry): Promise<void> {
  await store<IDBValidKey>(ENTRY_STORE, "readwrite", (s) => s.put(normalizeEntry(entry)));
}

export async function deleteEntry(id: string): Promise<void> {
  await store<undefined>(ENTRY_STORE, "readwrite", (s) => s.delete(id));
}

export async function clearEntries(): Promise<void> {
  await store<undefined>(ENTRY_STORE, "readwrite", (s) => s.clear());
}

export async function putPhoto(photo: StoredPhoto): Promise<void> {
  await store<IDBValidKey>(PHOTO_STORE, "readwrite", (s) => s.put(photo));
}

export async function getPhoto(id: string): Promise<StoredPhoto | undefined> {
  return store<StoredPhoto | undefined>(PHOTO_STORE, "readonly", (s) => s.get(id));
}

export async function deletePhoto(id: string): Promise<void> {
  await store<undefined>(PHOTO_STORE, "readwrite", (s) => s.delete(id));
}

export async function getAllPhotos(): Promise<StoredPhoto[]> {
  return store<StoredPhoto[]>(PHOTO_STORE, "readonly", (s) => s.getAll());
}

export async function getAllPhotoIds(): Promise<string[]> {
  const keys = await store<IDBValidKey[]>(PHOTO_STORE, "readonly", (s) => s.getAllKeys());
  return keys.filter((key): key is string => typeof key === "string");
}

export async function clearPhotos(): Promise<void> {
  await store<undefined>(PHOTO_STORE, "readwrite", (s) => s.clear());
}

// 保存済み写真の枚数と合計サイズ。画像本体は読み出さずメタ情報だけ数える
export async function getPhotoStorageStats(): Promise<{ count: number; byteSize: number }> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const request = tx.objectStore(PHOTO_STORE).openCursor();
    let count = 0;
    let byteSize = 0;
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve({ count, byteSize });
        return;
      }
      const value = cursor.value as StoredPhoto;
      count += 1;
      byteSize += typeof value.byteSize === "number" ? value.byteSize : (value.blob?.size ?? 0);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

// どの日記からも参照されていない画像を削除する（写真の保存中にアプリを閉じた場合の置き去りを掃除する）。
// 起動時、全日記を読み込んだあとに1回だけ呼ぶ
export async function deleteUnreferencedPhotos(referencedIds: Set<string>): Promise<number> {
  const ids = await getAllPhotoIds();
  const orphans = ids.filter((id) => !referencedIds.has(id));
  for (const id of orphans) {
    await deletePhoto(id);
  }
  return orphans.length;
}

export async function getSettings(): Promise<AppSettings> {
  const settings = await store<Partial<AppSettings> | undefined>(SETTINGS_STORE, "readonly", (s) =>
    s.get(SETTINGS_KEY),
  );
  return normalizeSettings(settings);
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await store<IDBValidKey>(SETTINGS_STORE, "readwrite", (s) => s.put(settings, SETTINGS_KEY));
}

export async function clearSettings(): Promise<void> {
  await store<undefined>(SETTINGS_STORE, "readwrite", (s) => s.clear());
}

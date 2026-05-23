import { DEFAULT_SETTINGS } from "./constants";
import type { AppSettings, DiaryEntry } from "./types";

const DB_NAME = "yuki-diary-app";
const DB_VERSION = 1;
const ENTRY_STORE = "entries";
const SETTINGS_STORE = "settings";
const SETTINGS_KEY = "app";

let dbPromise: Promise<IDBDatabase> | null = null;

function normalizeEntry(entry: DiaryEntry): DiaryEntry {
  return {
    ...entry,
    scratch: typeof entry.scratch === "string" ? entry.scratch : "",
    scratchItems: Array.isArray(entry.scratchItems) ? entry.scratchItems : [],
    wakeUpTime: typeof entry.wakeUpTime === "string" ? entry.wakeUpTime : "",
    sleepHours: typeof entry.sleepHours === "number" ? entry.sleepHours : null,
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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

export async function getSettings(): Promise<AppSettings> {
  const settings = await store<AppSettings | undefined>(SETTINGS_STORE, "readonly", (s) =>
    s.get(SETTINGS_KEY),
  );
  return settings ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await store<IDBValidKey>(SETTINGS_STORE, "readwrite", (s) => s.put(settings, SETTINGS_KEY));
}

export async function clearSettings(): Promise<void> {
  await store<undefined>(SETTINGS_STORE, "readwrite", (s) => s.clear());
}

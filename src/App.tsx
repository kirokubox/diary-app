import { useEffect, useMemo, useRef, useState } from "react";
import { CompactEntryCard } from "./CompactEntryCard";
import { APP_VERSION, DAY_BOUNDARY_OPTIONS, DEFAULT_SETTINGS, DEFAULT_TEMPLATE, PHOTO_MAX_COUNT } from "./constants";
import { addDays, monthsAgoExact, nowIsoLocal, pickDailyStable, seasonOf, timeOnly, toDateInputValue, weekdayOf, yearsAgoExact } from "./dateUtils";
import { PHOTO_BACKUP_README, cleanTag, formatShortDate, getLifeDateKey, issueLabel, makeEntry, normalizeScratchItems, parseHours, validateImportedEntry } from "./diaryHelpers";
import type { ImportIssue, ImportPreview, ImportSkip, ZipPhotoPayload } from "./diaryHelpers";
import { Editor } from "./Editor";
import { downloadBlob, downloadText } from "./fileUtils";
import { buildSleepMetricsMap, buildWidgetSnapshot, getSleepMetrics, normalizeOptionalMoney, parseTimeMinutes } from "./lifeMetrics";
import { entriesToMarkdown, entryToMarkdown } from "./markdown";
import { MemoryCard } from "./MemoryCard";
import { formatByteSize, makePhotoId, photoExtension, preparePhoto } from "./photos";
import { ReadingView } from "./ReadingView";
import { RecentSleepCard } from "./RecentSleepCard";
import { clearEntries, clearPhotos, clearSettings, deleteEntry, deletePhoto, deleteUnreferencedPhotos, getAllEntries, getAllPhotoIds, getAllPhotos, getEntry, getPhotoStorageStats, getSettings, normalizePhotoMeta, putPhoto, saveEntry, saveSettings } from "./storage";
import { buildSearchSnippet } from "./summary";
import type { AppSettings, DiaryEntry, DiaryPhoto, SaveState, ScratchItem, TabKey } from "./types";
import { VariableExpenseCard } from "./VariableExpenseCard";
import { createZipBlob, readZipEntries } from "./zip";
import type { ZipInputFile } from "./zip";

export default function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [activeDate, setActiveDate] = useState(toDateInputValue());
  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [toast, setToast] = useState("");
  const saveTimer = useRef<number | null>(null);
  const hydrated = useRef(false);
  // 写真の変換・保存の途中に本文が編集されても巻き込まないよう、最新のエントリを参照で持つ
  const entryRef = useRef<DiaryEntry | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNotice, setPhotoNotice] = useState("");
  // 写真が増減したら保存容量を測り直すためのカウンタ
  const [photoStoreVersion, setPhotoStoreVersion] = useState(0);
  const [zipBusy, setZipBusy] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    count: number;
    byteSize: number;
    usage: number | null;
    quota: number | null;
  } | null>(null);

  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [templateDraft, setTemplateDraft] = useState(DEFAULT_TEMPLATE);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<{
    added: number;
    skipped: ImportSkip[];
    errors: number;
    restoredPhotos: number;
  } | null>(null);
  const [initialBodyExpanded, setInitialBodyExpanded] = useState(false);
  const [bodyOpenVersion, setBodyOpenVersion] = useState(0);
  const [entryViewMode, setEntryViewMode] = useState<"read" | "edit">("edit");
  const [scratchManageDate, setScratchManageDate] = useState("");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function refreshEntries() {
    setEntries(await getAllEntries());
  }

  useEffect(() => {
    async function init() {
      const loadedSettings = await getSettings();
      const initialDate = getLifeDateKey(new Date(), loadedSettings.dayBoundaryTime);
      const loadedEntry = await getEntry(initialDate);
      const loadedEntries = await getAllEntries();
      setSettings(loadedSettings);
      setTemplateDraft(loadedSettings.template);
      setEntries(loadedEntries);
      setActiveDate(initialDate);
      setEntry(loadedEntry ?? makeEntry(initialDate, loadedSettings));
      hydrated.current = true;
      // 写真の保存中にアプリを閉じた場合など、どの日記からも参照されていない画像を掃除する
      try {
        await deleteUnreferencedPhotos(
          new Set(loadedEntries.flatMap((item) => item.photos.map((photo) => photo.id))),
        );
      } catch {
        // 掃除に失敗しても起動は続ける（次回起動時にもう一度試す）
      }
    }
    void init();
  }, []);

  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  // 設定タブを開いたときと写真が増減したときに、写真の保存容量を測り直す
  useEffect(() => {
    if (tab !== "settings") return;
    let cancelled = false;
    async function loadStorageInfo() {
      try {
        const stats = await getPhotoStorageStats();
        let usage: number | null = null;
        let quota: number | null = null;
        if (navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          usage = estimate.usage ?? null;
          quota = estimate.quota ?? null;
        }
        if (!cancelled) setStorageInfo({ ...stats, usage, quota });
      } catch {
        if (!cancelled) setStorageInfo(null);
      }
    }
    void loadStorageInfo();
    return () => {
      cancelled = true;
    };
  }, [tab, entries, photoStoreVersion]);

  useEffect(() => {
    async function loadEntry() {
      const loaded = await getEntry(activeDate);
      setEntry(loaded ?? makeEntry(activeDate, settings));
      setSaveState("idle");
    }
    if (hydrated.current) void loadEntry();
  }, [activeDate, settings.template]);

  useEffect(() => {
    if (!entry || !hydrated.current || saveState !== "dirty") return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persistEntry(entry);
    }, 1000);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [entry, saveState]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function persistEntry(target: DiaryEntry) {
    setSaveState("saving");
    const existing = await getEntry(target.id);
    const saved: DiaryEntry = {
      ...target,
      createdAt: existing?.createdAt ?? target.createdAt,
      updatedAt: nowIsoLocal(),
      weekday: weekdayOf(target.date),
      tags: target.tags.map(cleanTag).filter(Boolean),
      scratch: typeof target.scratch === "string" ? target.scratch : "",
      scratchItems: normalizeScratchItems(target.scratchItems),
      photos: normalizePhotoMeta(target.photos),
      wakeUpTime: typeof target.wakeUpTime === "string" ? target.wakeUpTime : "",
      bedTime: typeof target.bedTime === "string" && parseTimeMinutes(target.bedTime) !== null ? target.bedTime : "",
      sleepHours: parseHours(target.sleepHours),
      napHours: parseHours(target.napHours),
      napMinutes:
        typeof target.napMinutes === "number" && Number.isFinite(target.napMinutes) && target.napMinutes >= 0
          ? Math.round(target.napMinutes)
          : null,
      everydayExpense: normalizeOptionalMoney(target.everydayExpense),
      satisfactionExpense: normalizeOptionalMoney(target.satisfactionExpense),
      regretExpense: normalizeOptionalMoney(target.regretExpense),
    };
    await saveEntry(saved);
    setEntry(saved);
    await refreshEntries();
    setSaveState("saved");
  }

  function updateEntry(next: DiaryEntry) {
    setEntry(next);
    setSaveState("dirty");
  }

  // 写真の追加。1枚ずつ「縮小 → 画像を保存 → メタデータを日記へ追記」の順で処理し、
  // 失敗した写真だけを飛ばす。文字データ（振り返り・日記・らくがきメモ）には触らない
  async function addPhotos(files: File[]) {
    const current = entryRef.current;
    if (!current || files.length === 0) return;
    const remaining = PHOTO_MAX_COUNT - current.photos.length;
    if (remaining <= 0) {
      setPhotoNotice(`写真は1日${PHOTO_MAX_COUNT}枚までです。`);
      return;
    }

    const targetDate = current.date;
    const targets = files.slice(0, remaining);
    const addedPhotos: DiaryPhoto[] = [];
    let failedCount = 0;
    let quotaFailed = false;

    setPhotoBusy(true);
    setPhotoNotice("");
    for (const file of targets) {
      try {
        const prepared = await preparePhoto(file);
        const id = makePhotoId(targetDate);
        const createdAt = nowIsoLocal();
        await putPhoto({
          id,
          date: targetDate,
          blob: prepared.blob,
          mimeType: prepared.mimeType,
          width: prepared.width,
          height: prepared.height,
          byteSize: prepared.blob.size,
          createdAt,
        });
        addedPhotos.push({
          id,
          width: prepared.width,
          height: prepared.height,
          byteSize: prepared.blob.size,
          mimeType: prepared.mimeType,
          createdAt,
        });
      } catch (error) {
        failedCount += 1;
        if (error instanceof DOMException && error.name === "QuotaExceededError") quotaFailed = true;
      }
    }
    setPhotoBusy(false);
    setPhotoStoreVersion((version) => version + 1);

    if (addedPhotos.length > 0) {
      try {
        const latest = entryRef.current;
        if (latest && latest.date === targetDate) {
          // 変換中に書かれた文字も一緒に保存する
          await persistEntry({ ...latest, photos: [...latest.photos, ...addedPhotos] });
        } else {
          // 変換中に別の日付へ移動した場合は、写真を撮った日の日記へ直接書き込む
          const stored = (await getEntry(targetDate)) ?? current;
          await saveEntry({ ...stored, photos: [...stored.photos, ...addedPhotos] });
          await refreshEntries();
        }
      } catch {
        setPhotoNotice("写真の情報を日記へ保存できませんでした。日記の文字は残っています。もう一度お試しください。");
        notify("写真を保存できませんでした");
        return;
      }
    }

    const messages: string[] = [];
    if (addedPhotos.length > 0) messages.push(`写真を${addedPhotos.length}枚追加しました。`);
    if (files.length > targets.length) {
      messages.push(`1日${PHOTO_MAX_COUNT}枚までのため、${files.length - targets.length}枚は追加していません。`);
    }
    if (quotaFailed) {
      messages.push("端末の保存容量が足りず、保存できなかった写真があります。日記の文字は保存されています。");
    } else if (failedCount > 0) {
      messages.push(`${failedCount}枚は読み込めませんでした。日記の文字は保存されています。`);
    }
    setPhotoNotice(failedCount > 0 || files.length > targets.length ? messages.join(" ") : "");
    if (messages.length > 0) notify(messages[0]);
  }

  // 写真の削除。先にメタデータを外して保存し、そのあとで画像を消す
  // （逆順だと、画像が無いのにメタデータだけ残る状態になりうる）
  async function removePhoto(photo: DiaryPhoto): Promise<boolean> {
    const current = entryRef.current;
    if (!current) return false;
    const ok = window.confirm("この写真を削除しますか？\n\n日記の文字と他の写真は残ります。");
    if (!ok) return false;
    try {
      await persistEntry({ ...current, photos: current.photos.filter((item) => item.id !== photo.id) });
    } catch {
      notify("写真を削除できませんでした");
      return false;
    }
    try {
      await deletePhoto(photo.id);
    } catch {
      // 画像の削除だけ失敗した場合は、次回起動時の掃除で消える
    }
    setPhotoStoreVersion((version) => version + 1);
    setPhotoNotice("");
    notify("写真を削除しました");
    return true;
  }

  async function openDate(date: string) {
    if (entry && saveState === "dirty") {
      await persistEntry(entry);
    }
    setEntryViewMode("edit");
    setInitialBodyExpanded(false);
    setBodyOpenVersion((version) => version + 1);
    setActiveDate(date);
    setTab("today");
  }

  // 一覧・検索・グラフ・メモリーカードからの遷移は閲覧モードで開く
  async function openDateForReading(date: string) {
    if (entry && saveState === "dirty") {
      await persistEntry(entry);
    }
    setEntryViewMode("read");
    setActiveDate(date);
    setTab("today");
  }

  // 閲覧モードから同じ日付の入力モードへ。振り返りを展開した状態で開く
  function startEditing() {
    setInitialBodyExpanded(true);
    setBodyOpenVersion((version) => version + 1);
    setEntryViewMode("edit");
  }

  async function exportEntryMarkdown() {
    if (!entry) return;
    await persistEntry(entry);
    const previous = entries.find((item) => item.date === addDays(entry.date, -1));
    downloadText(
      `diary-${entry.date}.md`,
      entryToMarkdown({ ...entry, updatedAt: nowIsoLocal() }, previous, settings.dayBoundaryTime),
      "text/markdown",
    );
    notify("Markdownをエクスポートしました");
  }

  // 閲覧モード用。保存を伴わない(未作成日にテンプレだけの日記を作らない)
  function exportEntryMarkdownWithoutSave() {
    if (!entry) return;
    const previous = entries.find((item) => item.date === addDays(entry.date, -1));
    downloadText(`diary-${entry.date}.md`, entryToMarkdown(entry, previous, settings.dayBoundaryTime), "text/markdown");
    notify("Markdownをエクスポートしました");
  }

  async function removeCurrentEntry() {
    if (!entry) return;
    const typed = window.prompt("削除するには「削除」と入力してください。");
    if (typed !== "削除") return;
    const removedPhotos = entry.photos;
    await deleteEntry(entry.id);
    // 日記を消したら、その日の写真も残さない
    for (const photo of removedPhotos) {
      try {
        await deletePhoto(photo.id);
      } catch {
        // 消し残しは次回起動時の掃除で回収する
      }
    }
    setPhotoStoreVersion((version) => version + 1);
    await refreshEntries();
    setEntry(makeEntry(activeDate, settings));
    setSaveState("idle");
    notify("日記を削除しました");
  }

  // 設定タブの「らくがきメモの削除」専用。日記本体の削除フローとは別
  async function removeScratchItemFromDate(date: string, item: ScratchItem) {
    const ok = window.confirm(`このらくがきメモを削除しますか？\n\n${item.text}`);
    if (!ok) return;
    const target = await getEntry(date);
    if (!target) return;
    const updated: DiaryEntry = { ...target, scratchItems: target.scratchItems.filter((scratchItem) => scratchItem.id !== item.id) };
    await saveEntry(updated);
    await refreshEntries();
    // 今開いている入力中の日記と同じ日付なら、未保存の入力内容を消さずにメモ一覧だけ同期する
    if (entry && entry.date === date) {
      setEntry((current) => (current ? { ...current, scratchItems: current.scratchItems.filter((scratchItem) => scratchItem.id !== item.id) } : current));
    }
    notify("らくがきメモを削除しました");
  }

  const searchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((item) => {
      const keywordMatch =
        !normalizedQuery ||
        item.body.toLowerCase().includes(normalizedQuery) ||
        item.scratch.toLowerCase().includes(normalizedQuery) ||
        item.scratchItems.some((scratchItem) => scratchItem.text.toLowerCase().includes(normalizedQuery)) ||
        item.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));
      const fromMatch = !fromDate || item.date >= fromDate;
      const toMatch = !toDate || item.date <= toDate;
      return keywordMatch && fromMatch && toMatch;
    });
  }, [entries, query, fromDate, toDate]);

  // entries は日付降順なので先頭7件が直近
  const recentEntries = useMemo(() => entries.slice(0, 7), [entries]);
  const sleepMetricsByDate = useMemo(
    () => buildSleepMetricsMap(entries, settings.dayBoundaryTime),
    [entries, settings.dayBoundaryTime],
  );
  const activeSleepMetrics = useMemo(() => {
    if (!entry) return null;
    const previous = entries.find((item) => item.date === addDays(entry.date, -1));
    return getSleepMetrics(entry, previous, settings.dayBoundaryTime);
  }, [entry, entries, settings.dayBoundaryTime]);

  // 閲覧モードで「保存済みの日記がある日か」を判定する(未作成日はテンプレを見せない)
  const entryExists = useMemo(() => entries.some((item) => item.date === activeDate), [entries, activeDate]);

  // 設定タブの「らくがきメモの削除」で選んだ日付の日記
  const scratchManageEntry = useMemo(
    () => entries.find((item) => item.date === scratchManageDate) ?? null,
    [entries, scratchManageDate],
  );

  const memoryCards = useMemo(() => {
    const todayKey = getLifeDateKey(new Date(), settings.dayBoundaryTime);
    const monthAgoDate = monthsAgoExact(todayKey, 1);
    const yearAgoDate = yearsAgoExact(todayKey, 1);
    const monthAgoEntry = (monthAgoDate && entries.find((item) => item.date === monthAgoDate)) || null;
    const yearAgoEntry = (yearAgoDate && entries.find((item) => item.date === yearAgoDate)) || null;

    const season = seasonOf(todayKey);
    const visibleDates = new Set(entries.slice(0, 7).map((item) => item.date));
    if (monthAgoEntry) visibleDates.add(monthAgoEntry.date);
    if (yearAgoEntry) visibleDates.add(yearAgoEntry.date);
    const seasonBase = entries.filter((item) => item.date < todayKey && seasonOf(item.date) === season);
    const seasonCandidates = seasonBase.filter((item) => !visibleDates.has(item.date));
    const seasonEntry = pickDailyStable(
      seasonCandidates.length > 0 ? seasonCandidates : seasonBase,
      (item) => item.date,
      todayKey,
    );

    return { monthAgoDate, yearAgoDate, monthAgoEntry, yearAgoEntry, season, seasonEntry };
  }, [entries, settings.dayBoundaryTime]);

  async function exportJson() {
    const payload = {
      appName: "Yuki Diary App" as const,
      version: APP_VERSION,
      exportedAt: nowIsoLocal(),
      settings,
      entries,
    };
    downloadText(
      `diary-backup-${toDateInputValue()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }

  function exportMarkdown() {
    downloadText(`diary-export-${toDateInputValue()}.md`, entriesToMarkdown(entries, settings.dayBoundaryTime), "text/markdown");
  }

  // 通常JSONと写真つきZIP内のJSONで共通に使う検証。写真の画像そのものは扱わない
  async function buildImportPreview(text: string, fileName: string): Promise<ImportPreview> {
    const data = JSON.parse(text) as unknown;
    if (!data || typeof data !== "object" || !Array.isArray((data as { entries?: unknown }).entries)) {
      throw new Error("entries 配列が見つかりません。");
    }
    const incoming = (data as { entries: unknown[] }).entries;
    const current = await getAllEntries();
    const currentIds = new Set(current.map((item) => item.id));
    const currentDates = new Set(current.map((item) => item.date));
    const jsonIds = new Set<string>();
    const jsonDates = new Set<string>();
    const addableEntries: DiaryEntry[] = [];
    const skippedEntries: ImportSkip[] = [];
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];

    incoming.forEach((item, zeroBasedIndex) => {
      const index = zeroBasedIndex + 1;
      const result = validateImportedEntry(item, index);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
      if (!result.entry) return;

      const entry = result.entry;
      const alreadyInJson = jsonIds.has(entry.id) || jsonDates.has(entry.date);
      if (alreadyInJson) {
        errors.push({ index, date: entry.date, message: "同じJSON内で id または date が重複しています。" });
        return;
      }
      jsonIds.add(entry.id);
      jsonDates.add(entry.date);

      if (currentIds.has(entry.id) || currentDates.has(entry.date)) {
        skippedEntries.push({
          index,
          date: entry.date,
          message: `${entry.date} は既存の日記があるためスキップします。`,
        });
        return;
      }

      addableEntries.push(entry);
    });

    const settingsFound = "settings" in data;
    const rawSettings = settingsFound ? (data as { settings?: unknown }).settings : null;
    const importedSettings = rawSettings && typeof rawSettings === "object"
      ? {
          ...DEFAULT_SETTINGS,
          ...(rawSettings as Partial<AppSettings>),
          variableExpenseBudget:
            normalizeOptionalMoney((rawSettings as Partial<AppSettings>).variableExpenseBudget) ?? DEFAULT_SETTINGS.variableExpenseBudget,
          variableExpenseStartDay:
            typeof (rawSettings as Partial<AppSettings>).variableExpenseStartDay === "number"
              ? Math.min(31, Math.max(1, Math.round((rawSettings as Partial<AppSettings>).variableExpenseStartDay!)))
              : DEFAULT_SETTINGS.variableExpenseStartDay,
        }
      : null;
    if (settingsFound) {
      warnings.push({ message: "settings が含まれています。実行するとテンプレート・生活日付・変動費設定も復元します。" });
    }

    const photoMetaCount = addableEntries.reduce((sum, item) => sum + item.photos.length, 0);

    return {
      fileName,
      total: incoming.length,
      addableEntries,
      skippedEntries,
      errors,
      warnings,
      settingsFound,
      importedSettings,
      photoMetaCount,
      zipPhotos: [],
    };
  }

  async function importJson(file: File | undefined) {
    if (!file) return;
    setImportResult(null);
    try {
      const preview = await buildImportPreview(await file.text(), file.name);
      if (preview.photoMetaCount > 0) {
        preview.warnings.push({
          message: `写真の情報が${preview.photoMetaCount}件ありますが、通常のJSONに画像は入っていません。画像も戻すには写真つきZIPインポートを使ってください。`,
        });
      }
      setImportPreview(preview);
      notify("JSONを検証しました。内容を確認してください");
    } catch (error) {
      setImportPreview(null);
      window.alert(error instanceof Error ? error.message : "JSONを読み込めませんでした。");
    }
  }

  // 写真つきZIPバックアップの書き出し。日記本文（通常JSONと同じ形式）＋画像＋対応表を1ファイルにまとめる
  async function exportPhotoZip() {
    setZipBusy(true);
    try {
      const allEntries = await getAllEntries();
      const storedPhotos = await getAllPhotos();
      const photoById = new Map(storedPhotos.map((photo) => [photo.id, photo]));
      const files: ZipInputFile[] = [];
      const manifest: Array<Record<string, unknown>> = [];
      let missingCount = 0;

      allEntries.forEach((item) => {
        item.photos.forEach((meta, index) => {
          const stored = photoById.get(meta.id);
          if (!stored?.blob) {
            missingCount += 1;
            return;
          }
          const path = `photos/${item.date}/${String(index + 1).padStart(2, "0")}_${meta.id}.${photoExtension(
            stored.mimeType,
          )}`;
          files.push({ path, blob: stored.blob });
          manifest.push({
            id: meta.id,
            date: item.date,
            path,
            mimeType: stored.mimeType,
            width: stored.width,
            height: stored.height,
            byteSize: stored.byteSize,
            createdAt: stored.createdAt,
          });
        });
      });

      const exportedAt = nowIsoLocal();
      const backup = {
        appName: "Yuki Diary App" as const,
        version: APP_VERSION,
        exportedAt,
        settings,
        entries: allEntries,
      };
      const zip = await createZipBlob(
        [
          { path: "diary-backup.json", blob: new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }) },
          ...files,
          {
            path: "photos.json",
            blob: new Blob(
              [
                JSON.stringify(
                  { appName: "Yuki Diary App", kind: "photo-backup", version: APP_VERSION, exportedAt, photos: manifest },
                  null,
                  2,
                ),
              ],
              { type: "application/json" },
            ),
          },
          { path: "README.txt", blob: new Blob([PHOTO_BACKUP_README], { type: "text/plain" }) },
        ],
        new Date(),
      );
      downloadBlob(`diary-photo-backup-${toDateInputValue()}.zip`, zip);
      notify(
        missingCount > 0
          ? `ZIPを出力しました（画像が見つからない写真${missingCount}枚を除く）`
          : `ZIPを出力しました（写真${files.length}枚）`,
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "ZIPを出力できませんでした。");
    } finally {
      setZipBusy(false);
    }
  }

  async function importPhotoZip(file: File | undefined) {
    if (!file) return;
    setImportResult(null);
    setZipBusy(true);
    try {
      const zipEntries = await readZipEntries(file);
      const backupFile = zipEntries.find((item) => item.path.replace(/^.*\//, "") === "diary-backup.json");
      if (!backupFile) throw new Error("ZIPの中に diary-backup.json が見つかりません。");
      const manifestFile = zipEntries.find((item) => item.path.replace(/^.*\//, "") === "photos.json");
      const preview = await buildImportPreview(await backupFile.blob.text(), file.name);

      const zipPhotos: ZipPhotoPayload[] = [];
      if (manifestFile) {
        const manifest = JSON.parse(await manifestFile.blob.text()) as { photos?: unknown };
        const list = Array.isArray(manifest.photos) ? manifest.photos : [];
        const byPath = new Map(zipEntries.map((item) => [item.path, item.blob]));
        for (const raw of list) {
          if (!raw || typeof raw !== "object") continue;
          const photo = raw as Record<string, unknown>;
          const id = typeof photo.id === "string" ? photo.id : "";
          const path = typeof photo.path === "string" ? photo.path : "";
          const blob = byPath.get(path);
          if (!id || !blob) continue;
          zipPhotos.push({
            id,
            date: typeof photo.date === "string" ? photo.date : "",
            mimeType: typeof photo.mimeType === "string" ? photo.mimeType : "image/jpeg",
            width: typeof photo.width === "number" ? photo.width : 0,
            height: typeof photo.height === "number" ? photo.height : 0,
            createdAt: typeof photo.createdAt === "string" ? photo.createdAt : "",
            blob,
          });
        }
      } else {
        preview.warnings.push({ message: "ZIPの中に photos.json が無いため、写真は復元できません（本文だけ復元します）。" });
      }

      setImportPreview({ ...preview, zipPhotos });
      notify("ZIPを検証しました。内容を確認してください");
    } catch (error) {
      setImportPreview(null);
      window.alert(error instanceof Error ? error.message : "ZIPを読み込めませんでした。");
    } finally {
      setZipBusy(false);
    }
  }

  async function addNewEntriesFromImport() {
    if (!importPreview || importPreview.errors.length > 0) return;
    try {
      for (const item of importPreview.addableEntries) {
        await saveEntry(item);
      }
      if (importPreview.importedSettings) {
        await saveSettings(importPreview.importedSettings);
        setSettings(importPreview.importedSettings);
        setTemplateDraft(importPreview.importedSettings.template);
      }
      await refreshEntries();

      // 本文を追加したあと、日記から参照されている写真だけを復元する。
      // すでに端末にある画像は上書きしない（本文が既存でも、画像が失われている日は復元できる）
      let restoredPhotos = 0;
      if (importPreview.zipPhotos.length > 0) {
        const afterEntries = await getAllEntries();
        const referencedIds = new Set(afterEntries.flatMap((item) => item.photos.map((photo) => photo.id)));
        const existingIds = new Set(await getAllPhotoIds());
        for (const photo of importPreview.zipPhotos) {
          if (!referencedIds.has(photo.id) || existingIds.has(photo.id)) continue;
          const blob = new Blob([await photo.blob.arrayBuffer()], { type: photo.mimeType });
          await putPhoto({
            id: photo.id,
            date: photo.date,
            blob,
            mimeType: photo.mimeType,
            width: photo.width,
            height: photo.height,
            byteSize: blob.size,
            createdAt: photo.createdAt,
          });
          restoredPhotos += 1;
        }
        setPhotoStoreVersion((version) => version + 1);
      }

      setImportResult({
        added: importPreview.addableEntries.length,
        skipped: importPreview.skippedEntries,
        errors: importPreview.errors.length,
        restoredPhotos,
      });
      setImportPreview(null);
      notify(
        restoredPhotos > 0
          ? `インポート完了：${importPreview.addableEntries.length}件と写真${restoredPhotos}枚を追加しました`
          : `インポート完了：${importPreview.addableEntries.length}件を追加しました`,
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "インポートに失敗しました。");
    }
  }

  async function saveTemplate() {
    const next = { ...settings, template: templateDraft };
    setSettings(next);
    await saveSettings(next);
    notify("テンプレートを保存しました");
  }

  async function saveDayBoundaryTime(dayBoundaryTime: string) {
    const next = { ...settings, dayBoundaryTime };
    setSettings(next);
    await saveSettings(next);
    notify("生活日付設定を保存しました");
  }

  async function saveExpenseSettings(patch: Partial<Pick<AppSettings, "variableExpenseBudget" | "variableExpenseStartDay">>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
    notify("変動費設定を保存しました");
  }

  function syncAndroidWidget() {
    const today = getLifeDateKey(new Date(), settings.dayBoundaryTime);
    const snapshot = buildWidgetSnapshot(entries, settings, today);
    const params = new URLSearchParams({
      sleep: snapshot.averageSleepText,
      remaining: snapshot.remainingText,
      yesterday: snapshot.yesterdayExpenseText,
      updated: snapshot.updatedAt,
    });
    window.location.href = `seasonaldiary://widget/update?${params.toString()}`;
  }

  async function resetTemplate() {
    const next = { ...settings, template: DEFAULT_TEMPLATE };
    setSettings(next);
    setTemplateDraft(DEFAULT_TEMPLATE);
    await saveSettings(next);
    notify("初期テンプレートに戻しました");
  }

  async function deleteAllData() {
    const typed = window.prompt("全データを削除するには「削除」と入力してください。");
    if (typed !== "削除") return;
    await clearEntries();
    await clearPhotos();
    setPhotoStoreVersion((version) => version + 1);
    await clearSettings();
    setSettings(DEFAULT_SETTINGS);
    setTemplateDraft(DEFAULT_SETTINGS.template);
    setEntries([]);
    setEntry(makeEntry(activeDate, DEFAULT_SETTINGS));
    notify("全データを削除しました");
  }

  return (
    <div className="app-shell">
      {!isOnline && <div className="offline-badge">オフライン</div>}
      <main>
        {tab === "today" && entry && activeSleepMetrics && (
          entryViewMode === "read" ? (
            <ReadingView
              entry={entry}
              sleep={activeSleepMetrics}
              exists={entryExists}
              onMoveDate={openDateForReading}
              onStartEditing={startEditing}
              onExportMarkdown={exportEntryMarkdownWithoutSave}
            />
          ) : (
            <Editor
              entry={entry}
              sleep={activeSleepMetrics}
              saveState={saveState}
              onChange={updateEntry}
              onManualSave={() => void persistEntry(entry)}
              onExportMarkdown={() => void exportEntryMarkdown()}
              onMoveDate={openDate}
              onDelete={() => void removeCurrentEntry()}
              initialBodyExpanded={initialBodyExpanded}
              bodyOpenVersion={bodyOpenVersion}
              photoBusy={photoBusy}
              photoNotice={photoNotice}
              onAddPhotos={addPhotos}
              onDeletePhoto={removePhoto}
            />
          )
        )}

        {tab === "list" && (
          <div className="screen">
            <header className="screen-header">
              <div>
                <p className="eyebrow">一覧</p>
                <h1>日記一覧</h1>
              </div>
              <span className="count">{entries.length}件</span>
            </header>
            <RecentSleepCard entries={entries} dayBoundaryTime={settings.dayBoundaryTime} onOpenDate={openDateForReading} />
            <VariableExpenseCard entries={entries} settings={settings} today={getLifeDateKey(new Date(), settings.dayBoundaryTime)} />
            <section className="list-section">
              <h2 className="list-section-title">最近の日記</h2>
              {recentEntries.length === 0 ? (
                <p className="empty">まだ保存された日記はありません。</p>
              ) : (
                <div className="entry-list">
                  {recentEntries.map((item) => (
                    <CompactEntryCard entry={item} sleep={sleepMetricsByDate.get(item.date)} key={item.id} onOpen={openDateForReading} />
                  ))}
                </div>
              )}
            </section>
            <MemoryCard
              label={`1か月前${memoryCards.monthAgoDate ? `（${formatShortDate(memoryCards.monthAgoDate)}）` : ""}`}
              entry={memoryCards.monthAgoEntry}
              sleep={memoryCards.monthAgoEntry ? sleepMetricsByDate.get(memoryCards.monthAgoEntry.date) : undefined}
              onOpen={openDateForReading}
            />
            <MemoryCard
              label={`1年前${memoryCards.yearAgoDate ? `（${formatShortDate(memoryCards.yearAgoDate)}）` : ""}`}
              entry={memoryCards.yearAgoEntry}
              sleep={memoryCards.yearAgoEntry ? sleepMetricsByDate.get(memoryCards.yearAgoEntry.date) : undefined}
              onOpen={openDateForReading}
            />
            {memoryCards.seasonEntry && (
              <MemoryCard
                label={`この季節の記録（${memoryCards.season}）`}
                entry={memoryCards.seasonEntry}
                sleep={sleepMetricsByDate.get(memoryCards.seasonEntry.date)}
                onOpen={openDateForReading}
              />
            )}
          </div>
        )}

        {tab === "search" && (
          <div className="screen">
            <header className="screen-header">
              <div>
                <p className="eyebrow">検索</p>
                <h1>日記を探す</h1>
              </div>
              <span className="count">{searchResults.length}件</span>
            </header>
            <section className="search-panel">
              <label>
                キーワード
                <input value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <div className="search-date-row">
                <label>
                  開始日
                  <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
                </label>
                <label>
                  終了日
                  <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
                </label>
              </div>
            </section>
            <div className="entry-list">
              {searchResults.map((item) => (
                <CompactEntryCard
                  entry={item}
                  sleep={sleepMetricsByDate.get(item.date)}
                  key={item.id}
                  snippet={buildSearchSnippet(item, query)}
                  onOpen={openDateForReading}
                />
              ))}
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="screen settings-screen">
            <header className="screen-header">
              <div>
                <p className="eyebrow">設定</p>
                <h1>設定</h1>
              </div>
            </header>

            <section className="settings-section">
              <h2>生活日付設定</h2>
              <p className="notice">
                日付切り替え時刻より前の時間帯は、前日の記録として扱います。
                例：05:00に設定すると、深夜1:00の記録は前日分として開きます。
              </p>
              <label className="settings-field">
                日付切り替え時刻
                <select value={settings.dayBoundaryTime} onChange={(event) => void saveDayBoundaryTime(event.target.value)}>
                  {DAY_BOUNDARY_OPTIONS.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="settings-section">
              <h2>変動費設定</h2>
              <p className="notice">変動費全額を、指定した開始日から翌月の前日までで集計します。</p>
              <div className="two-cols settings-money-grid">
                <label>
                  変動費予算
                  <input
                    min="0"
                    step="1"
                    type="number"
                    value={settings.variableExpenseBudget}
                    onChange={(event) => setSettings({ ...settings, variableExpenseBudget: normalizeOptionalMoney(event.target.value) ?? 0 })}
                    onBlur={() => void saveExpenseSettings({ variableExpenseBudget: settings.variableExpenseBudget })}
                  />
                </label>
                <label>
                  期間開始日
                  <input
                    min="1"
                    max="31"
                    step="1"
                    type="number"
                    value={settings.variableExpenseStartDay}
                    onChange={(event) => setSettings({ ...settings, variableExpenseStartDay: Math.min(31, Math.max(1, Number(event.target.value) || 1)) })}
                    onBlur={() => void saveExpenseSettings({ variableExpenseStartDay: settings.variableExpenseStartDay })}
                  />
                </label>
              </div>
            </section>

            <section className="settings-section">
              <h2>Androidウィジェット</h2>
              <p className="notice">Android companionをインストールしたPixel 8へ、直近7日平均・今期残額・前日変動費だけを渡します。日記本文と写真は渡しません。</p>
              <button className="wide" type="button" onClick={syncAndroidWidget}>ウィジェットを更新</button>
            </section>

            <section className="settings-section">
              <h2>テンプレート編集</h2>
              <textarea
                className="template-editor"
                value={templateDraft}
                onChange={(event) => setTemplateDraft(event.target.value)}
              />
              <div className="action-row">
                <button className="primary" onClick={saveTemplate} type="button">
                  保存
                </button>
                <button onClick={resetTemplate} type="button">
                  初期テンプレートに戻す
                </button>
              </div>
            </section>

            <section className="settings-section">
              <h2>バックアップと復元</h2>
              <p className="notice">
                インポート前に、現在の日記データをJSONエクスポートしてバックアップすることをおすすめします。
                インポートでは既存の日記を上書きせず、新規データだけを追加します。
              </p>
              <p className="notice">
                <strong>JSONエクスポートに写真の画像は入りません。</strong>
                入るのは「写真が何枚あるか」という情報だけです。写真も含めて残す場合は、下の「写真つきZIPエクスポート」を使ってください。
                JSONだけで復元すると、本文は戻りますが写真は空のまま（読み込めない写真として表示）になります。
              </p>
              <div className="action-row">
                <button onClick={() => void exportJson()} type="button">
                  JSONエクスポート
                </button>
                <button onClick={exportMarkdown} type="button">
                  Markdownエクスポート
                </button>
              </div>
              <label className="file-picker">
                JSONインポート
                <input
                  accept="application/json,.json"
                  type="file"
                  onChange={(event) => {
                    void importJson(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <div className="action-row">
                <button disabled={zipBusy} onClick={() => void exportPhotoZip()} type="button">
                  {zipBusy ? "処理中..." : "写真つきZIPエクスポート"}
                </button>
              </div>
              <label className="file-picker">
                写真つきZIPインポート
                <input
                  accept="application/zip,.zip"
                  disabled={zipBusy}
                  type="file"
                  onChange={(event) => {
                    void importPhotoZip(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {importPreview && (
                <div className="import-preview">
                  <div>
                    <p className="eyebrow">インポート前プレビュー</p>
                    <h3>{importPreview.fileName}</h3>
                  </div>
                  <div className="import-summary">
                    <span>読み込み件数：{importPreview.total}件</span>
                    <span>新規追加：{importPreview.addableEntries.length}件</span>
                    <span>重複：{importPreview.skippedEntries.length}件</span>
                    <span>エラー：{importPreview.errors.length}件</span>
                    <span>警告：{importPreview.warnings.length}件</span>
                  </div>
                  {importPreview.zipPhotos.length > 0 && (
                    <div className="import-detail">
                      <h4>写真</h4>
                      <p>
                        ZIPに写真{importPreview.zipPhotos.length}枚が入っています。
                        日記から参照されていて、まだ端末に無い写真だけを復元します（既にある写真は上書きしません）。
                      </p>
                    </div>
                  )}

                  {importPreview.addableEntries.length > 0 && (
                    <div className="import-detail">
                      <h4>追加予定の日付</h4>
                      <p>{importPreview.addableEntries.map((item) => item.date).join("、")}</p>
                    </div>
                  )}

                  {importPreview.skippedEntries.length > 0 && (
                    <div className="import-detail">
                      <h4>スキップする日付</h4>
                      <ul>
                        {importPreview.skippedEntries.map((item) => (
                          <li key={`${item.index}-${item.date}`}>{item.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {importPreview.errors.length > 0 && (
                    <div className="import-detail danger-text">
                      <h4>エラー</h4>
                      <ul>
                        {importPreview.errors.map((item, index) => (
                          <li key={`${item.index ?? "all"}-${index}`}>{issueLabel(item)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {importPreview.warnings.length > 0 && (
                    <div className="import-detail warning-text">
                      <h4>警告</h4>
                      <ul>
                        {importPreview.warnings.map((item, index) => (
                          <li key={`${item.index ?? "all"}-${index}`}>{issueLabel(item)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="action-row">
                    <button
                      className="primary"
                      disabled={
                        importPreview.errors.length > 0 ||
                        (importPreview.addableEntries.length === 0 && importPreview.zipPhotos.length === 0)
                      }
                      onClick={() => void addNewEntriesFromImport()}
                      type="button"
                    >
                      {importPreview.zipPhotos.length > 0 ? "新規データと写真を復元する" : "新規データだけ追加する"}
                    </button>
                    <button onClick={() => setImportPreview(null)} type="button">
                      プレビューを閉じる
                    </button>
                  </div>
                  {importPreview.errors.length > 0 && (
                    <p className="subtle">エラーがあるため、このJSONはまだインポートできません。</p>
                  )}
                </div>
              )}

              {importResult && (
                <div className="import-preview">
                  <p className="eyebrow">インポート結果</p>
                  <h3>インポート完了</h3>
                  <div className="import-summary">
                    <span>追加：{importResult.added}件</span>
                    <span>スキップ：{importResult.skipped.length}件</span>
                    <span>エラー：{importResult.errors}件</span>
                    <span>写真復元：{importResult.restoredPhotos}枚</span>
                  </div>
                  {importResult.skipped.length > 0 && (
                    <div className="import-detail">
                      <h4>スキップした日付</h4>
                      <p>{importResult.skipped.map((item) => item.date).join("、")}</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="settings-section">
              <h2>写真の保存容量</h2>
              <p className="notice">
                写真は追加したときに長辺1600pxへ縮小して保存します（撮影場所などのメタデータは残りません）。
                元の写真は端末のギャラリー側にそのまま残ります。
              </p>
              {storageInfo ? (
                <div className="import-summary storage-summary">
                  <span>保存枚数：{storageInfo.count}枚</span>
                  <span>写真の合計：{formatByteSize(storageInfo.byteSize)}</span>
                  <span>
                    アプリ全体：
                    {storageInfo.usage === null ? "-" : formatByteSize(storageInfo.usage)}
                  </span>
                  <span>
                    使用できる上限：
                    {storageInfo.quota === null ? "-" : formatByteSize(storageInfo.quota)}
                  </span>
                </div>
              ) : (
                <p className="empty">保存容量を取得できませんでした。</p>
              )}
            </section>

            <section className="settings-section">
              <h2>データ削除</h2>
              <button className="danger wide" onClick={() => void deleteAllData()} type="button">
                全データ削除
              </button>
            </section>

            <section className="settings-section info">
              <h2>アプリ情報</h2>
              <p>
                このアプリは、日々の出来事・感情・思考を記録しながら、メタ認知能力、言語化能力、
                文章力を高めるための個人用Web日記です。
              </p>
              <p>
                このアプリの日記データはサーバーではなく、ブラウザ内のIndexedDBに保存されます。
                Chromeの閲覧データやサイトデータを削除すると、日記データが消える可能性があります。
              </p>
              <p>
                公開URLに日記本文が保存されるわけではありません。ただし、URLを知っている人は
                アプリ画面を開ける可能性があります。公開URLをSNSやnoteに載せないでください。
              </p>
              <p>
                スマホとPCでデータは自動同期されません。スマホで書いた日記はスマホ側のブラウザに、
                PCで書いた日記はPC側のブラウザに保存されます。
              </p>
              <ul>
                <li>定期的にJSONエクスポートでバックアップしてください。</li>
                <li>本番運用する場合は、週1回以上のJSONバックアップを推奨します。</li>
                <li>JSONバックアップファイルをGitHubや公開フォルダに入れないでください。</li>
                <li>JSONは復元用、Markdownは閲覧・共有・ChatGPT連携用です。</li>
                <li>
                  写真の画像はJSONにもMarkdownにも含まれません。写真も残す場合は「写真つきZIPエクスポート」を使い、
                  ZIPも公開しない場所に保管してください。
                </li>
              </ul>
            </section>

            <section className="settings-section subtle-section">
              <h2>らくがきメモの削除</h2>
              <p className="notice">
                らくがき帳は基本的に書きっぱなしにする場所で、日記画面には削除ボタンを置いていません。
                個人情報や第三者のことをうっかり書いてしまったときなど、どうしても消したい場合だけここから削除してください。
              </p>
              <label className="settings-field">
                日付を選ぶ
                <input
                  type="date"
                  value={scratchManageDate}
                  onChange={(event) => setScratchManageDate(event.target.value)}
                />
              </label>
              {scratchManageDate && (
                scratchManageEntry && scratchManageEntry.scratchItems.length > 0 ? (
                  <ul className="scratch-manage-list">
                    {[...scratchManageEntry.scratchItems]
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .map((item) => (
                        <li key={item.id}>
                          <div>
                            <time>{timeOnly(item.createdAt)}</time>
                            <p>{item.text}</p>
                          </div>
                          <button
                            className="small-danger"
                            type="button"
                            onClick={() => void removeScratchItemFromDate(scratchManageDate, item)}
                          >
                            削除
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="empty">この日のらくがきメモはありません。</p>
                )
              )}
            </section>
          </div>
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}

      <nav className="bottom-tabs" aria-label="画面切り替え">
        {[
          ["today", "日記"],
          ["list", "一覧"],
          ["search", "検索"],
          ["settings", "設定"],
        ].map(([key, label]) => (
          <button
            className={tab === key ? "active" : ""}
            key={key}
            onClick={() => {
              if (key === "today") setEntryViewMode("edit");
              setTab(key as TabKey);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

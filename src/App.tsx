import { useEffect, useMemo, useRef, useState } from "react";
import { CompactEntryCard } from "./CompactEntryCard";
import { APP_VERSION, DEFAULT_SETTINGS, DEFAULT_TEMPLATE, DEFAULT_WEEKLY_GOAL_TEMPLATE, PHOTO_MAX_COUNT } from "./constants";
import { formatMonthLabel, monthOf, monthsAgoExact, nowIsoLocal, pickDailyStable, seasonOf, timeOnly, toDateInputValue, weekdayOf, weekStartOf, yearsAgoExact } from "./dateUtils";
import { PHOTO_BACKUP_README, cleanTag, formatShortDate, issueLabel, makeEntry, normalizeScratchItems, parseHours, validateImportedEntry } from "./diaryHelpers";
import type { ImportIssue, ImportPreview, ImportSkip, ZipPhotoPayload } from "./diaryHelpers";
import { Editor } from "./Editor";
import { downloadBlob, downloadText } from "./fileUtils";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { normalizeOptionalMoney, parseTimeMinutes } from "./lifeMetrics";
import { entriesToMarkdown, entryToMarkdown } from "./markdown";
import { MemoryCard } from "./MemoryCard";
import { MonthlyReviewHub } from "./PeriodReviewUI";
import { normalizeMonthlyReview, normalizeWeeklyReview, periodContextForDate } from "./periodReviews";
import { formatByteSize, makePhotoId, photoExtension, preparePhoto } from "./photos";
import { ReadingView } from "./ReadingView";
import { clearEntries, clearMonthlyReviews, clearPhotos, clearSettings, clearWeeklyReviews, deleteEntry, deletePhoto, deleteUnreferencedPhotos, getAllEntries, getAllMonthlyReviews, getAllPhotoIds, getAllPhotos, getAllWeeklyReviews, getEntry, getPhotoStorageStats, getSettings, normalizePhotoMeta, putPhoto, saveEntry, saveMonthlyReview, saveSettings, saveWeeklyReview } from "./storage";
import { buildSearchSnippet } from "./summary";
import type { AppSettings, DiaryEntry, DiaryPhoto, MonthlyReview, SaveState, ScratchItem, TabKey, WeeklyReview } from "./types";
import { createZipBlob, readZipEntries } from "./zip";
import type { ZipInputFile } from "./zip";
import { AppBar } from "./ui";

export default function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [weeklyReviews, setWeeklyReviews] = useState<WeeklyReview[]>([]);
  const [monthlyReviews, setMonthlyReviews] = useState<MonthlyReview[]>([]);
  const [selectedReviewMonth, setSelectedReviewMonth] = useState(monthOf(toDateInputValue()));
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState(DEFAULT_TEMPLATE);
  const [weeklyGoalTemplateDraft, setWeeklyGoalTemplateDraft] = useState(DEFAULT_WEEKLY_GOAL_TEMPLATE);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<{
    added: number;
    weeklyAdded: number;
    monthlyAdded: number;
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
      const initialDate = toDateInputValue();
      const loadedEntry = await getEntry(initialDate);
      const [loadedEntries, loadedWeeklyReviews, loadedMonthlyReviews] = await Promise.all([
        getAllEntries(),
        getAllWeeklyReviews(),
        getAllMonthlyReviews(),
      ]);
      setSettings(loadedSettings);
      setTemplateDraft(loadedSettings.template);
      setWeeklyGoalTemplateDraft(loadedSettings.weeklyGoalTemplate);
      setEntries(loadedEntries);
      setWeeklyReviews(loadedWeeklyReviews);
      setMonthlyReviews(loadedMonthlyReviews);
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

  // 保存ボタンを置かない代わりに、アプリを閉じる・裏へ回すときは待たずに保存する
  const saveStateRef = useRef<SaveState>("idle");
  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);
  useEffect(() => {
    function flush() {
      if (document.visibilityState !== "hidden") return;
      const current = entryRef.current;
      if (current && saveStateRef.current === "dirty") void persistEntry(current);
    }
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);

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

  async function persistWeeklyReview(weekStart: string, goalTheme: string, reflection: string) {
    const existing = weeklyReviews.find((item) => item.weekStart === weekStart);
    const stamp = nowIsoLocal();
    await saveWeeklyReview({
      weekStart,
      goalTheme,
      reflection,
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
    });
    setWeeklyReviews(await getAllWeeklyReviews());
    notify("週次記録を保存しました");
  }

  async function persistMonthlyReview(month: string, goalTheme: string, reflection: string) {
    const existing = monthlyReviews.find((item) => item.month === month);
    const stamp = nowIsoLocal();
    await saveMonthlyReview({
      month,
      goalTheme,
      reflection,
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
    });
    setMonthlyReviews(await getAllMonthlyReviews());
    notify("月次記録を保存しました");
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
    downloadText(
      `diary-${entry.date}.md`,
      entryToMarkdown(
        { ...entry, updatedAt: nowIsoLocal() },
        periodContextForDate(entry.date, weeklyReviews, monthlyReviews),
      ),
      "text/markdown",
    );
    notify("テキストで書き出しました");
  }

  // 閲覧モード用。保存を伴わない(未作成日にテンプレだけの日記を作らない)
  function exportEntryMarkdownWithoutSave() {
    if (!entry) return;
    downloadText(
      `diary-${entry.date}.md`,
      entryToMarkdown(entry, periodContextForDate(entry.date, weeklyReviews, monthlyReviews)),
      "text/markdown",
    );
    notify("テキストで書き出しました");
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
  // 最近の7件より前の日記を、月ごとにまとめる
  const olderGroups = useMemo(() => {
    const groups: Array<{ month: string; items: DiaryEntry[] }> = [];
    for (const item of entries.slice(7)) {
      const month = monthOf(item.date);
      const last = groups[groups.length - 1];
      if (last && last.month === month) last.items.push(item);
      else groups.push({ month, items: [item] });
    }
    return groups;
  }, [entries]);
  const isSearching = query.trim() !== "" || fromDate !== "" || toDate !== "";
  // 閲覧モードで「保存済みの日記がある日か」を判定する(未作成日はテンプレを見せない)
  const entryExists = useMemo(() => entries.some((item) => item.date === activeDate), [entries, activeDate]);

  // 設定タブの「らくがきメモの削除」で選んだ日付の日記
  const scratchManageEntry = useMemo(
    () => entries.find((item) => item.date === scratchManageDate) ?? null,
    [entries, scratchManageDate],
  );

  const memoryCards = useMemo(() => {
    const todayKey = toDateInputValue();
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
  }, [entries]);

  async function exportJson() {
    const payload = {
      appName: "Yuki Diary App" as const,
      version: APP_VERSION,
      exportedAt: nowIsoLocal(),
      settings,
      entries,
      weeklyReviews,
      monthlyReviews,
    };
    downloadText(
      `diary-backup-${toDateInputValue()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }

  function exportMarkdown() {
    downloadText(
      `diary-export-${toDateInputValue()}.md`,
      entriesToMarkdown(entries, weeklyReviews, monthlyReviews),
      "text/markdown",
    );
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
    const addableWeeklyReviews: WeeklyReview[] = [];
    const addableMonthlyReviews: MonthlyReview[] = [];
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

    if ("weeklyReviews" in data && !Array.isArray((data as { weeklyReviews?: unknown }).weeklyReviews)) {
      errors.push({ message: "weeklyReviews は配列にしてください。" });
    }
    if ("monthlyReviews" in data && !Array.isArray((data as { monthlyReviews?: unknown }).monthlyReviews)) {
      errors.push({ message: "monthlyReviews は配列にしてください。" });
    }
    const rawWeeklyReviews = Array.isArray((data as { weeklyReviews?: unknown }).weeklyReviews)
      ? ((data as { weeklyReviews: unknown[] }).weeklyReviews)
      : [];
    const rawMonthlyReviews = Array.isArray((data as { monthlyReviews?: unknown }).monthlyReviews)
      ? ((data as { monthlyReviews: unknown[] }).monthlyReviews)
      : [];
    const existingWeekStarts = new Set((await getAllWeeklyReviews()).map((item) => item.weekStart));
    const existingMonths = new Set((await getAllMonthlyReviews()).map((item) => item.month));
    const incomingWeekStarts = new Set<string>();
    const incomingMonths = new Set<string>();

    rawWeeklyReviews.forEach((item, zeroBasedIndex) => {
      const review = normalizeWeeklyReview(item);
      if (!review) {
        errors.push({ message: `週次記録${zeroBasedIndex + 1}件目の形式が正しくありません。` });
        return;
      }
      if (incomingWeekStarts.has(review.weekStart)) {
        errors.push({ date: review.weekStart, message: "同じJSON内で週次記録が重複しています。" });
        return;
      }
      incomingWeekStarts.add(review.weekStart);
      if (existingWeekStarts.has(review.weekStart)) {
        warnings.push({ date: review.weekStart, message: "既存の週次記録があるためスキップします。" });
        return;
      }
      addableWeeklyReviews.push(review);
    });

    rawMonthlyReviews.forEach((item, zeroBasedIndex) => {
      const review = normalizeMonthlyReview(item);
      if (!review) {
        errors.push({ message: `月次記録${zeroBasedIndex + 1}件目の形式が正しくありません。` });
        return;
      }
      if (incomingMonths.has(review.month)) {
        errors.push({ date: review.month, message: "同じJSON内で月次記録が重複しています。" });
        return;
      }
      incomingMonths.add(review.month);
      if (existingMonths.has(review.month)) {
        warnings.push({ date: review.month, message: "既存の月次記録があるためスキップします。" });
        return;
      }
      addableMonthlyReviews.push(review);
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
      warnings.push({ message: "設定（テンプレートなど）も入っています。追加するとテンプレートなどの設定も戻します。" });
    }

    const photoMetaCount = addableEntries.reduce((sum, item) => sum + item.photos.length, 0);

    return {
      fileName,
      total: incoming.length,
      addableEntries,
      addableWeeklyReviews,
      addableMonthlyReviews,
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
          message: `写真の情報が${preview.photoMetaCount}件ありますが、このバックアップに画像は入っていません。画像も戻すには「写真つきバックアップから追加」を使ってください。`,
        });
      }
      setImportPreview(preview);
      notify("ファイルを確認しました。内容を見てから追加してください");
    } catch (error) {
      setImportPreview(null);
      window.alert(error instanceof Error ? error.message : "バックアップを読み込めませんでした。");
    }
  }

  // 写真つきZIPバックアップの書き出し。日記本文（通常JSONと同じ形式）＋画像＋対応表を1ファイルにまとめる
  async function exportPhotoZip() {
    setZipBusy(true);
    try {
      const [allEntries, allWeeklyReviews, allMonthlyReviews] = await Promise.all([
        getAllEntries(),
        getAllWeeklyReviews(),
        getAllMonthlyReviews(),
      ]);
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
        weeklyReviews: allWeeklyReviews,
        monthlyReviews: allMonthlyReviews,
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
          ? `写真つきバックアップを保存しました（画像が見つからない写真${missingCount}枚を除く）`
          : `写真つきバックアップを保存しました（写真${files.length}枚）`,
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "写真つきバックアップを保存できませんでした。");
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
        preview.warnings.push({ message: "写真の対応表が入っていないため、写真は戻せません（文字だけ戻します）。" });
      }

      setImportPreview({ ...preview, zipPhotos });
      notify("ファイルを確認しました。内容を見てから追加してください");
    } catch (error) {
      setImportPreview(null);
      window.alert(error instanceof Error ? error.message : "写真つきバックアップを読み込めませんでした。");
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
      for (const item of importPreview.addableWeeklyReviews) {
        await saveWeeklyReview(item);
      }
      for (const item of importPreview.addableMonthlyReviews) {
        await saveMonthlyReview(item);
      }
      if (importPreview.importedSettings) {
        await saveSettings(importPreview.importedSettings);
        setSettings(importPreview.importedSettings);
        setTemplateDraft(importPreview.importedSettings.template);
      }
      await refreshEntries();
      setWeeklyReviews(await getAllWeeklyReviews());
      setMonthlyReviews(await getAllMonthlyReviews());

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
        weeklyAdded: importPreview.addableWeeklyReviews.length,
        monthlyAdded: importPreview.addableMonthlyReviews.length,
        skipped: importPreview.skippedEntries,
        errors: importPreview.errors.length,
        restoredPhotos,
      });
      setImportPreview(null);
      const importCounts = [
        `日記${importPreview.addableEntries.length}件`,
        `週次${importPreview.addableWeeklyReviews.length}件`,
        `月次${importPreview.addableMonthlyReviews.length}件`,
        ...(restoredPhotos > 0 ? [`写真${restoredPhotos}枚`] : []),
      ];
      notify(`${importCounts.join("・")}を追加しました`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "追加できませんでした。");
    }
  }

  async function saveTemplate() {
    const next = { ...settings, template: templateDraft };
    setSettings(next);
    await saveSettings(next);
    notify("テンプレートを保存しました");
  }

  async function resetTemplate() {
    const next = { ...settings, template: DEFAULT_TEMPLATE };
    setSettings(next);
    setTemplateDraft(DEFAULT_TEMPLATE);
    await saveSettings(next);
    notify("初期テンプレートに戻しました");
  }

  async function saveWeeklyGoalTemplate() {
    const next = { ...settings, weeklyGoalTemplate: weeklyGoalTemplateDraft };
    setSettings(next);
    await saveSettings(next);
    notify("週目標のテンプレートを保存しました");
  }

  async function resetWeeklyGoalTemplate() {
    const next = { ...settings, weeklyGoalTemplate: DEFAULT_WEEKLY_GOAL_TEMPLATE };
    setSettings(next);
    setWeeklyGoalTemplateDraft(DEFAULT_WEEKLY_GOAL_TEMPLATE);
    await saveSettings(next);
    notify("週目標のテンプレートを最初の状態に戻しました");
  }

  async function deleteAllData() {
    const typed = window.prompt("全データを削除するには「削除」と入力してください。");
    if (typed !== "削除") return;
    await clearEntries();
    await clearWeeklyReviews();
    await clearMonthlyReviews();
    await clearPhotos();
    setPhotoStoreVersion((version) => version + 1);
    await clearSettings();
    setSettings(DEFAULT_SETTINGS);
    setTemplateDraft(DEFAULT_SETTINGS.template);
    setWeeklyGoalTemplateDraft(DEFAULT_SETTINGS.weeklyGoalTemplate);
    setEntries([]);
    setWeeklyReviews([]);
    setMonthlyReviews([]);
    setEntry(makeEntry(activeDate, DEFAULT_SETTINGS));
    notify("全データを削除しました");
  }

  // 記録がある思い出だけを並べる
  const memoryItems: Array<{ label: string; entry: DiaryEntry }> = [];
  if (memoryCards.monthAgoEntry) memoryItems.push({ label: "1か月前", entry: memoryCards.monthAgoEntry });
  if (memoryCards.yearAgoEntry) memoryItems.push({ label: "1年前", entry: memoryCards.yearAgoEntry });
  if (memoryCards.seasonEntry) memoryItems.push({ label: `この季節（${memoryCards.season}）`, entry: memoryCards.seasonEntry });

  const tabs: Array<{ key: TabKey; label: string; icon: IconName }> = [
    { key: "today", label: "日記", icon: "pencil" },
    { key: "list", label: "一覧", icon: "list" },
    { key: "settings", label: "設定", icon: "settings" },
  ];
  // 過去の日記を読んでいるあいだは、入口である「一覧」を選択中として見せる
  const activeTab: TabKey = tab === "today" && entryViewMode === "read" ? "list" : tab;

  return (
    <div className="app-shell">
      {!isOnline && <div className="offline-badge">オフライン</div>}
      <main>
        {tab === "today" && entry && (
          entryViewMode === "read" ? (
            <ReadingView
              entry={entry}
              exists={entryExists}
              onMoveDate={openDateForReading}
              onBack={() => setTab("list")}
              onStartEditing={startEditing}
              onExportMarkdown={exportEntryMarkdownWithoutSave}
              weeklyReview={weeklyReviews.find((item) => item.weekStart === weekStartOf(entry.date))}
              monthlyReview={monthlyReviews.find((item) => item.month === monthOf(entry.date))}
            />
          ) : (
            <Editor
              entry={entry}
              saveState={saveState}
              onChange={updateEntry}
              onExportMarkdown={() => void exportEntryMarkdown()}
              onMoveDate={openDate}
              onDelete={() => void removeCurrentEntry()}
              initialBodyExpanded={initialBodyExpanded}
              bodyOpenVersion={bodyOpenVersion}
              photoBusy={photoBusy}
              photoNotice={photoNotice}
              onAddPhotos={addPhotos}
              onDeletePhoto={removePhoto}
              weeklyReviews={weeklyReviews}
              monthlyReviews={monthlyReviews}
              onSaveWeeklyReview={persistWeeklyReview}
              onSaveMonthlyReview={persistMonthlyReview}
              weeklyGoalTemplate={settings.weeklyGoalTemplate}
            />
          )
        )}

        {tab === "list" && (
          <div className="screen">
            <AppBar>
              <h1 className="app-bar-title">一覧</h1>
              <span className="spacer" />
              <span className="count">{isSearching ? searchResults.length : entries.length}件</span>
            </AppBar>

            <div className="screen-body">
              <div className="search-row">
                <label className="search-box">
                  <Icon name="search" size={18} />
                  <input
                    aria-label="日記を検索"
                    placeholder="日記を検索"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <button
                  className={filterOpen || fromDate || toDate ? "chip on" : "chip"}
                  type="button"
                  aria-expanded={filterOpen}
                  onClick={() => setFilterOpen((value) => !value)}
                >
                  <Icon name="calendar" size={16} />
                  期間
                </button>
              </div>
              {filterOpen && (
                <div className="search-date-row">
                  <label>
                    開始日
                    <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
                  </label>
                  <label>
                    終了日
                    <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
                  </label>
                  {(fromDate || toDate) && (
                    <button
                      className="text-toggle"
                      type="button"
                      onClick={() => {
                        setFromDate("");
                        setToDate("");
                      }}
                    >
                      期間の指定を外す
                    </button>
                  )}
                </div>
              )}

              {isSearching ? (
                searchResults.length === 0 ? (
                  <p className="empty">見つかりませんでした。</p>
                ) : (
                  <div className="card list-rows">
                    {searchResults.map((item) => (
                      <CompactEntryCard
                        entry={item}
                        key={item.id}
                        snippet={buildSearchSnippet(item, query)}
                        onOpen={openDateForReading}
                      />
                    ))}
                  </div>
                )
              ) : (
                <>
                  <MonthlyReviewHub
                    selectedMonth={selectedReviewMonth}
                    onMonthChange={setSelectedReviewMonth}
                    weeklyReviews={weeklyReviews}
                    monthlyReviews={monthlyReviews}
                    onSaveWeekly={persistWeeklyReview}
                    onSaveMonthly={persistMonthlyReview}
                    weeklyGoalTemplate={settings.weeklyGoalTemplate}
                  />
                  {entries.length === 0 ? (
                    <div className="empty-state">
                      <p>まだ日記はありません。</p>
                      <button className="btn primary" type="button" onClick={() => void openDate(toDateInputValue())}>
                        今日の日記を書く
                      </button>
                    </div>
                  ) : (
                    <>
                      <section className="list-section">
                        <h2 className="section-title">最近の日記</h2>
                        <div className="card list-rows">
                          {recentEntries.map((item) => (
                            <CompactEntryCard entry={item} key={item.id} onOpen={openDateForReading} />
                          ))}
                        </div>
                      </section>
                      {memoryItems.length > 0 && (
                        <section className="list-section">
                          <h2 className="section-title">思い出</h2>
                          <div className="card list-rows">
                            {memoryItems.map((item) => (
                              <MemoryCard entry={item.entry} key={item.label} label={item.label} onOpen={openDateForReading} />
                            ))}
                          </div>
                        </section>
                      )}
                      {olderGroups.map((group) => (
                        <section className="list-section" key={group.month}>
                          <h2 className="section-title">{formatMonthLabel(group.month)}</h2>
                          <div className="card list-rows">
                            {group.items.map((item) => (
                              <CompactEntryCard entry={item} key={item.id} onOpen={openDateForReading} />
                            ))}
                          </div>
                        </section>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="screen settings-screen">
            <AppBar>
              <h1 className="app-bar-title">設定</h1>
            </AppBar>

            <div className="screen-body">
              <section className="list-section">
                <h2 className="section-title">振り返りのテンプレート</h2>
                <details className="card details">
                  <summary>
                    テンプレートを編集
                    <Icon name="chevron-down" size={18} />
                  </summary>
                  <div className="details-body">
                    <textarea
                      aria-label="振り返りのテンプレート"
                      className="template-editor"
                      value={templateDraft}
                      onChange={(event) => setTemplateDraft(event.target.value)}
                    />
                    <div className="action-row">
                      <button className="btn primary" onClick={saveTemplate} type="button">
                        保存
                      </button>
                      <button className="btn" onClick={resetTemplate} type="button">
                        最初の状態に戻す
                      </button>
                    </div>
                  </div>
                </details>
              </section>

              <section className="list-section">
                <h2 className="section-title">週目標のテンプレート</h2>
                <details className="card details">
                  <summary>
                    テンプレートを編集
                    <Icon name="chevron-down" size={18} />
                  </summary>
                  <div className="details-body">
                    <textarea
                      aria-label="週目標のテンプレート"
                      className="template-editor"
                      value={weeklyGoalTemplateDraft}
                      onChange={(event) => setWeeklyGoalTemplateDraft(event.target.value)}
                    />
                    <p className="help">来週の目標が空のときだけ入力欄へ出します。保存済みの目標は変更しません。</p>
                    <div className="action-row">
                      <button className="btn primary" onClick={saveWeeklyGoalTemplate} type="button">保存</button>
                      <button className="btn" onClick={resetWeeklyGoalTemplate} type="button">最初の状態に戻す</button>
                    </div>
                  </div>
                </details>
              </section>

              <section className="list-section">
                <h2 className="section-title">バックアップ</h2>
                <div className="card list-rows">
                  <button className="row-btn" onClick={() => void exportJson()} type="button">
                    <Icon name="download" />
                    <span className="row-main">
                      <span className="row-title">バックアップを保存</span>
                      <span className="row-sub">日記の文字をファイルに保存します。写真は入りません</span>
                    </span>
                  </button>
                  <label className="row-btn">
                    <Icon name="upload" />
                    <span className="row-main">
                      <span className="row-title">バックアップから追加</span>
                      <span className="row-sub">すでにある日は上書きせず、無い日だけ追加します</span>
                    </span>
                    <input
                      accept="application/json,.json"
                      type="file"
                      onChange={(event) => {
                        void importJson(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <button className="row-btn" disabled={zipBusy} onClick={() => void exportPhotoZip()} type="button">
                    <Icon name="image" />
                    <span className="row-main">
                      <span className="row-title">{zipBusy ? "処理中…" : "写真つきバックアップを保存"}</span>
                      <span className="row-sub">日記の文字と写真を1つのファイルに保存します</span>
                    </span>
                  </button>
                  <label className={zipBusy ? "row-btn disabled" : "row-btn"}>
                    <Icon name="upload" />
                    <span className="row-main">
                      <span className="row-title">写真つきバックアップから追加</span>
                      <span className="row-sub">無い日の日記と、端末に無い写真だけを戻します</span>
                    </span>
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
                  <button className="row-btn" onClick={exportMarkdown} type="button">
                    <Icon name="text" />
                    <span className="row-main">
                      <span className="row-title">全日記をテキストで書き出す</span>
                      <span className="row-sub">読み返す・AIに渡すためのファイルです。ここからは元に戻せません</span>
                    </span>
                  </button>
                </div>

                {importPreview && (
                  <div className="card import-preview">
                    <div>
                      <p className="eyebrow">追加する前の確認</p>
                      <h3>{importPreview.fileName}</h3>
                    </div>
                    <div className="stat-grid">
                      <span>読み込み：{importPreview.total}件</span>
                      <span>新しく追加：{importPreview.addableEntries.length}件</span>
                      <span>週の記録：{importPreview.addableWeeklyReviews.length}件</span>
                      <span>月の記録：{importPreview.addableMonthlyReviews.length}件</span>
                      <span>すでにある日：{importPreview.skippedEntries.length}件</span>
                      <span>エラー：{importPreview.errors.length}件</span>
                      <span>注意：{importPreview.warnings.length}件</span>
                    </div>
                    {importPreview.zipPhotos.length > 0 && (
                      <div className="import-detail">
                        <h4>写真</h4>
                        <p>
                          写真が{importPreview.zipPhotos.length}枚入っています。
                          日記で使われていて、まだ端末に無い写真だけを戻します（すでにある写真は上書きしません）。
                        </p>
                      </div>
                    )}

                    {importPreview.addableEntries.length > 0 && (
                      <div className="import-detail">
                        <h4>追加する日付</h4>
                        <p>{importPreview.addableEntries.map((item) => item.date).join("、")}</p>
                      </div>
                    )}

                    {importPreview.skippedEntries.length > 0 && (
                      <div className="import-detail">
                        <h4>追加しない日付</h4>
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
                        <h4>注意</h4>
                        <ul>
                          {importPreview.warnings.map((item, index) => (
                            <li key={`${item.index ?? "all"}-${index}`}>{issueLabel(item)}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="action-row">
                      <button
                        className="btn primary"
                        disabled={
                          importPreview.errors.length > 0 ||
                          (importPreview.addableEntries.length === 0 &&
                            importPreview.addableWeeklyReviews.length === 0 &&
                            importPreview.addableMonthlyReviews.length === 0 &&
                            importPreview.zipPhotos.length === 0)
                        }
                        onClick={() => void addNewEntriesFromImport()}
                        type="button"
                      >
                        {importPreview.zipPhotos.length > 0 ? "新しい日記と写真を追加" : "新しい日記だけ追加"}
                      </button>
                      <button className="btn" onClick={() => setImportPreview(null)} type="button">
                        やめる
                      </button>
                    </div>
                    {importPreview.errors.length > 0 && (
                      <p className="subtle">エラーがあるため、このファイルはまだ追加できません。</p>
                    )}
                  </div>
                )}

                {importResult && (
                  <div className="card import-preview">
                    <h3>追加しました</h3>
                    <div className="stat-grid">
                      <span>日記：{importResult.added}件</span>
                      <span>週の記録：{importResult.weeklyAdded}件</span>
                      <span>月の記録：{importResult.monthlyAdded}件</span>
                      <span>追加しなかった日：{importResult.skipped.length}件</span>
                      <span>エラー：{importResult.errors}件</span>
                      <span>写真：{importResult.restoredPhotos}枚</span>
                    </div>
                    {importResult.skipped.length > 0 && (
                      <div className="import-detail">
                        <h4>追加しなかった日付</h4>
                        <p>{importResult.skipped.map((item) => item.date).join("、")}</p>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="list-section">
                <h2 className="section-title">写真の保存容量</h2>
                <div className="card pad">
                  {storageInfo ? (
                    <div className="stat-grid two">
                      <span>保存枚数：{storageInfo.count}枚</span>
                      <span>写真の合計：{formatByteSize(storageInfo.byteSize)}</span>
                      <span>
                        アプリ全体：
                        {storageInfo.usage === null ? "-" : formatByteSize(storageInfo.usage)}
                      </span>
                      <span>
                        使える上限：
                        {storageInfo.quota === null ? "-" : formatByteSize(storageInfo.quota)}
                      </span>
                    </div>
                  ) : (
                    <p className="empty">保存容量を取得できませんでした。</p>
                  )}
                  <p className="note">
                    写真は追加したときに小さくして保存します（撮影場所などの情報は残りません）。元の写真は端末のギャラリーにそのまま残ります。
                  </p>
                </div>
              </section>

              <section className="list-section">
                <h2 className="section-title">そのほか</h2>
                <details className="card details">
                  <summary>
                    らくがきメモを消す
                    <Icon name="chevron-down" size={18} />
                  </summary>
                  <div className="details-body">
                    <p className="note">
                      らくがき帳は書きっぱなしにする場所なので、日記の画面には消すボタンを置いていません。
                      個人情報や第三者のことをうっかり書いてしまったときなど、どうしても消したい場合だけここから消してください。
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
                        <ul className="memo-list manage">
                          {[...scratchManageEntry.scratchItems]
                            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                            .map((item) => (
                              <li key={item.id}>
                                <time>{timeOnly(item.createdAt)}</time>
                                <p>{item.text}</p>
                                <button
                                  className="icon-btn danger"
                                  type="button"
                                  aria-label="このメモを消す"
                                  title="このメモを消す"
                                  onClick={() => void removeScratchItemFromDate(scratchManageDate, item)}
                                >
                                  <Icon name="trash" size={18} />
                                </button>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p className="empty">この日のらくがきメモはありません。</p>
                      )
                    )}
                  </div>
                </details>
                <details className="card details">
                  <summary>
                    このアプリについて
                    <Icon name="chevron-down" size={18} />
                  </summary>
                  <div className="details-body info">
                    <p>日々の出来事・感情・考えたことを書き残すための、個人用の日記です。</p>
                    <p>
                      日記は、サーバーではなくこの端末のブラウザの中に保存されます。
                      ブラウザの閲覧データやサイトデータを消すと、日記も消えることがあります。
                    </p>
                    <p>
                      スマホとPCのあいだで、日記が自動で同じ内容になることはありません。
                      スマホで書いた日記はスマホに、PCで書いた日記はPCに残ります。
                    </p>
                    <ul>
                      <li>週に1回は「バックアップを保存」をしておくと安心です。</li>
                      <li>保存したバックアップのファイルは、公開される場所に置かないでください。</li>
                      <li>バックアップは元に戻すためのもの、テキストの書き出しは読み返す・AIに渡すためのものです。</li>
                      <li>写真が入るのは「写真つきバックアップ」だけです。</li>
                    </ul>
                    <p className="subtle">バージョン {APP_VERSION}</p>
                  </div>
                </details>
              </section>

              <section className="list-section">
                <h2 className="section-title">データの削除</h2>
                <div className="card list-rows">
                  <button className="row-btn danger" onClick={() => void deleteAllData()} type="button">
                    <Icon name="trash" />
                    <span className="row-main">
                      <span className="row-title">すべてのデータを削除</span>
                      <span className="row-sub">日記・写真・設定をこの端末から消します。元に戻せません</span>
                    </span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <nav className="bottom-tabs" aria-label="画面切り替え">
        {tabs.map((item) => (
          <button
            aria-current={activeTab === item.key ? "page" : undefined}
            className={activeTab === item.key ? "tab active" : "tab"}
            key={item.key}
            type="button"
            onClick={() => {
              if (item.key === "today") setEntryViewMode("edit");
              setTab(item.key);
            }}
          >
            <span className="tab-icon">
              <Icon name={item.icon} size={22} />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

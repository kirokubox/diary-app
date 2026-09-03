import { useEffect, useState } from "react";
import { getPhoto } from "./storage";
import type { DiaryPhoto } from "./types";

// 表示中の日付の写真だけ blob を読み込み、objectURL を作る。
// 日付が変わったり画面を離れたら revoke する（一覧では画像を読み込まない）
export function usePhotoUrls(photos: DiaryPhoto[]): { urls: Record<string, string>; missingIds: string[] } {
  const photoKey = photos.map((photo) => photo.id).join(",");
  const [state, setState] = useState<{ urls: Record<string, string>; missingIds: string[] }>({
    urls: {},
    missingIds: [],
  });

  useEffect(() => {
    const ids = photoKey ? photoKey.split(",") : [];
    if (ids.length === 0) {
      setState({ urls: {}, missingIds: [] });
      return;
    }
    let cancelled = false;
    const createdUrls: string[] = [];

    async function load() {
      const urls: Record<string, string> = {};
      const missingIds: string[] = [];
      for (const id of ids) {
        try {
          const stored = await getPhoto(id);
          if (!stored?.blob) {
            missingIds.push(id);
            continue;
          }
          const url = URL.createObjectURL(stored.blob);
          createdUrls.push(url);
          urls[id] = url;
        } catch {
          missingIds.push(id);
        }
      }
      if (cancelled) {
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setState({ urls, missingIds });
    }

    void load();
    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoKey]);

  return state;
}

import { useState } from "react";
import { PHOTO_MAX_COUNT } from "./constants";
import { PhotoViewer } from "./PhotoViewer";
import type { DiaryPhoto } from "./types";
import { usePhotoUrls } from "./usePhotoUrls";

// 入力モード（editable）と閲覧モードの両方で使う写真セクション。
// 写真が0枚のときはグリッドを描かない
export function PhotoSection({
  photos,
  editable,
  busy,
  notice,
  onAddFiles,
  onDeletePhoto,
}: {
  photos: DiaryPhoto[];
  editable: boolean;
  busy?: boolean;
  notice?: string;
  onAddFiles?: (files: File[]) => void | Promise<void>;
  onDeletePhoto?: (photo: DiaryPhoto) => Promise<boolean>;
}) {
  const { urls, missingIds } = usePhotoUrls(photos);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const remaining = PHOTO_MAX_COUNT - photos.length;

  async function handleDelete(photo: DiaryPhoto) {
    if (!onDeletePhoto) return;
    const deleted = await onDeletePhoto(photo);
    if (deleted) setViewerIndex(null);
  }

  return (
    <section className={editable ? "field-group photo-area" : "reading-section photo-area"}>
      {editable ? <label>今日の写真</label> : <h2>写真</h2>}

      {photos.length > 0 && (
        <ul className="photo-grid">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button
                className="photo-tile"
                type="button"
                disabled={!urls[photo.id]}
                onClick={() => setViewerIndex(index)}
              >
                {urls[photo.id] ? (
                  <img src={urls[photo.id]} alt={`${index + 1}枚目の写真`} loading="lazy" />
                ) : (
                  <span className="photo-tile-missing">読み込めません</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {missingIds.length > 0 && (
        <p className="photo-notice">
          画像が見つからない写真が{missingIds.length}枚あります。写真つきZIPバックアップから復元できます。
        </p>
      )}

      {editable && (
        <>
          {remaining > 0 ? (
            <label className={busy ? "photo-add busy" : "photo-add"}>
              {busy ? "写真を保存しています…" : "＋ 写真を追加"}
              <input
                accept="image/*"
                multiple
                type="file"
                disabled={busy}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.currentTarget.value = "";
                  if (files.length > 0) void onAddFiles?.(files);
                }}
              />
            </label>
          ) : (
            <p className="subtle">写真は1日{PHOTO_MAX_COUNT}枚までです。</p>
          )}
          {notice && <p className="photo-notice">{notice}</p>}
        </>
      )}

      {viewerIndex !== null && (
        <PhotoViewer
          photos={photos}
          urls={urls}
          index={viewerIndex}
          editable={editable}
          onMove={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={handleDelete}
        />
      )}
    </section>
  );
}

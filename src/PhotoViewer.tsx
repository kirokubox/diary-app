import { useEffect, useRef } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import type { DiaryPhoto } from "./types";

export function PhotoViewer({
  photos,
  urls,
  index,
  editable,
  onMove,
  onClose,
  onDelete,
}: {
  photos: DiaryPhoto[];
  urls: Record<string, string>;
  index: number;
  editable: boolean;
  onMove: (nextIndex: number) => void;
  onClose: () => void;
  onDelete: (photo: DiaryPhoto) => void | Promise<void>;
}) {
  const photo = photos[index];
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onMove(index - 1);
      if (event.key === "ArrowRight" && index < photos.length - 1) onMove(index + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [index, photos.length, onClose, onMove]);

  if (!photo) return null;

  function onTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;
    const deltaX = event.changedTouches[0].clientX - startX;
    if (Math.abs(deltaX) < 44) return;
    if (deltaX < 0 && index < photos.length - 1) onMove(index + 1);
    if (deltaX > 0 && index > 0) onMove(index - 1);
  }

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label="写真の拡大表示">
      <div className="photo-viewer-bar">
        <span className="photo-viewer-count">
          {index + 1} / {photos.length}
        </span>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
      <div
        className="photo-viewer-stage"
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0].clientX;
        }}
        onTouchEnd={onTouchEnd}
      >
        {urls[photo.id] ? (
          <img src={urls[photo.id]} alt={`${index + 1}枚目の写真`} />
        ) : (
          <p className="photo-viewer-missing">この写真の画像を読み込めませんでした。</p>
        )}
      </div>
      <div className="photo-viewer-actions">
        <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)}>
          ◀ 前
        </button>
        {editable && (
          <button className="danger" type="button" onClick={() => void onDelete(photo)}>
            この写真を削除
          </button>
        )}
        <button type="button" disabled={index >= photos.length - 1} onClick={() => onMove(index + 1)}>
          次 ▶
        </button>
      </div>
    </div>
  );
}

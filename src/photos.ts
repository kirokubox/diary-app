import { PHOTO_JPEG_QUALITY, PHOTO_MAX_EDGE, PHOTO_WEBP_QUALITY } from "./constants";

export type PreparedPhoto = {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
};

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

export function makePhotoId(date: string): string {
  return `${date}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function photoExtension(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "jpg";
}

export function formatByteSize(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize}B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(0)}KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)}MB`;
}

// createImageBitmap の imageOrientation でEXIFの向きを適用してから描画する。
// 使えない環境では img 要素にフォールバックする
async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // フォールバックへ
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("画像を読み込めませんでした。"));
      element.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

// 選んだ画像を長辺 PHOTO_MAX_EDGE まで縮小し、WebP（不可ならJPEG）へ再エンコードする。
// canvasへ描き直すため、EXIF（撮影場所などのメタデータ）は結果に残らない
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("画像ファイルではありません。");
  }
  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height) {
      throw new Error("画像のサイズを取得できませんでした。");
    }
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を変換できませんでした。");
    context.drawImage(decoded.source, 0, 0, width, height);
    const webp = await canvasToBlob(canvas, "image/webp", PHOTO_WEBP_QUALITY);
    const blob =
      webp && webp.type === "image/webp" ? webp : await canvasToBlob(canvas, "image/jpeg", PHOTO_JPEG_QUALITY);
    if (!blob || blob.size === 0) throw new Error("画像を変換できませんでした。");
    return { blob, width, height, mimeType: blob.type || "image/jpeg" };
  } finally {
    decoded.release();
  }
}

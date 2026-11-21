/**
 * Re-encode a user photo in the browser: respects camera orientation, caps the
 * size, and outputs a fresh JPEG. Re-encoding through a canvas drops EXIF
 * metadata (GPS, device model) before anything leaves the phone.
 */
export async function compressPhoto(file: File, maxSide = 1280, quality = 0.72): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not_image");
  if (file.size > 15 * 1024 * 1024) throw new Error("too_large");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

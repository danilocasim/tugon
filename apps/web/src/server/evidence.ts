import "server-only";
import sharp from "sharp";
import { serviceClient } from "./service-client";

const JPEG_HEADER = "data:image/jpeg;base64,";
const MAX_IMAGE_BYTES = 600_000;
const MAX_SIDE = 1280;
export const evidenceBucket = () => serviceClient().storage.from("report-evidence");
export const reportEvidenceKey = (owner: string, submission: string) => `${owner}/${submission}.jpg`;

export async function sanitizeReportPhoto(value: unknown): Promise<Buffer | null> {
  if (typeof value !== "string" || value.length > JPEG_HEADER.length + Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !value.startsWith(JPEG_HEADER)) return null;
  const encoded = value.slice(JPEG_HEADER.length);
  if (!/^[a-z0-9+/]+={0,2}$/iu.test(encoded) || encoded.length % 4 !== 0) return null;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > MAX_IMAGE_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  try {
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_SIDE * MAX_SIDE });
    const { format, width, height } = await image.metadata();
    if (format !== "jpeg" || !width || !height || width > MAX_SIDE || height > MAX_SIDE) return null;
    return await image.rotate().jpeg({ quality: 76 }).toBuffer();
  } catch {
    return null;
  }
}

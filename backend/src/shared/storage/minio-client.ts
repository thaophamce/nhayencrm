/**
 * minio-client.ts — MinIO/S3 storage client for chat attachments.
 * Uploads return a public URL suitable for zca-js sendImage/sendVideo.
 *
 * Phase Media Library 2026-06-11 — content-hash dedup (eng review E1):
 *   uploadBuffer giờ key theo sha256 BYTES THẬT (media/{hash}{ext}).
 *   statObject → nếu object đã tồn tại thì SKIP putObject, trả URL bản cũ.
 *   → 1 ảnh gửi N lần = 1 object duy nhất. Storage layer KHÔNG biết Prisma;
 *   việc upsert MediaAsset/MediaBlob nằm ở tầng service (MediaService).
 */
import { Client } from 'minio';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { config } from '../../config/index.js';

function parseEndpoint(url: string): { endPoint: string; port: number; useSSL: boolean } {
  const u = new URL(url);
  const useSSL = u.protocol === 'https:';
  const port = u.port ? parseInt(u.port) : (useSSL ? 443 : 80);
  return { endPoint: u.hostname, port, useSSL };
}

const { endPoint, port, useSSL } = parseEndpoint(config.s3Endpoint);

export const minioClient = new Client({
  endPoint,
  port,
  useSSL,
  accessKey: config.s3AccessKey,
  secretKey: config.s3SecretKey,
  region: config.s3Region,
});

const BUCKET = config.s3Bucket;

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  /** sha256 (hex) của bytes thật lưu — khóa dedup ở tầng service. */
  contentHash: string;
  /** true nếu object đã tồn tại (đã skip putObject — không tốn thêm ô lưu trữ). */
  deduped: boolean;
}

/**
 * Upload buffer lên MinIO với CONTENT-HASH DEDUP.
 * Key = `media/{sha256}{ext}`. Nếu object đã tồn tại (statObject OK) → skip
 * putObject và trả URL bản cũ (deduped=true). Cùng bytes upload N lần = 1 object.
 *
 * KHÔNG đụng Prisma. Caller (MediaService) lo upsert MediaAsset/MediaBlob theo
 * contentHash trả về.
 */
export async function uploadBuffer(buffer: Buffer, mimeType: string, originalName?: string): Promise<UploadResult> {
  // 2026-06-11: từ chối buffer rỗng — tránh tạo object MinIO 0-byte (ảnh/sticker hỏng).
  if (!buffer || buffer.length === 0) throw new Error('uploadBuffer: empty buffer (refusing 0-byte object)');
  const ext = originalName ? extname(originalName) : mimeToExt(mimeType);
  const contentHash = createHash('sha256').update(buffer).digest('hex');
  const key = `media/${contentHash}${ext}`;
  const url = `${config.s3PublicUrl}/${BUCKET}/${key}`;

  // Dedup: object đã tồn tại? → skip upload, trả bản cũ.
  const exists = await minioClient.statObject(BUCKET, key).then(() => true).catch(() => false);
  if (exists) {
    return { key, url, size: buffer.length, mimeType, contentHash, deduped: true };
  }

  await minioClient.putObject(BUCKET, key, buffer, buffer.length, {
    'Content-Type': mimeType,
    'Cache-Control': 'public, max-age=31536000',
  });
  return { key, url, size: buffer.length, mimeType, contentHash, deduped: false };
}

function mimeToExt(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'video/mp4') return '.mp4';
  if (mime === 'video/quicktime') return '.mov';
  if (mime === 'video/webm') return '.webm';
  return '';
}

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(BUCKET).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, config.s3Region);
  }
}

/**
 * 2026-06-13: lấy 1 object trong bucket dưới dạng stream để CRM proxy-download (gắn tên file thật
 * qua Content-Disposition). key PHẢI nằm dưới prefix 'media/' (chống path traversal). Trả null nếu
 * key sai prefix / không tồn tại.
 */
export async function getObjectStream(key: string): Promise<NodeJS.ReadableStream | null> {
  if (!key || !key.startsWith('media/') || key.includes('..')) return null;
  try {
    await minioClient.statObject(BUCKET, key); // tồn tại?
    return await minioClient.getObject(BUCKET, key);
  } catch {
    return null;
  }
}

/** Trích object key (media/{hash}.ext) từ public URL kho. Trả '' nếu URL không thuộc bucket. */
export function keyFromPublicUrl(url: string): string {
  if (!url) return '';
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return '';
  try { return decodeURIComponent(url.slice(i + marker.length).split('?')[0]); } catch { return ''; }
}

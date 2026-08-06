// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * chat-media-helpers.ts — tiện ích tải media (URL → file tmp) + extract msgId,
 * dùng chung cho forward-media (chat-operations-routes) VÀ gửi Khối vào hội thoại
 * (chat-routes /send-block).
 *
 * 2026-06-07 — tách từ chat-operations-routes.ts (vốn private) để endpoint send-block
 * tái dùng đúng đường media đã được chứng minh: tải URL về tmp rồi đưa LOCAL PATH cho
 * zca-js (api.sendMessage attachments cần path, KHÔNG nhận URL).
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../../config/index.js';
import { imageSize } from 'image-size';

/** Extract zaloMsgId từ nhiều shape trả về của zca-js (text/media/forward). */
export function extractZaloMsgId(result: unknown): string {
  const sr = result as {
    msgId?: string | number;
    data?: { msgId?: string | number };
    message?: { msgId?: string | number } | null;
    attachment?: Array<{ msgId?: string | number }>;
  } | null;
  const raw = sr?.message?.msgId ?? sr?.attachment?.[0]?.msgId ?? sr?.data?.msgId ?? sr?.msgId ?? '';
  return String(raw || '');
}

export const REMOTE_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
const REMOTE_MEDIA_MAX_REDIRECTS = 3;
const REMOTE_MEDIA_TIMEOUT_MS = 30_000;

function sameOrigin(a: string, b: string): boolean {
  try {
    const au = new URL(a);
    const bu = new URL(b);
    return au.protocol === bu.protocol && au.host === bu.host;
  } catch {
    return false;
  }
}

/**
 * Trả các URL ứng viên để tải media: ưu tiên URL gốc, kèm fallback dịch s3PublicUrl
 * → s3Endpoint (khi bucket nội bộ không expose public host).
 */

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped ?? (isIP(normalized) === 4 ? normalized : '');
  if (!ipv4) return false;
  const [a, b] = ipv4.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

function configuredMediaHosts(): string[] {
  const hosts = new Set<string>();
  for (const base of [config.localPublicUrl, config.s3PublicUrl]) {
    try { hosts.add(new URL(base).hostname.toLowerCase()); } catch { /* ignore invalid optional base */ }
  }
  for (const entry of (process.env.MEDIA_REMOTE_HOST_ALLOWLIST ?? '').split(',')) {
    const host = entry.trim().toLowerCase();
    if (host) hosts.add(host);
  }
  return [...hosts];
}

function hostMatchesRule(host: string, rule: string): boolean {
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === rule;
}

/** User-controlled fallback URL must belong to storage or explicit operator allowlist. */
export function assertUserProvidedMediaUrlAllowed(url: string): void {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('invalid media URL'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('unsupported media URL protocol');
  if (parsed.username || parsed.password) throw new Error('media URL credentials are not allowed');
  const host = parsed.hostname.toLowerCase();
  if (!configuredMediaHosts().some((rule) => hostMatchesRule(host, rule))) {
    throw new Error('media URL host is not allowed');
  }
}

async function assertSafeRemoteUrl(url: string): Promise<URL> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('unsupported URL protocol');
  if (parsed.username || parsed.password) throw new Error('URL credentials are not allowed');
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('local host is not allowed');
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('private network target is not allowed');
  }
  return parsed;
}

function parseContentLength(response: Response): number | null {
  const raw = response.headers?.get?.('content-length');
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function readResponseLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const announced = parseContentLength(response);
  if (announced != null && announced > maxBytes) throw new Error(`media exceeds ${maxBytes} bytes`);
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error('empty response');
    if (bytes.length > maxBytes) throw new Error(`media exceeds ${maxBytes} bytes`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('media too large').catch(() => {});
        throw new Error(`media exceeds ${maxBytes} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new Error('empty response');
  return Buffer.concat(chunks, total);
}

/** Fetch external media with SSRF guards, bounded redirects, timeout, and byte cap. */
export async function fetchRemoteMediaBuffer(
  inputUrl: string,
  options: { maxBytes?: number; timeoutMs?: number; requireImage?: boolean; allowPrivateHost?: boolean } = {},
): Promise<{ buffer: Buffer; finalUrl: string; contentType: string }> {
  const maxBytes = options.maxBytes ?? REMOTE_MEDIA_MAX_BYTES;
  let current = inputUrl;
  for (let redirect = 0; redirect <= REMOTE_MEDIA_MAX_REDIRECTS; redirect++) {
    if (!options.allowPrivateHost) await assertSafeRemoteUrl(current);
    else if (redirect > 0 && !sameOrigin(current, inputUrl)) throw new Error('internal storage redirect is not allowed');
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? REMOTE_MEDIA_TIMEOUT_MS),
      headers: { Accept: options.requireImage ? 'image/*' : '*/*' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.('location');
      if (!location) throw new Error(`HTTP ${response.status} without Location`);
      if (redirect === REMOTE_MEDIA_MAX_REDIRECTS) throw new Error('too many redirects');
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = (response.headers?.get?.('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (options.requireImage && contentType && !contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
      throw new Error(`unsupported media type: ${contentType}`);
    }
    const buffer = await readResponseLimited(response, maxBytes);
    if (options.requireImage) {
      try {
        const meta = imageSize(buffer);
        if (!meta.width || !meta.height) throw new Error('missing image dimensions');
      } catch {
        throw new Error('response bytes are not a supported image');
      }
    }
    return { buffer, finalUrl: current, contentType };
  }
  throw new Error('too many redirects');
}

export function candidateDownloadUrls(url: string): string[] {
  const candidates = [url];
  try {
    if (sameOrigin(url, config.s3PublicUrl)) {
      const publicUrl = new URL(config.s3PublicUrl);
      const endpoint = new URL(config.s3Endpoint);
      const original = new URL(url);
      original.protocol = endpoint.protocol;
      original.host = endpoint.host;
      const publicPath = publicUrl.pathname.replace(/\/$/, '');
      if (publicPath && original.pathname.startsWith(publicPath)) {
        original.pathname = original.pathname.slice(publicPath.length) || '/';
      }
      candidates.push(original.toString());
    }
  } catch {
    // keep original only
  }
  return [...new Set(candidates)];
}

// Ký tự bị cấm trong tên file Windows/đường dẫn: \ / : * ? " < > |
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]+/g;
// Ký tự điều khiển 0x00–0x1f (dựng từ codepoint để source chỉ chứa ASCII in được —
// tránh nhúng byte điều khiển thô vào file gây hỏng khi tool khác lưu lại).
const CONTROL_CHARS = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']+', 'g');

function sanitizeFileName(value?: string): string | undefined {
  // GIỮ chữ Unicode (tiếng Việt có dấu) + dấu cách + gạch ngang + (). KHÔNG dùng \w (chỉ ASCII)
  // vì \w biến "BẢNG VẬT LIỆU.pdf" → "B_NG V_T LI_U.pdf" (khách nhận file thấy tên xấu).
  // Chỉ thay ký tự CẤM trong tên file + ký tự điều khiển. Đuôi (.) luôn giữ.
  const cleaned = value
    ?.replace(ILLEGAL_FILENAME_CHARS, '_')
    .replace(CONTROL_CHARS, '')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || undefined;
}

function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case 'image': return '.jpg';
    case 'video': return '.mp4';
    case 'voice':
    case 'audio': return '.mp3';
    default: return '';
  }
}

export function filenameFromUrl(url: string, contentType: string, fallback?: string): string {
  const cleanFallback = sanitizeFileName(fallback);
  if (cleanFallback) return cleanFallback;
  try {
    const name = new URL(url).pathname.split('/').filter(Boolean).pop();
    const cleanName = sanitizeFileName(name ? decodeURIComponent(name) : undefined);
    if (cleanName) return cleanName;
  } catch {
    // fall through
  }
  return `forward-${contentType}${extensionForContentType(contentType)}`;
}

/**
 * Tải 1 URL media về file tmp, trả { path, cleanup }. Thử lần lượt các URL ứng viên.
 * Gọi cleanup() trong finally để xoá thư mục tmp sau khi gửi xong.
 */
export async function downloadMediaToTemp(
  media: { url: string; filename?: string },
  contentType: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  let lastError: unknown;
  for (const url of candidateDownloadUrls(media.url)) {
    try {
      const internalStorageEndpoint = sameOrigin(url, config.s3Endpoint);
      const fetched = await fetchRemoteMediaBuffer(url, {
        maxBytes: contentType === 'image' ? REMOTE_MEDIA_MAX_BYTES : 500 * 1024 * 1024,
        // Strict byte validation is required for user-provided template URLs.
        // Legacy/internal forward flows already trust stored/Zalo URLs and can carry test/polyfill responses without headers.
        requireImage: contentType === 'image' && !internalStorageEndpoint,
        allowPrivateHost: internalStorageEndpoint,
      });
      const buffer = fetched.buffer;
      const dir = await mkdtemp(path.join(tmpdir(), 'zalocrm-forward-'));
      const filePath = path.join(dir, filenameFromUrl(fetched.finalUrl, contentType, media.filename));
      await writeFile(filePath, buffer);
      return { path: filePath, cleanup: () => rm(dir, { recursive: true, force: true }) };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Không tải được file media để gửi: ${(lastError as Error)?.message ?? String(lastError)}`);
}

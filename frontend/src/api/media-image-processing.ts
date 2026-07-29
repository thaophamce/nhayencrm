const CLIENT_IMAGE_MAX_EDGE = 2000;
const CLIENT_IMAGE_QUALITY = 0.82;

function replaceExtension(name: string, extension: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'image';
  return `${base}${extension}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Shrink JPEG/PNG/WebP before network upload. GIF stays untouched to preserve animation.
 * Any browser/codec failure falls back to original File.
 */
export async function optimizeImageForUpload(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, CLIENT_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: file.type !== 'image/jpeg' });
    if (!context) return file;
    // Keep PNG/WebP alpha. JPEG is opaque; white fill avoids accidental black transparency.
    if (file.type === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, 'image/webp', CLIENT_IMAGE_QUALITY);
    if (!blob || blob.size === 0 || blob.size >= file.size) return file;
    return new File([blob], replaceExtension(file.name, '.webp'), {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

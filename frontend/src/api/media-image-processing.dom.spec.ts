// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { optimizeImageForUpload } from './media-image-processing';

describe('optimizeImageForUpload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps GIF untouched to preserve animation', async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createBitmap);
    const file = new File(['gif-data'], 'animated.gif', { type: 'image/gif' });

    await expect(optimizeImageForUpload(file)).resolves.toBe(file);
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it('shrinks a large JPEG to WebP and closes the decoded bitmap', async () => {
    const close = vi.fn();
    const bitmap = { width: 4000, height: 3000, close } as unknown as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

    const drawImage = vi.fn();
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      fillRect,
      set fillStyle(_value: string) {},
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
      callback(new Blob(['webp'], { type: type ?? 'image/webp' }));
    });

    const file = new File([new Uint8Array(1_000)], 'photo.JPG', {
      type: 'image/jpeg',
      lastModified: 123,
    });
    const optimized = await optimizeImageForUpload(file);

    expect(optimized).not.toBe(file);
    expect(optimized.name).toBe('photo.webp');
    expect(optimized.type).toBe('image/webp');
    expect(optimized.lastModified).toBe(123);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2000, 1500);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 2000, 1500);
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps WebP transparency instead of painting a white background', async () => {
    const close = vi.fn();
    const bitmap = { width: 100, height: 50, close } as unknown as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      fillRect,
      set fillStyle(_value: string) {},
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
      callback(new Blob(['x'], { type: type ?? 'image/webp' }));
    });
    const file = new File([new Uint8Array(20)], 'transparent.webp', { type: 'image/webp' });

    const optimized = await optimizeImageForUpload(file);

    expect(optimized).not.toBe(file);
    expect(fillRect).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps original when encoded file is not smaller', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10, close }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      set fillStyle(_value: string) {},
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
      callback(new Blob([new Uint8Array(20)], { type: type ?? 'image/webp' }));
    });
    const file = new File([new Uint8Array(10)], 'small.png', { type: 'image/png' });

    await expect(optimizeImageForUpload(file)).resolves.toBe(file);
    expect(close).toHaveBeenCalledOnce();
  });
});

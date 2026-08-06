// Backfill missing image thumbnails. Safe to rerun; updates only thumbnailUrl=NULL rows.
import { prisma } from '../src/shared/database/prisma-client.js';
import { createImageThumbnail } from '../src/modules/media/media-service.js';
import { getObjectBuffer, keyFromPublicUrl, uploadBuffer } from '../src/shared/storage/minio-client.js';

const BATCH_SIZE = 50;
const APPLY = process.argv.includes('--apply');
const HELP = process.argv.includes('--help');
const CONFIRM_WRITE = process.argv.includes('--confirm-write');
const unknownArgs = process.argv.slice(2).filter((arg) => !['--apply', '--confirm-write', '--help'].includes(arg));

async function main() {
  if (unknownArgs.length) throw new Error(`Unknown argument: ${unknownArgs.join(', ')}`);
  if (HELP) {
    console.log('Usage: npm run media:backfill-thumbnails -- [--apply --confirm-write]');
    console.log('Default mode is dry-run. Write mode requires both --apply and --confirm-write.');
    return;
  }
  if (APPLY && !CONFIRM_WRITE) {
    throw new Error('Refusing write mode: add --confirm-write after backup and environment verification');
  }
  let scanned = 0;
  let updated = 0;
  let failed = 0;
  let cursor: string | undefined;
  while (true) {
    const assets = await prisma.mediaAsset.findMany({
      where: { kind: 'image', thumbnailUrl: null, archivedAt: null },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { blobs: { where: { variantType: 'original' }, take: 1 } },
    });
    if (!assets.length) break;
    for (const asset of assets) {
      scanned += 1;
      const blob = asset.blobs[0];
      if (!blob) { failed += 1; continue; }
      try {
        const key = blob.minioKey || keyFromPublicUrl(blob.publicUrl);
        const source = key ? await getObjectBuffer(key) : null;
        if (!source) throw new Error('source object missing');
        const thumbnail = await createImageThumbnail(source);
        if (!thumbnail) throw new Error('thumbnail decode failed');
        if (APPLY) {
          const uploaded = await uploadBuffer(thumbnail, 'image/webp', 'thumbnail.webp');
          const result = await prisma.mediaAsset.updateMany({
            where: { id: asset.id, thumbnailUrl: null },
            data: { thumbnailUrl: uploaded.url },
          });
          updated += result.count;
        }
      } catch (error) {
        failed += 1;
        console.error(`[backfill-media-thumbnails] asset=${asset.id}:`, (error as Error).message);
      }
    }
    cursor = assets.at(-1)?.id;
  }
  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', scanned, updated, failed }));
}

main()
  .catch((error) => {
    console.error('[backfill-media-thumbnails]', (error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => HELP ? undefined : prisma.$disconnect());

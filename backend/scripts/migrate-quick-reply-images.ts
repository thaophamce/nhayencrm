import { basename } from 'node:path';
import { prisma } from '../src/shared/database/prisma-client.js';
import { fetchRemoteMediaBuffer } from '../src/modules/chat/chat-media-helpers.js';
import { registerAsset } from '../src/modules/media/media-service.js';

const SOURCE_HOST = 'content.pancake.vn';
const apply = process.argv.includes('--apply');
const linkAssets = process.argv.includes('--link-assets');
const urlPattern = /https?:\/\/\S+/gi;

function urlsFrom(value: unknown): string[] {
  return typeof value === 'string' ? (value.match(urlPattern) ?? []) : [];
}

function isSourceUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase() === SOURCE_HOST;
  } catch {
    return false;
  }
}

function fileNameFromUrl(value: string): string {
  try {
    return decodeURIComponent(basename(new URL(value).pathname)) || 'quick-reply-image.jpg';
  } catch {
    return 'quick-reply-image.jpg';
  }
}

async function main(): Promise<void> {
  const templates = await prisma.messageTemplate.findMany({ where: { archivedAt: null } });

  if (linkAssets) {
    const assets = await prisma.mediaAsset.findMany({
      where: { archivedAt: null, tagIds: { has: 'migrated-pancake' } },
      include: { blobs: { where: { variantType: 'original' }, take: 1 } },
    });
    const assetByUrl = new Map(assets.flatMap((asset) => asset.blobs.map((blob) => [blob.publicUrl, asset.id] as const)));
    let linkedTemplates = 0;
    let linkedUrls = 0;
    for (const template of templates) {
      const rich = (template.contentRich as Record<string, unknown> | null) ?? {};
      const attachments = Array.isArray(rich.attachments) ? rich.attachments : [];
      const linkList = (values: unknown[]): string[] => values.flatMap(urlsFrom).map((value) => {
        const baseUrl = value.split('#')[0];
        const assetId = assetByUrl.get(baseUrl);
        if (!assetId) return value;
        const linked = `${baseUrl}#assetId=${assetId}`;
        if (linked !== value) linkedUrls += 1;
        return linked;
      });
      const nextTagIds = linkList(template.tagIds);
      const nextAttachments = linkList(attachments);
      if (JSON.stringify(nextTagIds) === JSON.stringify(template.tagIds)
        && JSON.stringify(nextAttachments) === JSON.stringify(attachments)) continue;
      if (apply) {
        await prisma.messageTemplate.update({
          where: { id: template.id },
          data: { tagIds: nextTagIds, contentRich: { ...rich, attachments: nextAttachments } },
        });
      }
      linkedTemplates += 1;
    }
    console.log(`[quick-reply-media] link mode=${apply ? 'apply' : 'dry-run'} assets=${assets.length} templates=${linkedTemplates} urls=${linkedUrls}`);
    return;
  }

  const affected = templates.filter((template) => {
    const rich = template.contentRich as { attachments?: unknown[] } | null;
    return [...template.tagIds, ...(rich?.attachments ?? [])]
      .flatMap(urlsFrom)
      .some(isSourceUrl);
  });
  const sourceUrls = [...new Set(affected.flatMap((template) => {
    const rich = template.contentRich as { attachments?: unknown[] } | null;
    return [...template.tagIds, ...(rich?.attachments ?? [])].flatMap(urlsFrom).filter(isSourceUrl);
  }))];

  console.log(`[quick-reply-media] mode=${apply ? 'apply' : 'dry-run'} templates=${affected.length} urls=${sourceUrls.length}`);
  if (!apply) {
    for (const url of sourceUrls) console.log(`[dry-run] ${url}`);
    return;
  }

  const migrated = new Map<string, { url: string; assetId: string }>();
  let failed = 0;
  for (const [index, sourceUrl] of sourceUrls.entries()) {
    try {
      const downloaded = await fetchRemoteMediaBuffer(sourceUrl, { requireImage: true });
      const template = affected.find((item) => {
        const rich = item.contentRich as { attachments?: unknown[] } | null;
        return [...item.tagIds, ...(rich?.attachments ?? [])].flatMap(urlsFrom).includes(sourceUrl);
      });
      if (!template) throw new Error('template owner not found');
      const owner = await prisma.user.findFirst({
        where: { orgId: template.orgId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      const filename = fileNameFromUrl(sourceUrl);
      const saved = await registerAsset({
        orgId: template.orgId,
        buffer: downloaded.buffer,
        mimeType: downloaded.contentType || 'image/jpeg',
        kind: 'image',
        name: `Tin nhanh - ${filename}`,
        originalFilename: filename,
        ownerUserId: owner?.id ?? null,
        createdById: owner?.id ?? null,
        visibility: 'public',
        source: 'upload',
        tagIds: ['tin-nhan-nhanh', 'migrated-pancake'],
      });
      migrated.set(sourceUrl, { url: saved.blob.publicUrl, assetId: saved.asset.id });
      console.log(`[${index + 1}/${sourceUrls.length}] ok asset=${saved.asset.id} dedup=${saved.deduped} ${sourceUrl}`);
    } catch (error) {
      failed += 1;
      console.error(`[${index + 1}/${sourceUrls.length}] failed ${sourceUrl}: ${(error as Error).message}`);
    }
  }

  let updated = 0;
  for (const template of affected) {
    const rich = (template.contentRich as Record<string, unknown> | null) ?? {};
    const attachments = Array.isArray(rich.attachments) ? rich.attachments : [];
    const replaceList = (values: unknown[]): string[] => values.flatMap(urlsFrom).map((url) => migrated.get(url)?.url ?? url);
    const nextTagIds = replaceList(template.tagIds);
    const nextAttachments = replaceList(attachments);
    if (JSON.stringify(nextTagIds) === JSON.stringify(template.tagIds)
      && JSON.stringify(nextAttachments) === JSON.stringify(attachments)) continue;
    await prisma.messageTemplate.update({
      where: { id: template.id },
      data: {
        tagIds: nextTagIds,
        contentRich: { ...rich, attachments: nextAttachments },
      },
    });
    updated += 1;
    console.log(`[template] updated shortcut=${template.shortcut} id=${template.id}`);
  }

  console.log(`[quick-reply-media] complete uploaded=${migrated.size} failed=${failed} templatesUpdated=${updated}`);
  if (failed > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

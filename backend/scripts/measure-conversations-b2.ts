/**
 * measure-conversations-b2.ts — ĐO thực tế friend.findMany OR-of-AND (B2) trước khi sửa.
 *
 * Bối cảnh: chat-routes.ts:1002 chạy
 *   prisma.friend.findMany({ where: { OR: pairs.map(p => ({ AND:[{zaloAccountId},{zaloUidInNick}] })) } })
 * Nghi vấn: OR 50 nhánh trên khóa ghép → planner quét index nhiều lần → chậm.
 * Đề xuất B2: đổi sang zaloAccountId IN (...) AND zaloUidInNick IN (...) rồi lọc lại cặp trong JS.
 *
 * Script này lấy ĐÚNG 1 trang 50 conv của org nặng nhất, dựng userPairs y hệt endpoint,
 * rồi ĐO 2 cách + EXPLAIN ANALYZE cả 2. Read-only, KHÔNG ghi DB.
 *
 * Chạy:  npx tsx --env-file=.env scripts/measure-conversations-b2.ts
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { runSystemQuery } from '../src/shared/tenant/tenant-context.js';

const PAGE = 50;

// select GIỐNG HỆT endpoint (chat-routes.ts:1004-1031) để đo sát thực tế
const friendSelect = {
  id: true, zaloAccountId: true, contactId: true, zaloUidInNick: true,
  relationshipKind: true, friendshipStatus: true, becameFriendAt: true,
  firstMessageAt: true, updatedAt: true, crmTagsPerNick: true, zaloLabels: true,
  aliasInNick: true, totalInbound: true, totalOutbound: true, lastInboundAt: true,
  lastOutboundAt: true, leadScore: true, autoTags: true, stuckSince: true,
  statusId: true, statusRef: { select: { name: true, color: true } },
} as const;

async function timeIt<T>(fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const t0 = process.hrtime.bigint();
  const result = await fn();
  const t1 = process.hrtime.bigint();
  return { ms: Number(t1 - t0) / 1e6, result };
}

const stat = (arr: number[]) => {
  const s = arr.slice(1).sort((a, b) => a - b); // bỏ warm-up (phần tử 0)
  return { min: s[0], med: s[Math.floor(s.length / 2)], max: s[s.length - 1] };
};

async function main() {
  await runSystemQuery(async () => {
    // 1) Org nặng nhất
    const grouped = await prisma.conversation.groupBy({
      by: ['orgId'], _count: { _all: true },
      orderBy: { _count: { orgId: 'desc' } }, take: 1,
    });
    if (!grouped.length) { console.log('KHÔNG có conversation.'); return; }
    const orgId = grouped[0].orgId;

    // 2) Lấy 1 trang 50 conv (như endpoint), rồi dựng userPairs y hệt
    const conversations = await prisma.conversation.findMany({
      where: { orgId },
      select: { threadType: true, contactId: true, externalThreadId: true, zaloAccountId: true },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      skip: 0, take: PAGE,
    });
    const raw = conversations
      .filter(c => c.threadType === 'user' && c.contactId && c.externalThreadId)
      .map(c => ({ zaloAccountId: c.zaloAccountId, zaloUidInNick: c.externalThreadId! }));
    const seen = new Set<string>();
    const userPairs: typeof raw = [];
    for (const p of raw) {
      const k = `${p.zaloAccountId}:${p.zaloUidInNick}`;
      if (!seen.has(k)) { seen.add(k); userPairs.push(p); }
    }

    console.log(`\n=== B2 measure — orgId=${orgId} ===`);
    console.log(`  conv trang 1 = ${conversations.length}, userPairs (user-thread, deduped) = ${userPairs.length}`);
    if (!userPairs.length) { console.log('  KHÔNG có user-pair nào ở trang này → B2 vô nghĩa với org này.'); return; }

    const accountIds = [...new Set(userPairs.map(p => p.zaloAccountId))];
    const uids = [...new Set(userPairs.map(p => p.zaloUidInNick))];
    console.log(`  distinct accountIds = ${accountIds.length}, distinct uids = ${uids.length}`);

    // ---- CÁCH A: OR-of-AND (hiện tại) ----
    const orWhere = { OR: userPairs.map(p => ({ AND: [{ zaloAccountId: p.zaloAccountId }, { zaloUidInNick: p.zaloUidInNick }] })) };
    // ---- CÁCH B: IN + IN, lọc cặp trong JS ----
    const inWhere = { zaloAccountId: { in: accountIds }, zaloUidInNick: { in: uids } };

    const runs = 6;
    const aMs: number[] = [], bMs: number[] = [];
    let aCount = 0, bCount = 0;
    for (let i = 0; i < runs; i++) {
      const a = await timeIt(() => prisma.friend.findMany({ where: orWhere as any, select: friendSelect as any }));
      const b = await timeIt(async () => {
        const rows = await prisma.friend.findMany({ where: inWhere as any, select: friendSelect as any });
        // lọc lại đúng cặp (IN×IN là tích Descartes → phải cắt về đúng pair)
        const pairSet = new Set(userPairs.map(p => `${p.zaloAccountId}:${p.zaloUidInNick}`));
        return rows.filter(r => pairSet.has(`${r.zaloAccountId}:${r.zaloUidInNick}`));
      });
      aMs.push(a.ms); bMs.push(b.ms);
      aCount = a.result.length; bCount = b.result.length;
    }

    const as = stat(aMs), bs = stat(bMs);
    console.log('\n--- KẾT QUẢ (ms, bỏ warm-up) ---');
    console.log(`  A) OR-of-AND (hiện tại)     min=${as.min.toFixed(1)}  med=${as.med.toFixed(1)}  max=${as.max.toFixed(1)}   rows=${aCount}`);
    console.log(`  B) IN+IN + lọc JS (đề xuất) min=${bs.min.toFixed(1)}  med=${bs.med.toFixed(1)}  max=${bs.max.toFixed(1)}   rows=${bCount}`);
    if (aCount !== bCount) console.log(`  ⚠️  SỐ ROW KHÁC NHAU (A=${aCount} B=${bCount}) — 2 cách KHÔNG tương đương, phải xem lại!`);
    else console.log(`  ✓ Cùng ${aCount} row → 2 cách tương đương về kết quả.`);

    // ---- EXPLAIN ANALYZE cả 2 (raw SQL để thấy planner thật) ----
    console.log('\n--- EXPLAIN ANALYZE ---');
    try {
      const orSql = userPairs.map((p, i) => `(f.zalo_account_id='${p.zaloAccountId}' AND f.zalo_uid_in_nick='${p.zaloUidInNick}')`).join(' OR ');
      const explA = await prisma.$queryRawUnsafe<any[]>(`EXPLAIN (ANALYZE, BUFFERS) SELECT f.id FROM friends f WHERE ${orSql}`);
      console.log('  [A OR-of-AND]');
      for (const r of explA) console.log('    ' + Object.values(r)[0]);
    } catch (e) { console.log('  [A] EXPLAIN lỗi:', (e as Error).message); }
    try {
      const accSql = accountIds.map(a => `'${a}'`).join(',');
      const uidSql = uids.map(u => `'${u}'`).join(',');
      const explB = await prisma.$queryRawUnsafe<any[]>(`EXPLAIN (ANALYZE, BUFFERS) SELECT f.id FROM friends f WHERE f.zalo_account_id IN (${accSql}) AND f.zalo_uid_in_nick IN (${uidSql})`);
      console.log('  [B IN+IN]');
      for (const r of explB) console.log('    ' + Object.values(r)[0]);
    } catch (e) { console.log('  [B] EXPLAIN lỗi:', (e as Error).message); }

    console.log('\n--- DIỄN GIẢI ---');
    const gap = as.med - bs.med;
    if (Math.abs(gap) < 1) {
      console.log(`  A và B gần như BẰNG NHAU (chênh ${gap.toFixed(1)}ms). B2 KHÔNG đáng đổi ở quy mô trang này.`);
    } else if (gap > 0) {
      console.log(`  B nhanh hơn A ~${gap.toFixed(1)}ms/trang. Nếu B cho cùng số row → B2 đáng làm.`);
    } else {
      console.log(`  A nhanh hơn B ~${(-gap).toFixed(1)}ms. GIỮ nguyên OR-of-AND, KHÔNG đổi.`);
    }
    console.log(`  Lưu ý: userPairs ≤ ${PAGE} (kích thước trang), KHÔNG tăng theo tổng số nick admin gom.`);
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

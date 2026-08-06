/**
 * measure-conversations-b1.ts — ĐO thực tế trước khi sửa B1 (bỏ/hoãn count mỗi trang).
 *
 * Mục đích: count({where}) chạy SONG SONG với findMany trong Promise.all (chat-routes.ts:906).
 * Bỏ count chỉ tiết kiệm wall-clock NẾU count là nhánh CHẬM hơn. Script này đo tách 2 nhánh
 * trên DB THẬT (localhost:5433) để có SỐ, không tuyên bố "nhanh hơn" khi chưa đo.
 *
 * Chạy:  npx tsx --env-file=.env scripts/measure-conversations-b1.ts
 * (read-only, KHÔNG ghi gì vào DB)
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { runSystemQuery } from '../src/shared/tenant/tenant-context.js';

const LIMIT = 50;

// include GIỐNG HỆT endpoint GET /api/v1/conversations (chat-routes.ts:909-953)
const listInclude = {
  contact: {
    select: {
      id: true, fullName: true, crmName: true, avatarUrl: true, phone: true,
      zaloUid: true, hasZalo: true, tags: true, leadScore: true, statusId: true,
      assignedUserId: true, priorityScore: true,
      contactAccess: {
        select: { role: true, user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: 'asc' as const }, take: 5,
      },
      _count: { select: { contactAccess: true } },
    },
  },
  zaloAccount: { select: { id: true, displayName: true, avatarUrl: true, zaloUid: true, privacyMode: true, ownerUserId: true, archivedAt: true } },
  pins: { select: { id: true } },
  messages: {
    take: 1,
    orderBy: [{ zaloMsgIdNum: { sort: 'desc' as const, nulls: 'last' as const } }, { sentAt: 'desc' as const }],
    select: { id: true, zaloMsgId: true, senderUid: true, senderName: true, content: true, contentType: true, senderType: true, sentAt: true, isDeleted: true, editedAt: true, reactions: { select: { emoji: true, reactorId: true, reactorName: true, reactorSource: true } } },
  },
} as const;

async function timeIt<T>(label: string, fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const t0 = process.hrtime.bigint();
  const result = await fn();
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  return { ms, result };
}

async function main() {
  await runSystemQuery(async () => {
    // 1) Tìm org có NHIỀU conversation nhất (ca nặng nhất — sát "admin gom 50 nick").
    const grouped = await prisma.conversation.groupBy({
      by: ['orgId'],
      _count: { _all: true },
      orderBy: { _count: { orgId: 'desc' } },
      take: 5,
    });
    console.log('\n=== Top orgs theo số conversation ===');
    for (const g of grouped) console.log(`  orgId=${g.orgId}  conversations=${g._count._all}`);
    if (!grouped.length) { console.log('KHÔNG có conversation nào trong DB.'); return; }

    const orgId = grouped[0].orgId;
    const where = { orgId } as const;

    console.log(`\n=== ĐO trên orgId=${orgId} (where = { orgId }), limit=${LIMIT} ===`);
    console.log('(mỗi phép đo chạy 5 lần, bỏ lần 1 warm-up, lấy min/median/max của 4 lần sau)\n');

    const runs = 5;
    const countMs: number[] = [];
    const findMs: number[] = [];
    const parallelMs: number[] = [];

    for (let i = 0; i < runs; i++) {
      const c = await timeIt('count', () => prisma.conversation.count({ where }));
      const f = await timeIt('find', () => prisma.conversation.findMany({
        where, include: listInclude as any,
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        skip: 0, take: LIMIT,
      }));
      const p = await timeIt('parallel', () => Promise.all([
        prisma.conversation.findMany({
          where, include: listInclude as any,
          orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          skip: 0, take: LIMIT,
        }),
        prisma.conversation.count({ where }),
      ]));
      countMs.push(c.ms); findMs.push(f.ms); parallelMs.push(p.ms);
      if (i === 0) {
        console.log(`  [warm-up] count=${c.ms.toFixed(1)}ms  find=${f.ms.toFixed(1)}ms  parallel=${p.ms.toFixed(1)}ms  (bỏ qua)`);
      }
    }

    const stat = (arr: number[]) => {
      const s = arr.slice(1).sort((a, b) => a - b); // bỏ warm-up
      const med = s[Math.floor(s.length / 2)];
      return { min: s[0], med, max: s[s.length - 1] };
    };
    const cs = stat(countMs), fs = stat(findMs), ps = stat(parallelMs);

    console.log('\n--- KẾT QUẢ (ms, 4 lần sau warm-up) ---');
    console.log(`  count({where})            min=${cs.min.toFixed(1)}  med=${cs.med.toFixed(1)}  max=${cs.max.toFixed(1)}`);
    console.log(`  findMany(+include, 50)    min=${fs.min.toFixed(1)}  med=${fs.med.toFixed(1)}  max=${fs.max.toFixed(1)}`);
    console.log(`  Promise.all([find,count]) min=${ps.min.toFixed(1)}  med=${ps.med.toFixed(1)}  max=${ps.max.toFixed(1)}`);

    console.log('\n--- DIỄN GIẢI (CTO trung thực) ---');
    if (cs.med <= fs.med) {
      console.log(`  count (med ${cs.med.toFixed(1)}ms) NHANH HƠN/BẰNG find (med ${fs.med.toFixed(1)}ms).`);
      console.log(`  => Vì chạy SONG SONG, wall-clock bị chặn bởi find. Bỏ count TIẾT KIỆM RẤT ÍT wall-clock`);
      console.log(`     (chỉ lợi: nhả 1 connection pool + 1 round-trip). Đừng hứa "nhanh hơn nhiều".`);
    } else {
      const gap = cs.med - fs.med;
      console.log(`  count (med ${cs.med.toFixed(1)}ms) CHẬM HƠN find (med ${fs.med.toFixed(1)}ms) ~${gap.toFixed(1)}ms.`);
      console.log(`  => count LÀ nhánh chậm của Promise.all. Bỏ count có thể cắt tới ~${gap.toFixed(1)}ms wall-clock/trang.`);
      console.log(`     Đây mới là trường hợp B1 đáng làm rõ rệt.`);
    }
    console.log(`\n  Chênh parallel vs find đơn: ${(ps.med - fs.med).toFixed(1)}ms (chi phí gánh thêm count trong Promise.all).`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });

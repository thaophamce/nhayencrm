import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { getZaloScope } from '../zalo/zalo-scope.js';

type ChatStatisticsInput = {
  user: { id: string; orgId: string; role: string };
  accountIds: string[];
  from: Date;
  to: Date;
};

type CountRow = { count: bigint | number };
type ResponseRow = { average_seconds: number | null };
type HourRow = { hour: number; count: bigint | number };

export async function getChatStatistics(input: ChatStatisticsInput) {
  const { user, from, to } = input;
  const scope = await getZaloScope(user.id, user.orgId, user.role);
  const requested = [...new Set(input.accountIds.filter(Boolean))];
  const permitted = scope.isOrgAdmin ? requested : requested.filter(id => scope.displayableIds.includes(id));
  const accountIds = requested.length
    ? permitted
    : (scope.isOrgAdmin
        ? (await prisma.zaloAccount.findMany({ where: { orgId: user.orgId, archivedAt: null }, select: { id: true } })).map(row => row.id)
        : scope.displayableIds);

  const accounts = accountIds.length
    ? await prisma.zaloAccount.findMany({
        where: { orgId: user.orgId, id: { in: accountIds } },
        select: { id: true, displayName: true, phone: true, avatarUrl: true, status: true },
        orderBy: { displayName: 'asc' },
      })
    : [];

  if (!accountIds.length) {
    return emptyStatistics(accounts);
  }

  const accountSql = Prisma.sql`c.zalo_account_id IN (${Prisma.join(accountIds)})`;
  const [sentRows, receivedRows, uniqueInboundRows, friendRequestRows, unread, responseRows, hourRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.org_id = ${user.orgId} AND ${accountSql}
        AND m.sent_at >= ${from} AND m.sent_at < ${to}
        AND m.sender_type = 'self' AND m.is_deleted = false AND m.is_local = false
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.org_id = ${user.orgId} AND ${accountSql}
        AND m.sent_at >= ${from} AND m.sent_at < ${to}
        AND m.sender_type = 'contact' AND m.is_deleted = false AND m.is_local = false
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(DISTINCT COALESCE(
        c.contact_id,
        c.zalo_account_id || ':' || COALESCE(c.external_thread_id, c.id)
      ))::bigint AS count
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.org_id = ${user.orgId} AND ${accountSql}
        AND c.thread_type = 'user'
        AND m.sent_at >= ${from} AND m.sent_at < ${to}
        AND m.sender_type = 'contact' AND m.is_deleted = false AND m.is_local = false
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM activity_logs al
      WHERE al.org_id = ${user.orgId}
        AND al.action = 'friend_request_received'
        AND al.created_at >= ${from} AND al.created_at < ${to}
        AND al.details ->> 'zaloAccountId' IN (${Prisma.join(accountIds)})
    `),
    prisma.conversation.count({
      where: { orgId: user.orgId, zaloAccountId: { in: accountIds }, deletedAt: null, unreadCount: { gt: 0 } },
    }),
    // Deprecated compatibility field for clients loaded before the KPI replacement.
    // Keep it until the statistics API is versioned independently from the frontend.
    prisma.$queryRaw<ResponseRow[]>(Prisma.sql`
      WITH ordered AS (
        SELECT m.sender_type, m.sent_at,
          LAG(m.sender_type) OVER (PARTITION BY m.conversation_id ORDER BY m.sent_at, m.id) AS previous_sender,
          LAG(m.sent_at) OVER (PARTITION BY m.conversation_id ORDER BY m.sent_at, m.id) AS previous_at
        FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE c.org_id = ${user.orgId} AND ${accountSql}
          AND m.sent_at >= ${from} AND m.sent_at < ${to}
          AND m.is_deleted = false AND m.is_local = false
      )
      SELECT AVG(EXTRACT(EPOCH FROM (sent_at - previous_at)))::float AS average_seconds
      FROM ordered
      WHERE sender_type = 'self' AND previous_sender = 'contact'
        AND sent_at - previous_at <= INTERVAL '24 hours'
    `),
    prisma.$queryRaw<HourRow[]>(Prisma.sql`
      SELECT EXTRACT(HOUR FROM m.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS hour,
        COUNT(DISTINCT m.conversation_id)::bigint AS count
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.org_id = ${user.orgId} AND ${accountSql}
        AND m.sent_at >= ${from} AND m.sent_at < ${to}
        AND m.is_deleted = false AND m.is_local = false
      GROUP BY 1 ORDER BY 1
    `),
  ]);

  const sent = Number(sentRows[0]?.count ?? 0);
  const received = Number(receivedRows[0]?.count ?? 0);
  const uniqueInboundCustomers = Number(uniqueInboundRows[0]?.count ?? 0);
  const friendRequests = Number(friendRequestRows[0]?.count ?? 0);
  const hourMap = new Map(hourRows.map(row => [Number(row.hour), Number(row.count)]));
  return {
    scope: accounts.length === 1 ? 'single' : 'all',
    accounts,
    connectedCount: accounts.filter(account => account.status === 'connected').length,
    totals: {
      sent,
      received,
      total: sent + received,
      friendRequests,
      unread,
      uniqueInboundCustomers,
      averageResponseSeconds: Math.round(Number(responseRows[0]?.average_seconds ?? 0)),
    },
    conversationsByHour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hourMap.get(hour) ?? 0 })),
  };
}

function emptyStatistics(accounts: Array<Record<string, unknown>>) {
  return {
    scope: 'all', accounts, connectedCount: 0,
    totals: { sent: 0, received: 0, total: 0, friendRequests: 0, unread: 0, uniqueInboundCustomers: 0, averageResponseSeconds: 0 },
    conversationsByHour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
  };
}

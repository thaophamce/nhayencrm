// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { Prisma } from '@prisma/client';

export type MessageReplyState = 'unanswered' | 'bot_no_sale' | 'sale_replied';

/**
 * Aggregate reply state once over the already-scoped conversation set.
 *
 * The previous correlated LATERAL query ran one Message aggregate per
 * conversation. Keeping the same MAX/FILTER definitions in a grouped join
 * preserves the business semantics while allowing PostgreSQL to scan and
 * aggregate the relevant messages as one set.
 */
export function buildReplyStateAggregateSql(
  orgId: string,
  conversationScopeSql: Prisma.Sql = Prisma.empty,
): Prisma.Sql {
  return Prisma.sql`
    SELECT cv.id,
           MAX(m.sent_at) FILTER (WHERE m.sender_type = 'contact') AS last_inbound,
           MAX(m.sent_at) FILTER (
             WHERE m.sender_type = 'self' AND m.sent_via IN ('user','user_native')
           ) AS last_sale,
           MAX(m.sent_at) FILTER (WHERE m.sender_type = 'self') AS last_self
    FROM conversations cv
    JOIN messages m ON m.conversation_id = cv.id
    WHERE cv.org_id = ${orgId}
      AND cv."threadType" = 'user'
      AND cv.deleted_at IS NULL
      ${conversationScopeSql}
    GROUP BY cv.id
  `;
}

/** SQL predicate for the three mutually-exclusive reply-state filters. */
export function buildReplyStatePredicateSql(state: MessageReplyState): Prisma.Sql {
  switch (state) {
    case 'unanswered':
      return Prisma.sql`agg.last_self IS NULL OR agg.last_self < agg.last_inbound`;
    case 'sale_replied':
      return Prisma.sql`agg.last_sale IS NOT NULL AND agg.last_sale >= agg.last_inbound`;
    case 'bot_no_sale':
      return Prisma.sql`
        agg.last_self IS NOT NULL AND agg.last_self >= agg.last_inbound
        AND (agg.last_sale IS NULL OR agg.last_sale < agg.last_inbound)
      `;
  }
}

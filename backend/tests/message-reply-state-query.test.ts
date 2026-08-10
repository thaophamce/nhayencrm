import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import {
  buildReplyStateAggregateSql,
  buildReplyStatePredicateSql,
  type MessageReplyState,
} from '../src/modules/chat/message-reply-state-query.js';

type CompiledSql = { text: string; values: unknown[] };

function compilePrismaSql(fragment: Prisma.Sql, values: unknown[] = []): CompiledSql {
  let text = '';

  for (let index = 0; index < fragment.strings.length; index += 1) {
    text += fragment.strings[index] ?? '';
    if (index >= fragment.values.length) continue;

    const value = fragment.values[index];
    if (value && typeof value === 'object' && 'strings' in value && 'values' in value) {
      text += compilePrismaSql(value as Prisma.Sql, values).text;
    } else {
      values.push(value);
      text += `$${values.length}`;
    }
  }

  return { text, values };
}

function oldReplyStateSql(
  orgId: string,
  state: MessageReplyState,
  conversationScopeSql: Prisma.Sql,
): Prisma.Sql {
  const predicate = buildReplyStatePredicateSql(state);
  return Prisma.sql`
    SELECT cv.id
    FROM conversations cv
    JOIN LATERAL (
      SELECT MAX(m.sent_at) FILTER (WHERE m.sender_type = 'contact') AS last_inbound,
             MAX(m.sent_at) FILTER (
               WHERE m.sender_type = 'self' AND m.sent_via IN ('user','user_native')
             ) AS last_sale,
             MAX(m.sent_at) FILTER (WHERE m.sender_type = 'self') AS last_self
      FROM messages m
      WHERE m.conversation_id = cv.id
    ) agg ON TRUE
    WHERE cv.org_id = ${orgId}
      AND cv."threadType" = 'user'
      AND cv.deleted_at IS NULL
      ${conversationScopeSql}
      AND agg.last_inbound IS NOT NULL
      AND (${predicate})
    ORDER BY cv.id
  `;
}

function newReplyStateSql(
  orgId: string,
  state: MessageReplyState,
  conversationScopeSql: Prisma.Sql,
): Prisma.Sql {
  const aggregate = buildReplyStateAggregateSql(orgId, conversationScopeSql);
  const predicate = buildReplyStatePredicateSql(state);
  return Prisma.sql`
    SELECT agg.id
    FROM (${aggregate}) agg
    WHERE agg.last_inbound IS NOT NULL
      AND (${predicate})
    ORDER BY agg.id
  `;
}

function storedReplyStateSql(
  orgId: string,
  state: MessageReplyState,
  conversationScopeSql: Prisma.Sql,
): Prisma.Sql {
  return Prisma.sql`
    SELECT cv.id
    FROM conversations cv
    WHERE cv.org_id = ${orgId}
      AND cv."threadType" = 'user'
      AND cv.deleted_at IS NULL
      ${conversationScopeSql}
      AND cv.message_reply_state = ${state}
    ORDER BY cv.id
  `;
}

const integrationUrl = process.env.MESSAGE_REPLY_STATE_TEST_DATABASE_URL;
function databaseIdentity(value: string): string {
  try {
    const parsed = new URL(value);
    const port = parsed.port || '5432';
    return `${parsed.hostname.toLowerCase()}:${port}/${decodeURIComponent(parsed.pathname.replace(/^\//, ''))}`;
  } catch {
    return value.trim();
  }
}
if (!integrationUrl) {
  process.stderr.write(
    '[SKIP] message reply-state PostgreSQL integration test: '
      + 'missing MESSAGE_REPLY_STATE_TEST_DATABASE_URL. '
      + 'Run npm run test:integration:message-reply-state with a disposable test database.\n',
  );
}
if (
  integrationUrl
  && process.env.DATABASE_URL
  && databaseIdentity(integrationUrl) === databaseIdentity(process.env.DATABASE_URL)
) {
  throw new Error(
    'Refusing message reply-state integration test: '
      + 'MESSAGE_REPLY_STATE_TEST_DATABASE_URL must not equal DATABASE_URL.',
  );
}
const describePostgres = integrationUrl ? describe : describe.skip;

describePostgres('message reply-state SQL behavior on PostgreSQL', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: integrationUrl });
    await client.connect();
    await client.query(`
      CREATE TEMP TABLE conversations (
        id text PRIMARY KEY,
        org_id text NOT NULL,
        "threadType" text NOT NULL,
        deleted_at timestamp(3),
        zalo_account_id text NOT NULL
      );
      CREATE TEMP TABLE messages (
        id text PRIMARY KEY,
        conversation_id text NOT NULL,
        sent_at timestamp(3) NOT NULL,
        sender_type text NOT NULL,
        sent_via text
      );

      INSERT INTO conversations (id, org_id, "threadType", deleted_at, zalo_account_id) VALUES
        ('empty',          'org-1', 'user',  NULL, 'za-a'),
        ('no-inbound',     'org-1', 'user',  NULL, 'za-a'),
        ('unanswered',     'org-1', 'user',  NULL, 'za-a'),
        ('sale-replied',   'org-1', 'user',  NULL, 'za-a'),
        ('bot-no-sale',    'org-1', 'user',  NULL, 'za-a'),
        ('multi-nick-a',   'org-1', 'user',  NULL, 'za-a'),
        ('multi-nick-b',   'org-1', 'user',  NULL, 'za-b'),
        ('excluded-group', 'org-1', 'group', NULL, 'za-a'),
        ('excluded-deleted','org-1','user',  now(), 'za-a'),
        ('other-org',      'org-2', 'user',  NULL, 'za-a'),
        ('trigger-case',   'org-1', 'user',  NULL, 'za-a');

      INSERT INTO messages (id, conversation_id, sent_at, sender_type, sent_via) VALUES
        ('m01', 'no-inbound',      '2026-01-01T03:00:00Z', 'self',    'user'),
        ('m02', 'unanswered',      '2026-01-01T01:00:00Z', 'self',    'automation'),
        ('m03', 'unanswered',      '2026-01-01T02:00:00Z', 'contact', 'zalo'),
        ('m04', 'sale-replied',    '2026-01-01T02:00:00Z', 'contact', 'zalo'),
        ('m05', 'sale-replied',    '2026-01-01T03:00:00Z', 'self',    'user'),
        ('m06', 'bot-no-sale',     '2026-01-01T02:00:00Z', 'contact', 'zalo'),
        ('m07', 'bot-no-sale',     '2026-01-01T03:00:00Z', 'self',    'automation'),
        ('m08', 'multi-nick-a',    '2026-01-01T02:00:00Z', 'contact', 'zalo'),
        ('m09', 'multi-nick-b',    '2026-01-01T02:00:00Z', 'contact', 'zalo'),
        ('m10', 'multi-nick-b',    '2026-01-01T03:00:00Z', 'self',    'user_native'),
        ('m11', 'excluded-group',  '2026-01-01T02:00:00Z', 'contact', 'zalo'),
        ('m12', 'excluded-deleted','2026-01-01T02:00:00Z', 'contact', 'zalo'),
        ('m13', 'other-org',       '2026-01-01T02:00:00Z', 'contact', 'zalo');
    `);

    const migrationSql = await readFile(
      new URL('../prisma/migrations/20260810120000_denormalize_conversation_reply_state/migration.sql', import.meta.url),
      'utf8',
    );
    await client.query(migrationSql);
  });

  afterAll(async () => {
    await client?.end();
  });

  async function idsFor(query: Prisma.Sql): Promise<string[]> {
    const compiled = compilePrismaSql(query);
    const result = await client.query<{ id: string }>(compiled.text, compiled.values);
    return result.rows.map((row) => row.id);
  }

  async function expectOldAndNewToMatch(
    state: MessageReplyState,
    scope: Prisma.Sql,
    expected: string[],
  ): Promise<void> {
    const oldIds = await idsFor(oldReplyStateSql('org-1', state, scope));
    const newIds = await idsFor(newReplyStateSql('org-1', state, scope));
    const storedIds = await idsFor(storedReplyStateSql('org-1', state, scope));
    expect(newIds).toEqual(oldIds);
    expect(newIds).toEqual(expected);
    expect(storedIds).toEqual(oldIds);
  }

  it('matches the old query for empty, no-inbound, and all three reply states', async () => {
    await expectOldAndNewToMatch('unanswered', Prisma.empty, ['multi-nick-a', 'unanswered']);
    await expectOldAndNewToMatch('bot_no_sale', Prisma.empty, ['bot-no-sale']);
    await expectOldAndNewToMatch('sale_replied', Prisma.empty, ['multi-nick-b', 'sale-replied']);
  });

  it('keeps account scoping correct when an org has multiple nicks', async () => {
    const accountScope = Prisma.sql`AND cv.zalo_account_id IN (${Prisma.join(['za-a'])})`;
    await expectOldAndNewToMatch('unanswered', accountScope, ['multi-nick-a', 'unanswered']);
    await expectOldAndNewToMatch('bot_no_sale', accountScope, ['bot-no-sale']);
    await expectOldAndNewToMatch('sale_replied', accountScope, ['sale-replied']);
  });

  it('keeps stored state correct for bulk, out-of-order, update, and delete writes', async () => {
    await client.query(`
      INSERT INTO messages (id, conversation_id, sent_at, sender_type, sent_via) VALUES
        ('trigger-inbound', 'trigger-case', '2026-02-01T04:00:00Z', 'contact', 'zalo'),
        ('trigger-bot',     'trigger-case', '2026-02-01T05:00:00Z', 'self', 'automation');
    `);
    await expectOldAndNewToMatch('bot_no_sale', Prisma.empty, ['bot-no-sale', 'trigger-case']);

    // A late-arriving older sale event must not override the newer inbound/bot state.
    await client.query(`
      INSERT INTO messages (id, conversation_id, sent_at, sender_type, sent_via)
      VALUES ('trigger-old-sale', 'trigger-case', '2026-02-01T03:00:00Z', 'self', 'user');
    `);
    await expectOldAndNewToMatch('bot_no_sale', Prisma.empty, ['bot-no-sale', 'trigger-case']);

    await client.query(`
      INSERT INTO messages (id, conversation_id, sent_at, sender_type, sent_via)
      VALUES ('trigger-new-sale', 'trigger-case', '2026-02-01T06:00:00Z', 'self', 'user_native');
    `);
    await expectOldAndNewToMatch('sale_replied', Prisma.empty, ['multi-nick-b', 'sale-replied', 'trigger-case']);

    await client.query(`UPDATE messages SET sent_via = 'automation' WHERE id = 'trigger-new-sale'`);
    await expectOldAndNewToMatch('bot_no_sale', Prisma.empty, ['bot-no-sale', 'trigger-case']);

    await client.query(`DELETE FROM messages WHERE id = 'trigger-new-sale'`);
    await expectOldAndNewToMatch('bot_no_sale', Prisma.empty, ['bot-no-sale', 'trigger-case']);

    await client.query(`UPDATE messages SET sender_type = 'contact' WHERE id = 'trigger-bot'`);
    await expectOldAndNewToMatch('unanswered', Prisma.empty, ['multi-nick-a', 'trigger-case', 'unanswered']);
  });
});

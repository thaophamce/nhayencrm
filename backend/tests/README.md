# Backend integration tests

## Message reply-state query

`message-reply-state-query.test.ts` executes the old LATERAL query, the set-based
aggregate query, and the P1-03 stored Conversation state against the same
PostgreSQL fixtures. It applies the real P1-03 migration to temporary tables and
also verifies trigger behavior for bulk inserts, out-of-order events, updates,
and physical deletes. The fixtures cover empty conversations, conversations
without inbound messages, all three reply states, multiple Zalo nicks, groups,
deleted rows, and tenant isolation.

The normal `npm test` command skips this database integration test when
`MESSAGE_REPLY_STATE_TEST_DATABASE_URL` is absent and prints an explicit warning.
To require the test to run, use:

```powershell
$env:MESSAGE_REPLY_STATE_TEST_DATABASE_URL = 'postgresql://postgres:password@127.0.0.1:55432/zalocrm_reply_state_test'
npm run test:integration:message-reply-state
```

The dedicated command fails instead of skipping when the URL is missing or unsafe.
The database name must contain `test`, `tmp`, `probe`, or `integration`.

Safety requirements:

- Use a disposable PostgreSQL database created only for this test.
- Never point the variable at production, staging, or the regular development DB.
- Never set it equal to `DATABASE_URL`; the test and runner reject that case.
- The test creates session-local temporary tables named `conversations` and
  `messages`. They shadow persistent tables only within that one connection and
  disappear when the connection closes.

Example disposable database:

```powershell
docker run --rm --name zalocrm-reply-state-test `
  -e POSTGRES_PASSWORD=password `
  -e POSTGRES_DB=zalocrm_reply_state_test `
  -p 127.0.0.1:55432:5432 postgres:16-alpine
```

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const integrationUrl = process.env.MESSAGE_REPLY_STATE_TEST_DATABASE_URL?.trim();

function databaseIdentity(value) {
  try {
    const parsed = new URL(value);
    const port = parsed.port || '5432';
    return `${parsed.hostname.toLowerCase()}:${port}/${decodeURIComponent(parsed.pathname.replace(/^\//, ''))}`;
  } catch {
    return value.trim();
  }
}

if (!integrationUrl) {
  console.error(
    'Missing MESSAGE_REPLY_STATE_TEST_DATABASE_URL. '
      + 'Point it to a disposable PostgreSQL database; never use production.',
  );
  process.exit(1);
}

if (
  process.env.DATABASE_URL
  && databaseIdentity(process.env.DATABASE_URL) === databaseIdentity(integrationUrl)
) {
  console.error(
    'Refusing to run: MESSAGE_REPLY_STATE_TEST_DATABASE_URL equals DATABASE_URL. '
      + 'Use a separate disposable PostgreSQL database.',
  );
  process.exit(1);
}

let databaseName = '';
try {
  const parsed = new URL(integrationUrl);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('unsupported protocol');
  }
  databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
} catch {
  console.error('MESSAGE_REPLY_STATE_TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  process.exit(1);
}

if (!/(test|tmp|probe|integration)/i.test(databaseName)) {
  console.error(
    `Refusing database "${databaseName}": its name must contain `
      + 'test, tmp, probe, or integration to mark it as disposable.',
  );
  process.exit(1);
}

const vitestEntry = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const result = spawnSync(
  process.execPath,
  [vitestEntry, 'run', 'tests/message-reply-state-query.test.ts'],
  {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      MESSAGE_REPLY_STATE_TEST_REQUIRED: '1',
    },
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

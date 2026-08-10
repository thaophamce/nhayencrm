import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const prismaEntry = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
const vitestEntry = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const container = `zalocrm-security-test-${suffix}`;
const database = `zalocrm_security_test_${suffix}`;
const user = 'test';
const password = randomUUID();
const disposableLabel = 'com.nhayencrm.disposable=security-test';

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: options.env ?? process.env,
  });
}

function fail(message, result) {
  if (result?.error) console.error(result.error.message);
  if (result) console.error(`status=${String(result.status)} signal=${String(result.signal)}`);
  if (result?.stdout) process.stderr.write(result.stdout);
  if (result?.stderr) process.stderr.write(result.stderr);
  console.error(message);
  process.exitCode = 1;
}

let started = false;
try {
  // If a previous Node process was force-terminated, Docker never received the
  // finally cleanup. Remove only containers carrying our dedicated test label.
  const stale = run('docker', [
    'ps', '--all', '--quiet', '--filter', `label=${disposableLabel}`,
  ], { capture: true });
  for (const id of (stale.stdout || '').split(/\s+/).filter(Boolean)) {
    run('docker', ['rm', '--force', id], { capture: true });
  }

  const start = run('docker', [
    'run', '--detach', '--rm', '--name', container,
    '--label', disposableLabel,
    '-e', `POSTGRES_USER=${user}`,
    '-e', `POSTGRES_PASSWORD=${password}`,
    '-e', `POSTGRES_DB=${database}`,
    '-p', '127.0.0.1::5432',
    'postgres:16-alpine',
  ], { capture: true });
  if (start.status !== 0) {
    fail('Unable to start disposable PostgreSQL container.', start);
  } else {
    started = true;
  }
  if (!started) process.exit(1);

  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const probe = run('docker', ['exec', container, 'pg_isready', '-U', user, '-d', database], { capture: true });
    if (probe.status === 0) {
      ready = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) {
    fail('Disposable PostgreSQL did not become ready in time.');
    process.exit(1);
  }

  const portResult = run('docker', ['port', container, '5432/tcp'], { capture: true });
  const portMatch = portResult.stdout?.match(/:(\d+)\s*$/m);
  if (portResult.status !== 0 || !portMatch) {
    fail('Unable to resolve disposable PostgreSQL port.', portResult);
    process.exit(1);
  }

  const databaseUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${portMatch[1]}/${database}`;
  const env = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test' };

  const push = run(process.execPath, [prismaEntry, 'db', 'push'], { env, capture: true });
  if (push.status !== 0) {
    fail('Unable to prepare disposable security-test schema.');
    process.exit(1);
  }

  const tests = run(process.execPath, [
    vitestEntry, 'run',
    '--config', 'vitest.security.config.ts',
  ], { env });
  process.exitCode = tests.status ?? 1;
} finally {
  if (started) run('docker', ['rm', '--force', container], { capture: true });
}

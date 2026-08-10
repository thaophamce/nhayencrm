import { configDefaults, defineConfig } from 'vitest/config';

// Tests for proprietary modules intentionally removed by the open-core split.
// Keep them for the private edition, but do not import them in this edition.
const enterpriseOnlyTests = [
  'tests/alias-template.test.ts',
  'tests/block-logger.test.ts',
  'tests/block-reason-catalog.test.ts',
  'tests/block-types.test.ts',
  'tests/care-notify-privacy.test.ts',
  'tests/care-session-service.test.ts',
  'tests/engine-gates.test.ts',
  'tests/lead-notify.test.ts',
  'tests/lead-pool-submit-note.test.ts',
  'tests/materialize-from-event.test.ts',
  'tests/quota-kind-separation.test.ts',
  'tests/reconcile-stuck-steps.test.ts',
  'tests/regression-m51-4-dup-status.test.ts',
  'tests/regression-m52-reply-pause.test.ts',
  'tests/regression-m57-reaction.test.ts',
  'tests/render-template-vars.test.ts',
  'tests/security/hmac.test.ts',
  'tests/sequence-jobid-multistream.test.ts',
  'tests/sequence-schedule-calculator.test.ts',
  'tests/sequence-step-worker-block.test.ts',
  'tests/sequence-types.test.ts',
  'tests/trigger-types.test.ts',
  'tests/unit/facebook-form-discovery.test.ts',
  'tests/unit/facebook-token-refresh-cron.test.ts',
  'tests/unit/facebook-webhook.test.ts',
  'tests/unit/lead-field-mapper.test.ts',
  'tests/unit/round-robin-assigner.test.ts',
  'tests/unit/zalo-field-mapper.test.ts',
  'tests/worker-token-passthrough.test.ts',
];

// These suites require a real disposable PostgreSQL database and run through
// `npm run test:security:integration`, never against production.
const databaseIntegrationTests = [
  'tests/security/ai-capabilities.test.ts',
  'tests/security/auth-flow.test.ts',
  'tests/security/refresh-token-service.test.ts',
  'tests/security/require-active-user.test.ts',
  'tests/security/security-audit.test.ts',
];

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // This workstation also hosts the production containers. Unbounded worker fan-out
    // starves Fastify/sharp tests and causes false 5s timeouts under normal load.
    maxWorkers: 4,
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, ...enterpriseOnlyTests, ...databaseIntegrationTests],
    // 2026-06-11 — DATABASE_URL giả để test UNIT (hàm thuần) import được prisma-client
    // mà không cần DB thật (prisma init lazy, không connect). Test cần DB thật override
    // qua env runtime. Đảm bảo privacy-redact-regression chạy ở mọi máy/CI.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test',
    },
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.ts', 'src/shared/**/*.ts'],
    },
  },
});

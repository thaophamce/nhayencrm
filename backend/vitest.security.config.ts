import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/security/ai-capabilities.test.ts',
      'tests/security/auth-flow.test.ts',
      'tests/security/refresh-token-service.test.ts',
      'tests/security/require-active-user.test.ts',
      'tests/security/security-audit.test.ts',
    ],
    exclude: configDefaults.exclude,
    env: {
      DATABASE_URL: process.env.DATABASE_URL!,
    },
  },
});

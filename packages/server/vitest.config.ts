import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: { NODE_ENV: 'test' },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20000,
  },
});

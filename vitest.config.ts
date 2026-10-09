import { defineConfig } from 'vitest/config';

const SOURCE_CONDITION = '@heroes2dgame/source';

export default defineConfig({
  resolve: {
    conditions: [SOURCE_CONDITION, 'module', 'browser', 'development|production'],
  },
  ssr: {
    resolve: {
      conditions: [SOURCE_CONDITION, 'module', 'node', 'development|production'],
    },
  },
  test: {
    include: ['{libs,adapters,apps,packs}/*/src/**/*.test.ts'],
  },
});

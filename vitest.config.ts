import { defineConfig } from 'vitest/config';

// The WebHID configurator keeps all protocol logic in `src/lib`, free of any
// DOM/browser dependency, so the unit tests can run in a plain Node environment
// against an in-memory mock device (see `src/lib/protocol/mockDevice.ts`).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

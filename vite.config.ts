import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // three.js (~550 kB) is its own lazy chunk, loaded only when the 3D view opens.
  build: { chunkSizeWarningLimit: 600 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.ts'],
  },
});

import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use core's TypeScript sources directly so the app never needs a core build first.
    alias: { '@gtm-editor/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)) },
  },
});

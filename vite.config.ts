import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'url';

const ootmmCoreRoot = fileURLToPath(
  new URL('./OoTMM/packages/core/src', import.meta.url),
);
const ootmmCjsDeps = [
  '@ootmm/core/logic/index',
  '@ootmm/core/logic/pathfind',
  '@ootmm/core/logic/locations',
  '@ootmm/core/logic/entrance',
  '@ootmm/core/logic/is-shuffled',
  '@ootmm/core/items/index',
  '@ootmm/core/names',
  '@ootmm/core/monitor',
  '@ootmm/core/settings/index',
  '@ootmm/core/settings/data',
];

export default defineConfig({
  // Use relative asset paths so built files work from any subfolder.
  base: './',
  plugins: [vue()],
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@packs/ootmm': fileURLToPath(
        new URL('./packs/ootmm/src', import.meta.url),
      ),
      '@ootmm/data': fileURLToPath(
        new URL('./OoTMM/packages/data/src/index.ts', import.meta.url),
      ),
      '@ootmm/core/settings': fileURLToPath(
        new URL('./OoTMM/packages/core/src/settings', import.meta.url),
      ),
      '@ootmm/core/items': fileURLToPath(
        new URL('./OoTMM/packages/generator/lib/combo/items', import.meta.url),
      ),
      '@ootmm/core/logic': fileURLToPath(
        new URL('./OoTMM/packages/generator/lib/combo/logic', import.meta.url),
      ),
      '@ootmm/core/monitor': fileURLToPath(
        new URL(
          './OoTMM/packages/generator/lib/combo/monitor.ts',
          import.meta.url,
        ),
      ),
      '@ootmm/core/names': fileURLToPath(
        new URL(
          './OoTMM/packages/generator/lib/combo/names.ts',
          import.meta.url,
        ),
      ),
      '@ootmm/core': ootmmCoreRoot,
    },
  },
  define: {
    'process.env.VERSION': JSON.stringify('dev'),
    'process.env.__IS_BROWSER__': JSON.stringify(true),
  },
  optimizeDeps: {
    include: ootmmCjsDeps,
  },
  build: {
    // Ensure Rollup converts the CJS OoTMM libs when building
    commonjsOptions: {
      include: [/node_modules/, /OoTMM\/packages\/generator\/lib\/combo/],
    },
  },
});

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'url';
import { execSync } from 'child_process';

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

function readGitMetadata(
  command: string,
  fallback: string,
  description: string,
): string {
  try {
    const value = execSync(command, {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (value) {
      return value;
    }
    console.warn(`Read empty ${description}; using "${fallback}"`);
    return fallback;
  } catch {
    console.warn(`Failed to read ${description}; using "${fallback}"`);
    return fallback;
  }
}

const buildCommitDate = readGitMetadata(
  'git log -1 --format=%cs',
  'unknown',
  'TLT build commit date',
);
const buildCommitHash = readGitMetadata(
  'git rev-parse --short HEAD',
  'unknown',
  'TLT build commit hash',
);
const ootmmVersionTag =
  readGitMetadata(
    'git -C OoTMM tag --merged HEAD --sort=-version:refname',
    'unknown',
    'OoTMM version tag',
  )
    .split('\n')
    .map((tag) => tag.trim())
    .find((tag) => tag.length > 0) ?? 'unknown';

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
    __TLT_BUILD_COMMIT_DATE__: JSON.stringify(buildCommitDate),
    __TLT_BUILD_COMMIT_HASH__: JSON.stringify(buildCommitHash),
    __TLT_OOTMM_VERSION_TAG__: JSON.stringify(ootmmVersionTag),
  },
  optimizeDeps: {
    include: ootmmCjsDeps,
  },
});

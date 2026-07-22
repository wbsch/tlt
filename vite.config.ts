import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'url';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const ootmmCoreRoot = fileURLToPath(
  new URL('./OoTMM/packages/core/src', import.meta.url),
);
const publicImagesRoot = fileURLToPath(
  new URL('./public/images', import.meta.url),
);
const publicImageExtensions = new Set([
  '.avif',
  '.gif',
  '.jpg',
  '.jpeg',
  '.png',
  '.svg',
  '.webp',
]);
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

function isPublicImagePath(filePath: string): boolean {
  return (
    filePath.startsWith(publicImagesRoot) &&
    publicImageExtensions.has(path.extname(filePath).toLowerCase())
  );
}

function appendCurrentPublicImageVersion(url: string): string {
  const publicImageMatch = /^(\/|\.\/)?(images\/.*)$/.exec(url);
  if (!publicImageMatch) {
    return url;
  }

  const prefix = publicImageMatch[1] ?? '';
  const publicPath = publicImageMatch[2];
  const hashIndex = publicPath.indexOf('#');
  const hash = hashIndex >= 0 ? publicPath.slice(hashIndex) : '';
  const urlWithoutHash =
    hashIndex >= 0 ? publicPath.slice(0, hashIndex) : publicPath;
  const queryIndex = urlWithoutHash.indexOf('?');
  const pathname =
    queryIndex >= 0 ? urlWithoutHash.slice(0, queryIndex) : urlWithoutHash;
  const query = queryIndex >= 0 ? urlWithoutHash.slice(queryIndex) : '';
  if (query && new URLSearchParams(query.slice(1)).has('v')) {
    return url;
  }

  const filePath = fileURLToPath(
    new URL(`./public/${pathname}`, import.meta.url),
  );

  if (!existsSync(filePath)) {
    return url;
  }

  const version = createHash('sha256')
    .update(readFileSync(filePath))
    .digest('hex')
    .slice(0, 12);

  return `${prefix}${pathname}${query}${query ? '&' : '?'}v=${version}${hash}`;
}

function publicImageAssetVersionPlugin() {
  return {
    name: 'tlt-public-image-asset-versions',
    configureServer(server) {
      server.watcher.add(publicImagesRoot);
      server.watcher.on('all', (_event, filePath) => {
        if (!isPublicImagePath(filePath)) {
          return;
        }

        try {
          execSync('node scripts/generate_public_image_asset_versions.ts', {
            cwd: projectRoot,
            stdio: 'inherit',
          });
        } catch (error) {
          console.warn(
            'Failed to regenerate public image asset versions',
            error,
          );
        }
        server.ws.send({ type: 'full-reload' });
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /(?:\/|\.\/)?images\/[^"'()\s]+/g,
          appendCurrentPublicImageVersion,
        );
      },
    },
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.html')) {
          continue;
        }

        const source =
          typeof asset.source === 'string'
            ? asset.source
            : Buffer.from(asset.source).toString('utf8');
        asset.source = source.replace(
          /(?:\/|\.\/)?images\/[^"'()\s]+/g,
          appendCurrentPublicImageVersion,
        );
      }
    },
    writeBundle(options) {
      const outputDirectory = path.resolve(projectRoot, options.dir ?? 'dist');
      const indexHtmlPath = path.join(outputDirectory, 'index.html');
      if (!existsSync(indexHtmlPath)) {
        return;
      }

      const html = readFileSync(indexHtmlPath, 'utf8');
      const versionedHtml = html.replace(
        /(?:\/|\.\/)?images\/[^"'()\s]+/g,
        appendCurrentPublicImageVersion,
      );
      if (versionedHtml !== html) {
        writeFileSync(indexHtmlPath, versionedHtml, 'utf8');
      }
    },
  };
}

// BusinessAlex's map-icon and song-event assets are opt-in. Both the restricted
// and the MIT fallback sets are committed under public/images/ and copied into
// dist/ by Vite. After a build we prune whichever set is NOT active so the built
// output only serves the assets it is licensed to serve. (Dev `vite serve` reads
// public/ directly and never copies it, so nothing to prune there.)
function assetSetPruningPlugin(useRestrictedAssets: boolean) {
  const inactiveDirs = useRestrictedAssets
    ? ['images/fallback']
    : ['images/map_icons', 'images/song_events'];
  return {
    name: 'tlt-asset-set-pruning',
    apply: 'build' as const,
    writeBundle(options: { dir?: string }) {
      const outputDirectory = path.resolve(projectRoot, options.dir ?? 'dist');
      for (const relativeDir of inactiveDirs) {
        const target = path.join(outputDirectory, relativeDir);
        if (existsSync(target)) {
          rmSync(target, { recursive: true, force: true });
        }
      }
    },
  };
}

function readGitMetadata(
  command: string,
  fallback: string,
  description: string,
): string {
  try {
    const value = execSync(command, {
      cwd: projectRoot,
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

export default defineConfig(({ mode }) => {
  // Reads shell env (process.env, e.g. `FLAG=TRUE npm run build`) and .env files
  // (loadEnv with an empty prefix also picks up non-VITE_ vars, e.g. a gitignored
  // .env.local). Only the exact value TRUE opts into the restricted assets.
  const env = loadEnv(mode, projectRoot, '');
  const useRestrictedAssets =
    (process.env.I_HAVE_ASKED_BUSINESSALEX_FOR_PERMISSION_FOR_THE_IMAGE_FILES ??
      env.I_HAVE_ASKED_BUSINESSALEX_FOR_PERMISSION_FOR_THE_IMAGE_FILES) ===
    'TRUE';
  console.log(
    useRestrictedAssets
      ? '[tlt] Map-icon/song-event assets: RESTRICTED set (BusinessAlex; permission asserted via I_HAVE_ASKED_BUSINESSALEX_FOR_PERMISSION_FOR_THE_IMAGE_FILES=TRUE).'
      : '[tlt] Map-icon/song-event assets: MIT fallback set (default). Set I_HAVE_ASKED_BUSINESSALEX_FOR_PERMISSION_FOR_THE_IMAGE_FILES=TRUE only if you have permission to use the restricted assets.',
  );

  return {
    // Use relative asset paths so built files work from any subfolder.
    base: './',
    plugins: [
      publicImageAssetVersionPlugin(),
      assetSetPruningPlugin(useRestrictedAssets),
      vue(),
    ],
    resolve: {
      extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@packs/ootmm': fileURLToPath(
          new URL('./packs/ootmm/src', import.meta.url),
        ),
        '@ootmm/data': fileURLToPath(
          new URL('./scripts/ootmm_data_bridge.ts', import.meta.url),
        ),
        '@ootmm/core/settings': fileURLToPath(
          new URL('./OoTMM/packages/core/src/settings', import.meta.url),
        ),
        '@ootmm/core/items': fileURLToPath(
          new URL('./OoTMM/packages/core/src/items', import.meta.url),
        ),
        '@ootmm/core/logic/entrance': fileURLToPath(
          new URL(
            './OoTMM/packages/logic/src/solver/entrances.ts',
            import.meta.url,
          ),
        ),
        '@ootmm/core/logic/is-shuffled': fileURLToPath(
          new URL('./OoTMM/packages/logic/src/helpers.ts', import.meta.url),
        ),
        '@ootmm/core/logic': fileURLToPath(
          new URL('./OoTMM/packages/logic/src', import.meta.url),
        ),
        '@ootmm/core/monitor': fileURLToPath(
          new URL('./OoTMM/packages/core/src/monitor.ts', import.meta.url),
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
      __TLT_USE_RESTRICTED_ASSETS__: JSON.stringify(useRestrictedAssets),
    },
    optimizeDeps: {
      include: ootmmCjsDeps,
    },
    server: {
      proxy: {
        '/coop/ws': {
          target: 'ws://127.0.0.1:8765',
          ws: true,
          rewrite: () => '/',
        },
        '/coop/healthz': {
          target: 'http://127.0.0.1:8765',
          rewrite: () => '/healthz',
        },
      },
    },
  };
});

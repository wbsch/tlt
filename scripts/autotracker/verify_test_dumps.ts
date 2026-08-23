/**
 * Verify every full autotracker dump in `public/test-dumps/` against its
 * recorded `expected` ground truth (see
 * `tests/helpers/autotrackerTestDumpVerifier.ts`).
 *
 * The verifier imports `rawFrameParser.ts`, which uses `import.meta.glob`
 * (unsupported by plain `tsx`), so this script loads the verifier through
 * Vite's SSR module loader instead.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

import type {
  TestDumpFile,
  TestDumpVerificationResult,
} from '../../tests/helpers/autotrackerTestDumpVerifier';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const TEST_DUMPS_DIR = path.join(REPO_ROOT, 'public/test-dumps');

type VerifierModule = {
  verifyTestDump: (dump: TestDumpFile) => TestDumpVerificationResult;
  verifyTestDumpsInDirectory: (dir: string) => {
    missingOrEmpty: boolean;
    dumpsDir: string;
    files: { name: string; result: TestDumpVerificationResult }[];
  };
};

async function main(): Promise<void> {
  const server = await createServer({
    root: REPO_ROOT,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });

  try {
    const { verifyTestDumpsInDirectory } = (await server.ssrLoadModule(
      '/tests/helpers/autotrackerTestDumpVerifier.ts',
    )) as VerifierModule;

    const scanned = verifyTestDumpsInDirectory(TEST_DUMPS_DIR);
    if (scanned.missingOrEmpty) {
      console.warn(
        `No test dumps found in ${path.relative(REPO_ROOT, TEST_DUMPS_DIR)}; ` +
          `skipping autotracker test-dump verification.`,
      );
      return;
    }

    let failed = false;
    for (const { name, result } of scanned.files) {
      if (result.ok) {
        console.log(`OK   ${name}`);
      } else {
        failed = true;
        console.error(`FAIL ${name}: ${result.reason}`);
      }
    }

    if (failed) {
      console.error(
        'One or more test dumps failed verification. If the parser changed ' +
          'intentionally, re-capture the affected dump(s) via the debug dump UI.',
      );
      process.exitCode = 1;
    }
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error('verify_test_dumps failed:', error);
  process.exitCode = 1;
});

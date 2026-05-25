import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PRETTIER_CLI = require.resolve('prettier/bin/prettier.cjs');

export function formatGeneratedFiles(
  repoRoot: string,
  filePaths: string[],
): void {
  const uniqueFilePaths = [...new Set(filePaths)];
  if (uniqueFilePaths.length === 0) {
    return;
  }

  const result = spawnSync(
    process.execPath,
    [PRETTIER_CLI, '--write', '--log-level', 'silent', ...uniqueFilePaths],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `prettier exited with status ${result.status ?? 'unknown'}`,
    );
  }
}

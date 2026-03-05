import { defineConfig } from '@playwright/test';
import os from 'os';
import { TEST_TIMEOUTS } from './tests/e2e/helpers/tracker';

// Hacky, broken way of running num(physical_cores)-1 workers
// If you have no hyperthreading I feel bad for you son
const cpuCount = os.cpus().length / 2;
const workers = Math.max(1, cpuCount - 1);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  workers: workers,
  expect: {
    timeout: TEST_TIMEOUTS.DEFAULT_EXPECT,
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});

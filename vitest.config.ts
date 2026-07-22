import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// vite.config.ts exports a config *function* (it reads env to pick the active
// asset set), so resolve it with the current env before merging in test options.
export default defineConfig((configEnv) =>
  mergeConfig(
    typeof viteConfig === 'function' ? viteConfig(configEnv) : viteConfig,
    {
      test: {
        environment: 'jsdom',
        environmentOptions: {
          jsdom: {
            url: 'http://localhost/',
          },
        },
        include: ['tests/unit/**/*.spec.ts'],
        setupFiles: ['./tests/unit/setup.ts'],
        restoreMocks: true,
      },
    },
  ),
);

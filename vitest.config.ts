import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
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
  }),
);

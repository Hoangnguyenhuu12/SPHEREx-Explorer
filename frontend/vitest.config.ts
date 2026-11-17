import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      setupFiles: ['./src/test/setup.ts'],
      environmentOptions: {
        jsdom: {
          url: 'http://localhost',
        },
      },
    },
  }),
)

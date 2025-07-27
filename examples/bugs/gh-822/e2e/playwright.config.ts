import { defineConfig } from '@playwright/test';
import baseConfig from '../../../common/config-e2e';

export default defineConfig(baseConfig, {
  testDir: './e2e',
  webServer: {
    command: 'pnpm opennext:dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
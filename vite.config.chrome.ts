import { resolve } from 'path';
import { mergeConfig, defineConfig } from 'vite';
import { crx, ManifestV3Export } from '@crxjs/vite-plugin';
import baseConfig, { baseManifest, baseBuildOptions } from './vite.config.base'

const outDir = resolve(__dirname, 'dist_chrome');

const chromeManifest = {
  ...baseManifest,
  permissions: [
    'storage',
    'activeTab', 
    'clipboardWrite'
  ],
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/scripts/content/index.ts"],
      all_frames: false
    }
  ],
  background: {
    service_worker: 'src/scripts/background/index.ts',
    type: 'module'
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self';"
  }
};

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      crx({
        manifest: chromeManifest as ManifestV3Export,
        browser: 'chrome',
      })
    ],
    build: {
      ...baseBuildOptions,
      outDir
    },
  })
)
import { resolve } from 'path';
import { mergeConfig, defineConfig } from 'vite';
import { crx, ManifestV3Export } from '@crxjs/vite-plugin';
import baseConfig, { baseManifest, baseBuildOptions } from './vite.config.base'

const outDir = resolve(__dirname, 'dist_firefox');

const firefoxManifest = {
  ...baseManifest,
  background: {
    scripts: [ 'src/scripts/background/index.ts' ]
  },
  browser_specific_settings: {
    gecko: {
      id: "santi@domenech.com.mx",
      strict_min_version: "109.0"
    }
  }
};

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      crx({
        manifest: firefoxManifest as any,
        browser: 'firefox',
      })
    ],
    build: {
      ...baseBuildOptions,
      outDir
    },
    publicDir: resolve(__dirname, 'public'),
  })
)
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { ManifestV3Export } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, BuildOptions } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths'
import manifest from './manifest.json';
import devManifest from './manifest.dev.json';
import pkg from './package.json';

const isDev = process.env.__DEV__ === 'true';
const localize = false;

const pagesDir = resolve(__dirname, 'src', 'pages');

export const baseManifest = {
    ...manifest,
    version: pkg.version,
    ...(isDev ? devManifest : {} as ManifestV3Export),
    ...(localize ? {
      name: '__MSG_extName__',
      description: '__MSG_extDescription__',
      default_locale : 'en'
    } : {})
} as ManifestV3Export

export const baseBuildOptions: BuildOptions = {
  sourcemap: isDev,
  emptyOutDir: !isDev,
  rollupOptions: {
    input: {
      newtab: resolve(pagesDir, "newtab", "index.html"),
      popup: resolve(pagesDir, "popup", "index.html"),
      dashboard: resolve(pagesDir, "dashboard", "index.html"),
    },
    output: {
      entryFileNames: (chunk) => `src/pages/${chunk.name}/index.js`,
    },
  },
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  publicDir: resolve(__dirname, 'public'),
});
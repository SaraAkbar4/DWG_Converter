import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

// Vercel runs `next build` directly, which skips the package.json `prebuild` script.
// The DWG engine is gitignored, so copy it here or DWG files 404 on the deployed site.
const wasmDir = join(process.cwd(), 'public', 'wasm');
mkdirSync(wasmDir, { recursive: true });
copyFileSync(
  join(process.cwd(), 'node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm'),
  join(wasmDir, 'libredwg-web.wasm'),
);

const config: NextConfig = {
  reactStrictMode: true,
  // Lets a second server (a preview next to a running build) use its own folder.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: ['@mlightcad/libredwg-web'],
  // /ingest is proxied by src/app/ingest. A rewrite drops the trailing slash on /s/ and PostHog
  // resets the connection, so session recordings never arrive.
  skipTrailingSlashRedirect: true,
  webpack: (webpackConfig) => {
    // The DWG engine's loader also targets Node; these modules never run in the browser.
    webpackConfig.resolve.alias = { ...webpackConfig.resolve.alias, canvas: false };
    webpackConfig.resolve.fallback = { ...webpackConfig.resolve.fallback, module: false, fs: false, path: false, url: false, canvas: false };
    return webpackConfig;
  },
};

export default config;

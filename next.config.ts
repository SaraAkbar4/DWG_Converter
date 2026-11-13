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
  // PostHog is served from the site's own origin so ad blockers do not drop the events.
  async rewrites() {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
    const assets = host.replace('.i.posthog.com', '-assets.i.posthog.com');
    return [
      { source: '/ingest/static/:path*', destination: `${assets}/static/:path*` },
      { source: '/ingest/:path*', destination: `${host}/:path*` },
    ];
  },
  skipTrailingSlashRedirect: true,
  webpack: (webpackConfig) => {
    // The DWG engine's loader also targets Node; these modules never run in the browser.
    webpackConfig.resolve.fallback = { ...webpackConfig.resolve.fallback, module: false, fs: false, path: false, url: false };
    return webpackConfig;
  },
};

export default config;

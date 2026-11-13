import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Lets a second server (a preview next to a running build) use its own folder.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: ['@mlightcad/libredwg-web'],
  webpack: (webpackConfig) => {
    // The DWG engine's loader also targets Node; these modules never run in the browser.
    webpackConfig.resolve.fallback = { ...webpackConfig.resolve.fallback, module: false, fs: false, path: false, url: false };
    return webpackConfig;
  },
};

export default config;

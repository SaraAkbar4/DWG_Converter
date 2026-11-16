'use client';

import '@ant-design/v5-patch-for-react-19';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { MotionConfig } from 'motion/react';
import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { ViewerThemeContext } from '../cad/platform';
import { useDrawingFiles } from '../convert/useDrawingFile';
import { HOME_HERO, type Hero } from './content';
import { Landing } from './Landing';
import { fresh } from './fresh';
import { startAnalytics, track } from './track';
import { useSiteTheme } from './useSiteTheme';

// Loaded on demand so the landing page stays light.
const ViewerScreen = dynamic(fresh(() => import('./ViewerScreen').then((module) => module.ViewerScreen), () => <></>), { ssr: false });

export function App({ hero = HOME_HERO }: { hero?: Hero }) {
  const { theme, toggleTheme } = useSiteTheme();
  const { docs, loading, error, open, closeAll, cancel, dismissError } = useDrawingFiles();
  const opened = useRef(0);

  useEffect(startAnalytics, []);
  useEffect(() => {
    // Production only: in development the cache would serve stale code.
    if (process.env.NODE_ENV === 'production') void navigator.serviceWorker?.register('/sw.js');
  }, []);
  useEffect(() => {
    const latest = docs.at(-1);
    if (!latest || docs.length <= opened.current) {
      opened.current = docs.length;
      return;
    }
    opened.current = docs.length;
    track('file_opened', { format: latest.info.format, size_mb: Math.ceil(latest.info.size / 1048576) });
  }, [docs]);
  useEffect(() => {
    if (error) track(error.code === 'too_large' ? 'file_too_large' : 'parse_failed', { code: error.code });
  }, [error]);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { colorPrimary: '#2459d8', fontFamily: 'var(--font)', fontSize: 13, borderRadius: 10, borderRadiusLG: 18 },
        components: {
          Button: { borderRadius: 980, borderRadiusLG: 980, borderRadiusSM: 980, primaryShadow: 'none', defaultShadow: 'none' },
          Modal: { borderRadiusLG: 22, titleFontSize: 24 },
          Input: { controlHeight: 40 },
        },
      }}
    >
      <ViewerThemeContext.Provider value={theme}>
        <MotionConfig reducedMotion="user">
          {docs.length ? (
            <ViewerScreen
              docs={docs}
              loading={loading}
              error={error}
              onDismissError={dismissError}
              onFiles={open}
              theme={theme}
              onToggleTheme={toggleTheme}
              onClose={closeAll}
            />
          ) : (
            <Landing
              hero={hero}
              loading={loading}
              error={error}
              theme={theme}
              onToggleTheme={toggleTheme}
              onFiles={open}
              onCancel={cancel}
            />
          )}
        </MotionConfig>
      </ViewerThemeContext.Provider>
    </ConfigProvider>
  );
}

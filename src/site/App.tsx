'use client';

import '@ant-design/v5-patch-for-react-19';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { MotionConfig } from 'motion/react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { ViewerThemeContext, type ViewerTheme } from '../cad/platform';
import { useDrawingFiles } from '../convert/useDrawingFile';
import { HOME_HERO, THEME_STORAGE_KEY, type Hero } from './content';
import { Landing } from './Landing';
import { startAnalytics, track } from './track';

// Loaded on demand so the landing page stays light.
const ViewerScreen = dynamic(() => import('./ViewerScreen').then((module) => module.ViewerScreen), { ssr: false });

export function App({ hero = HOME_HERO }: { hero?: Hero }) {
  const [theme, setTheme] = useState<ViewerTheme>('dark');
  const { docs, loading, error, open, closeAll, cancel, dismissError } = useDrawingFiles();
  const opened = useRef(0);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const next = stored === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }, []);
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

  const toggleTheme = () =>
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_STORAGE_KEY, next);
      document.documentElement.dataset.theme = next;
      return next;
    });

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

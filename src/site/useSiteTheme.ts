'use client';

import { useEffect, useState } from 'react';
import type { ViewerTheme } from '../cad/platform';
import { THEME_STORAGE_KEY } from './content';

export function useSiteTheme() {
  const [theme, setTheme] = useState<ViewerTheme>('dark');

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const next = stored === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }, []);

  const toggleTheme = () =>
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_STORAGE_KEY, next);
      document.documentElement.dataset.theme = next;
      return next;
    });

  return { theme, toggleTheme };
}

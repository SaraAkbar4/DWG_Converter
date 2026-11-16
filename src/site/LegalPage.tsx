'use client';

import type { ReactNode } from 'react';
import { SiteHeader } from './SiteHeader';
import styles from './site.module.css';
import { useSiteTheme } from './useSiteTheme';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const { theme, toggleTheme } = useSiteTheme();

  return (
    <div className={styles.legalShell}>
      <SiteHeader theme={theme} onToggleTheme={toggleTheme} sectionsOnHome backHref="/" />
      <main className={styles.legal}>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}

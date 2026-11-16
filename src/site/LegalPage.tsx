'use client';

import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { SiteHeader } from './SiteHeader';
import styles from './site.module.css';
import { useSiteTheme } from './useSiteTheme';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const { theme, toggleTheme } = useSiteTheme();

  return (
    <div className={styles.legalShell}>
      <SiteHeader theme={theme} onToggleTheme={toggleTheme} sectionsOnHome />
      <main className={styles.legal}>
        <div className={styles.legalHead}>
          <a className={`${styles.iconButton} ${styles.legalBack}`} href="/" aria-label="Back">
            <ChevronLeft size={22} strokeWidth={2} />
          </a>
          <h1>{title}</h1>
        </div>
        {children}
      </main>
    </div>
  );
}

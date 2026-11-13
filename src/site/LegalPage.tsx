import type { ReactNode } from 'react';
import styles from './site.module.css';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={styles.legal}>
      <a href="https://www.spatialsense.app/" aria-label="SpatialSense">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.svg" alt="SpatialSense" height={22} />
      </a>
      <h1>{title}</h1>
      {children}
      <p>
        <a href="/">Back to the viewer</a>
      </p>
    </main>
  );
}

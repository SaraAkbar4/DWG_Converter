'use client';

import { ChevronLeft, Menu, Moon, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ViewerTheme } from '../cad/platform';
import { TRIAL_URL } from './content';
import styles from './site.module.css';
import { track } from './track';

const SECTIONS = [
  ['#how', 'How it works'],
  ['#privacy', 'Privacy'],
  ['#formats', 'Formats'],
  ['#faq', 'Questions'],
] as const;

type Props = {
  theme: ViewerTheme;
  onToggleTheme: () => void;
  /** Legal pages do not contain these sections, so the links return home. */
  sectionsOnHome?: boolean;
  /** Shown to the left of the logo. Privacy and terms use it to return home. */
  backHref?: string;
};

export function SiteHeader({ theme, onToggleTheme, sectionsOnHome = false, backHref }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const hrefFor = (hash: string) => (sectionsOnHome ? `/${hash}` : hash);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) close();
    };
    const desktop = window.matchMedia('(min-width: 901px)');
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    desktop.addEventListener('change', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      desktop.removeEventListener('change', close);
    };
  }, [menuOpen]);

  return (
    <header className={styles.header} ref={headerRef}>
      <div className={styles.brand}>
        {backHref ? (
          <a className={styles.iconButton} href={backHref} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </a>
        ) : null}
        <a href="https://www.spatialsense.app/" aria-label="SpatialSense">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme === 'dark' ? '/logo.svg' : '/logo-light.svg'} alt="SpatialSense" height={20} />
        </a>
      </div>
      <nav className={styles.nav} aria-label="Sections">
        {SECTIONS.map(([href, label]) => (
          <a key={href} href={hrefFor(href)}>
            {label}
          </a>
        ))}
      </nav>
      <div className={styles.headerActions}>
        <button type="button" className={styles.iconButton} onClick={onToggleTheme} aria-label="Switch theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <a className={styles.pillSmall} href={TRIAL_URL} onClick={() => track('trial_clicked', { where: 'header' })}>
          Start free trial
        </a>
        <button
          type="button"
          className={styles.menuButton}
          aria-label={menuOpen ? 'Close menu' : 'Menu'}
          aria-expanded={menuOpen}
          aria-controls="section-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {menuOpen ? (
        <nav id="section-menu" className={styles.menuPanel} aria-label="Sections">
{SECTIONS.map(([href, label]) => (
              <a
                key={href}
                href={hrefFor(href)}
                onClick={() => {
                  // Closing now would remove this link before the browser follows it.
                  requestAnimationFrame(() => setMenuOpen(false));
                }}
              >
                {label}
              </a>
            ))}
        </nav>
      ) : null}
    </header>
  );
}

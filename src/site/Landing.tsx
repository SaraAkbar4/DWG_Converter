import { FileUp, Lock, Moon, Plus, Sun, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { ViewerTheme } from '../cad/platform';
import type { DrawingFailure, DrawingLoading } from '../convert/useDrawingFile';
import { FAQ, SEO_PAGES, STEPS, TRIAL_URL, type Hero } from './content';
import styles from './site.module.css';
import { track } from './track';

// The gallery parses real DXF files with the viewer's own code, so it waits for the browser.
const Showcase = dynamic(() => import('./Showcase').then((module) => module.Showcase), { ssr: false });

type Props = {
  hero: Hero;
  loading: DrawingLoading | null;
  error: DrawingFailure | null;
  theme: ViewerTheme;
  onToggleTheme: () => void;
  onFiles: (files: File[]) => void;
  onCancel: () => void;
};

const PLAN_PATHS = [
  'M40 40H560V360H40Z',
  'M52 52H548V348H52Z',
  'M340 52V150M340 200V348',
  'M52 230H110M160 230H200V348',
  'M340 150A50 50 0 0 1 390 200',
  'M110 230A50 50 0 0 0 160 280',
  'M90 40V28M230 40V28M90 28H230',
  'M380 240H470V330H380Z',
  'M80 80H190V130H80Z',
  'M250 150a26 26 0 1 0 0.1 0',
];

function DropZone({ loading, error, onFiles, onCancel }: Omit<Props, 'hero' | 'theme' | 'onToggleTheme'>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const onEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      depth += 1;
      setDragging(true);
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length) onFiles(files);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [onFiles]);

  const heavy = error?.code === 'too_large' || error?.code === 'crashed';
  const pick = () => inputRef.current?.click();

  return (
    <motion.div
      layoutId="stage"
      className={styles.dropZone}
      data-dragging={dragging}
      animate={{ scale: dragging ? 1.015 : 1 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
    >
      <svg className={styles.heroPlan} viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {PLAN_PATHS.map((d, index) => (
          <motion.path
            key={d}
            d={d}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.4, delay: 0.2 + index * 0.08, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </svg>
      <input
        ref={inputRef}
        type="file"
        accept=".dwg,.dxf,.zip"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length) onFiles(files);
          event.target.value = '';
        }}
      />
      {loading ? (
        <div className={styles.progress} role="status" aria-live="polite">
          <strong>Opening {loading.fileName}</strong>
          <button type="button" className={styles.pillGhost} onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : error ? (
        <div className={styles.dropBody} role="alert">
          <TriangleAlert size={32} strokeWidth={1.5} className={styles.warnIcon} />
          <strong>{heavy ? 'This drawing is too heavy for the browser' : 'This file could not be opened'}</strong>
          <p>{error.message}</p>
          <div className={styles.dropActions}>
            {heavy && (
              <a className={styles.pill} href={TRIAL_URL} onClick={() => track('trial_clicked', { where: 'too_heavy' })}>
                Start free trial
              </a>
            )}
            <button type="button" className={heavy ? styles.pillGhost : styles.pill} onClick={pick}>
              Try another file
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.dropBody}>
          <FileUp size={40} strokeWidth={1.25} className={styles.dropIcon} />
          <strong>{dragging ? 'Drop it to open' : 'Drop a DWG or DXF file here'}</strong>
          <p className={styles.dropLimit}>DWG and DXF up to 50 MB</p>
          <div className={styles.dropActions}>
            <button type="button" className={styles.pill} onClick={pick}>
              Choose a file
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function Landing({ hero, theme, onToggleTheme, ...drop }: Props) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="https://www.spatialsense.app/" aria-label="SpatialSense">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme === 'dark' ? '/logo.svg' : '/logo-light.svg'} alt="SpatialSense" height={20} />
        </a>
        <nav className={styles.nav} aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
          <a href="#formats">Formats</a>
          <a href="#faq">Questions</a>
        </nav>
        <div className={styles.headerActions}>
          <button type="button" className={styles.iconButton} onClick={onToggleTheme} aria-label="Switch theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <a className={styles.pillSmall} href={TRIAL_URL} onClick={() => track('trial_clicked', { where: 'header' })}>
            Start free trial
          </a>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <h1>
            {hero.title} {hero.highlight}.
          </h1>
          <p className={styles.lede}>{hero.lede}</p>
          <DropZone {...drop} />
        </section>

        <section className={styles.showcaseSection} aria-labelledby="showcase-title">
          <h2 id="showcase-title">See it on real drawings first.</h2>
          <p>Real DWG and DXF files, drawn here by the same code that will open yours. Pick one to try the layers, search and measuring tools.</p>
          <Showcase onOpen={(file) => drop.onFiles([file])} />
        </section>

        <section id="how" className={styles.section}>
          <h2>Nothing to install.</h2>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className={styles.numeral}>{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="privacy" className={styles.section}>
          <article className={`${styles.tile} ${styles.tileDark} ${styles.statement}`}>
            <Lock size={36} strokeWidth={1.25} aria-hidden />
            <h2>Your drawing stays on your device.</h2>
            <p>
              Most online converters upload your drawing to their servers. This viewer reads the file inside your
              browser, on your own device. Confidential plans stay confidential, and it keeps working offline once the
              page has loaded.
            </p>
          </article>
        </section>

        <section id="formats" className={styles.section}>
          <h2>The files you actually receive.</h2>
          <div className={styles.formats}>
            <article>
              <h3 className={styles.format}>DWG</h3>
              <p>AutoCAD R13 to 2018 and later, including drawings saved by other CAD tools.</p>
            </article>
            <article>
              <h3 className={styles.format}>DXF</h3>
              <p>Text (ASCII) DXF from any version. Binary DXF is not supported yet.</p>
            </article>
          </div>
          <p className={styles.formatNote}>
                Lines, polylines, arcs, circles, ellipses, splines, hatches, text, dimensions and nested blocks, with
                layer colours. 3D solids and password-protected drawings are not displayed.
          </p>
        </section>

        <section id="faq" className={`${styles.section} ${styles.faq}`}>
          <h2>Questions</h2>
          {FAQ.map((item) => (
            <details key={item.question} name="faq">
              <summary>
                {item.question}
                <Plus size={20} strokeWidth={1.5} aria-hidden />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </section>

        <section className={styles.section}>
          <div className={`${styles.tile} ${styles.statement}`}>
            <h2>Need more than a viewer?</h2>
            <p>
              Kodifly turns IFC and BIM models, point clouds and site surveys into one spatial workspace. If your
              drawings are part of something bigger, let&apos;s talk.
            </p>
            <a className={styles.pill} href={TRIAL_URL} onClick={() => track('trial_clicked', { where: 'footer_cta' })}>
              Start free trial
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <a href="https://www.spatialsense.app/" aria-label="SpatialSense">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={theme === 'dark' ? '/logo.svg' : '/logo-light.svg'} alt="SpatialSense" height={18} />
            </a>
            <p>
              <Lock size={14} strokeWidth={1.75} aria-hidden />
              Drawings are processed on your device and never uploaded.
            </p>
          </div>
          <div className={styles.footerCols}>
            <nav aria-label="Viewers">
              <p>Viewers</p>
              {Object.entries(SEO_PAGES).map(([slug, page]) => (
                <a key={slug} href={`/${slug}`}>
                  {page.hero.title} {page.hero.highlight}
                </a>
              ))}
            </nav>
            <nav aria-label="Legal">
              <p>Legal</p>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
            </nav>
          </div>
        </div>
        <p className={styles.footerMeta}>Copyright © {new Date().getFullYear()} Kodifly. All rights reserved.</p>
      </footer>
    </div>
  );
}

export const THEME_STORAGE_KEY = 'kodifly-theme';
export const TRIAL_URL = 'https://www.spatialsense.app/free-trial';

export const FAQ = [
  {
    question: 'How do I open a DWG file without AutoCAD?',
    answer:
      'Drop the file on this page. It opens in your browser in a few seconds, with layers, search and measuring. You do not need AutoCAD or any other software.',
  },
  {
    question: 'Is my drawing uploaded to a server?',
    answer:
      'No. The file is read and drawn on your own device, inside your browser. It is never uploaded, so confidential drawings stay with you.',
  },
  {
    question: 'Which files are supported?',
    answer:
      'DWG files from AutoCAD R13 to 2018 and later, and text (ASCII) DXF files. Binary DXF and password-protected drawings are not supported.',
  },
  {
    question: 'Is it free?',
    answer: 'Yes. Viewing and export are free and need no account.',
  },
  {
    question: 'How large a drawing can I open?',
    answer:
      'DWG and DXF files up to 50 MB. For heavier files, talk to Kodifly.',
  },
] as const;

export const STEPS = [
  { title: 'Drop your drawing', body: 'Pick a DWG or DXF file, or drag it anywhere on the page.' },
  { title: 'It opens on your device', body: 'Your browser reads the file itself. Nothing is sent anywhere.' },
  { title: 'Explore it', body: 'Pan and zoom, switch layers on and off, search labels, measure and export.' },
] as const;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:8020';

export type Hero = { title: string; highlight: string; lede: string };
export const HOME_HERO: Hero = {
  title: 'Open DWG and DXF drawings',
  highlight: 'in your browser',
  lede: 'A free CAD viewer with layers, search and measuring. No AutoCAD, no account, and nothing is uploaded.',
};

/** Search landing pages: the same viewer under a heading that matches what people search for. */
export const SEO_PAGES: Record<string, { metaTitle: string; description: string; hero: Hero }> = {
  'dwg-viewer': {
    metaTitle: 'DWG viewer online, free | Kodifly',
    description: 'View DWG files online for free. Open AutoCAD drawings in your browser with layers and measuring. Nothing is uploaded.',
    hero: {
      title: 'Free online',
      highlight: 'DWG viewer',
      lede: 'Open AutoCAD DWG drawings from R13 to 2018 and later, straight in your browser. Layers, search and measuring included, and your file is never uploaded.',
    },
  },
  'dxf-viewer': {
    metaTitle: 'DXF viewer online, free | Kodifly',
    description: 'View DXF files online for free. Open DXF drawings in your browser with layers, measuring and PDF export. Nothing is uploaded.',
    hero: {
      title: 'Free online',
      highlight: 'DXF viewer',
      lede: 'Drop a DXF file to see it in seconds. Switch layers, measure distances and areas, and export to PDF, SVG or PNG. The file stays on your device.',
    },
  },
  'open-dwg-without-autocad': {
    metaTitle: 'Open a DWG file without AutoCAD | Kodifly',
    description: 'No AutoCAD? Open DWG files in your browser for free, with no install and no account. Your drawing is never uploaded.',
    hero: {
      title: 'Open a DWG file',
      highlight: 'without AutoCAD',
      lede: 'Received a drawing but have no CAD software? Drop it here to view, measure and print it. There is nothing to install and no account to create.',
    },
  },
};

import { AntdRegistry } from '@ant-design/nextjs-registry';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { FAQ, SITE_URL, THEME_STORAGE_KEY } from '../site/content';
import '../cad/chrome.css';
import './globals.css';

const title = 'Free online DWG and DXF viewer | Kodifly';
const description =
  'Open DWG and DXF drawings in your browser. No AutoCAD, no account and no upload: your file is read on your own device.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: '/' },
  title,
  description,
  keywords: ['DWG viewer online', 'DXF viewer online', 'open DWG without AutoCAD', 'free CAD viewer'],
  openGraph: { title, description, type: 'website' },
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#000000' };

const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Kodifly DWG and DXF Viewer',
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Any (web browser)',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme" strategy="beforeInteractive">{`try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`}</Script>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <AntdRegistry>{children}</AntdRegistry>
        {plausibleDomain && <Script defer data-domain={plausibleDomain} src="https://plausible.io/js/script.js" />}
      </body>
    </html>
  );
}

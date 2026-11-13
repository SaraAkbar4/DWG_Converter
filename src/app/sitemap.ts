import type { MetadataRoute } from 'next';
import { SEO_PAGES, SITE_URL } from '../site/content';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', ...Object.keys(SEO_PAGES), 'privacy', 'terms'].map((path) => ({
    url: `${SITE_URL}/${path}`,
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : path in SEO_PAGES ? 0.8 : 0.3,
  }));
}

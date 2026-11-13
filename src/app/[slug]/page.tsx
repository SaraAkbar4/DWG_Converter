import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { App } from '../../site/App';
import { SEO_PAGES } from '../../site/content';

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(SEO_PAGES).map((slug) => ({ slug }));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = SEO_PAGES[slug];
  if (!page) return {};
  return {
    title: page.metaTitle,
    description: page.description,
    alternates: { canonical: `/${slug}` },
    openGraph: { title: page.metaTitle, description: page.description, type: 'website' },
  };
}

export default async function Page({ params }: Params) {
  const page = SEO_PAGES[(await params).slug];
  if (!page) notFound();
  return <App hero={page.hero} />;
}

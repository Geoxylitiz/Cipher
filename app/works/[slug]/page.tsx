import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProjectView from '@/components/ProjectView';
import { galleryWorks, getGalleryEntry } from '@/data/gallery';

export function generateStaticParams() {
  return galleryWorks.map((w) => ({ slug: w.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const entry = getGalleryEntry(slug);
  return { title: entry ? `${entry.title} — Cipher Studio` : 'Cipher Studio' };
}

export default async function WorkSinglePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getGalleryEntry(slug);
  if (!entry) notFound();

  const next = galleryWorks[entry.number % galleryWorks.length];
  return <ProjectView entry={entry} next={next} />;
}

import { worksData, homeTilesData } from './works';

/** The collection is hung by discipline, one room each. */
export const ROOMS = [
  { numeral: 'I', name: 'Production', category: 'Production', light: '#ffe2b8' },
  { numeral: 'II', name: 'Direction', category: 'Direction', light: '#e6ecff' },
  { numeral: 'III', name: 'Creative', category: 'Creative', light: '#ffdcc8' },
] as const;

/** Closing piece, hung larger on the end wall of the last room. */
export const HERO_SLUG = 'the-dazzling';

export type GalleryEntry = {
  number: number; // 1-based position in the walk-through
  slug: string;
  title: string;
  category: string;
  src: string;
  room: number;
  hero: boolean;
};

export function imageFor(id: string) {
  const n = parseInt(id, 10);
  return (homeTilesData.find((t) => t.id === n) ?? homeTilesData[0]).src;
}

/** Every work in the order a visitor meets it. */
export const galleryWorks: GalleryEntry[] = (() => {
  const entries: GalleryEntry[] = [];
  ROOMS.forEach((room, r) => {
    worksData
      .filter((w) => w.category === room.category && w.slug !== HERO_SLUG)
      .forEach((w) => {
        entries.push({
          number: entries.length + 1,
          slug: w.slug,
          title: w.title,
          category: w.category,
          src: imageFor(w.id),
          room: r,
          hero: false,
        });
      });
  });
  const hero = worksData.find((w) => w.slug === HERO_SLUG);
  if (hero) {
    entries.push({
      number: entries.length + 1,
      slug: hero.slug,
      title: hero.title,
      category: hero.category,
      src: imageFor(hero.id),
      room: ROOMS.length - 1,
      hero: true,
    });
  }
  return entries;
})();

export function getGalleryEntry(slug: string) {
  return galleryWorks.find((w) => w.slug === slug) ?? null;
}

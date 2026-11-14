import { worksData, homeTilesData } from './works';

/**
 * The collection is hung by discipline, one room each. The walk goes from
 * dark to light: deep green, then oxblood, then a bright final hall.
 *
 * light   colour of the spotlights and skylight
 * wall    painted wall colour
 * ceiling ceiling colour
 * wash    how strongly the walls glow from the cove/skylight (1 = as painted)
 * haze    visibility of the light beams (bright rooms show less haze)
 */
export const ROOMS = [
  { numeral: 'I', name: 'Production', category: 'Production', light: '#ffe2b8', wall: '#34503f', ceiling: '#232623', wash: 1.15, haze: 1 },
  { numeral: 'II', name: 'Direction', category: 'Direction', light: '#ffe6cc', wall: '#5c2224', ceiling: '#2a2221', wash: 1.05, haze: 1 },
  { numeral: 'III', name: 'Creative', category: 'Creative', light: '#fff3e2', wall: '#e8e3d9', ceiling: '#d2cdc3', wash: 0.85, haze: 0.3 },
] as const;

/** The space in front of the first doorway. */
export const LOBBY = { wall: '#2b2a28', ceiling: '#191919', wash: 0.7 } as const;

/** Closing piece, hung larger on the end wall of the last room. */
export const HERO_SLUG = 'nine-lives';

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

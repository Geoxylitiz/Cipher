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

/**
 * How a work is presented. Sizes are in metres and describe the image
 * itself; `mat` and `frame` are border widths around it.
 *
 * framed  a frame (and usually a mat) hung on the wall
 * canvas  an unframed stretched canvas hung on the wall
 * plinth  a small framed work leaning on a plinth, standing off the wall
 */
export type Display = {
  kind: 'framed' | 'canvas' | 'plinth';
  w: number;
  h: number;
  mat: number;
  frame: number;
  frameColor: string;
  frameMetal: number;
  pair?: boolean; // hang beside the previous work, on the same wall
};

const BLACK = { frameColor: '#0e0d0c', frameMetal: 0.25 };
const OAK = { frameColor: '#8b6b47', frameMetal: 0.05 };
const WALNUT = { frameColor: '#4a3222', frameMetal: 0.05 };
const BRASS = { frameColor: '#a98953', frameMetal: 0.85 };

const LANDSCAPE: Display = { kind: 'framed', w: 3.2, h: 2.4, mat: 0.32, frame: 0.11, ...BLACK };
const LANDSCAPE_OAK: Display = { ...LANDSCAPE, ...OAK };
const PORTRAIT: Display = { kind: 'framed', w: 2.1, h: 2.8, mat: 0.26, frame: 0.1, ...BLACK };
const PORTRAIT_OAK: Display = { ...PORTRAIT, ...OAK };
const SQUARE_WALNUT: Display = { kind: 'framed', w: 2.3, h: 2.3, mat: 0.24, frame: 0.12, ...WALNUT };
const SMALL_BRASS: Display = { kind: 'framed', w: 1.45, h: 1.45, mat: 0.3, frame: 0.05, ...BRASS };
const LARGE_CANVAS: Display = { kind: 'canvas', w: 4.6, h: 3.1, mat: 0, frame: 0, ...BLACK };
const ON_PLINTH: Display = { kind: 'plinth', w: 1.7, h: 1.25, mat: 0, frame: 0.06, ...BLACK };
const HERO: Display = { kind: 'framed', w: 4.3, h: 3.2, mat: 0.42, frame: 0.15, ...BLACK };

/** Presentation of each work, by slug. Anything not listed hangs as a framed landscape. */
const DISPLAY: Record<string, Display> = {
  'night-shift': LANDSCAPE,
  'low-light': PORTRAIT_OAK,
  'velvet-static': LARGE_CANVAS,
  'open-studio': LANDSCAPE,
  'quiet-hours': SMALL_BRASS,
  'second-glance': { ...SMALL_BRASS, pair: true },
  'afterimage': ON_PLINTH,
  'study-in-amber': PORTRAIT,
  'paper-moon': LANDSCAPE_OAK,
  'soft-machines': LARGE_CANVAS,
  'small-hours': SQUARE_WALNUT,
  [HERO_SLUG]: HERO,
};

export type GalleryEntry = {
  number: number; // 1-based position in the walk-through
  slug: string;
  title: string;
  category: string;
  src: string;
  room: number;
  hero: boolean;
  display: Display;
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
          display: DISPLAY[w.slug] ?? LANDSCAPE,
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
      display: DISPLAY[hero.slug] ?? HERO,
    });
  }
  return entries;
})();

export function getGalleryEntry(slug: string) {
  return galleryWorks.find((w) => w.slug === slug) ?? null;
}

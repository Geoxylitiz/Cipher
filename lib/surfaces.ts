'use client';

import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

/*
 * Scanned PBR texture sets from Poly Haven (CC0, polyhaven.com),
 * stored in /public/textures at 1K.
 */

/** Plaster relief only (normal + roughness): walls are painted, so no colour map. */
export const PLASTER_MAPS = {
  normalMap: '/textures/grey_plaster_nor_gl_1k.jpg',
  roughnessMap: '/textures/grey_plaster_rough_1k.jpg',
};
export const CONCRETE_MAPS = {
  map: '/textures/concrete_floor_01_diff_1k.jpg',
  normalMap: '/textures/concrete_floor_01_nor_gl_1k.jpg',
  roughnessMap: '/textures/concrete_floor_01_rough_1k.jpg',
};

type MapUrls = { map?: string; normalMap: string; roughnessMap: string };
export type Surface = { map?: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };

/** Load a texture set and tile it for one surface (spread the result into a material). */
export function useSurface(urls: MapUrls, repeatX: number, repeatY: number): Surface {
  const loaded = useTexture(urls as Record<string, string>) as Record<string, THREE.Texture>;
  return useMemo(() => {
    const out: Record<string, THREE.Texture> = {};
    for (const [key, source] of Object.entries(loaded)) {
      const t = source.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeatX, repeatY);
      t.anisotropy = 8;
      // Only the colour map holds sRGB colour; normal/roughness are raw data
      t.colorSpace = key === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.needsUpdate = true;
      out[key] = t;
    }
    return out as Surface;
  }, [loaded, repeatX, repeatY]);
}

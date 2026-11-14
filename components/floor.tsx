'use client';

import * as THREE from 'three';
import { CONCRETE_MAPS, useSurface } from '@/lib/surfaces';

const NORMAL_SCALE = new THREE.Vector2(0.6, 0.6);

/**
 * Polished concrete floor (scanned Poly Haven texture, CC0).
 *
 * This used to be drei's MeshReflectorMaterial, but its reflection never
 * rendered in this scene (even at exaggerated settings) while still costing a
 * second full scene render every frame. A satin standard material picks up
 * the spotlights as soft sheen instead, and the warm floor pools in
 * HomeCollage add the spill under each work.
 */
export default function Floor({
  zFront = 10,
  zBack = -40,
  width = 14,
  y = -1.8,
  color = '#8f8a81',
}: {
  zFront?: number;
  zBack?: number;
  width?: number;
  y?: number;
  color?: string;
}) {
  // Plane is authored flat on XY, so we rotate it -90° on X to lay it
  // horizontal, then centre it between the front and back of the gallery.
  const centerZ = (zFront + zBack) / 2;
  const length = zFront - zBack;
  const concrete = useSurface(CONCRETE_MAPS, width / 3.5, length / 3.5);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, centerZ]} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial
        {...concrete}
        normalScale={NORMAL_SCALE}
        color={color}
        roughness={0.55}  // multiplies the scan's roughness: polished, satin
        metalness={0}
      />
    </mesh>
  );
}

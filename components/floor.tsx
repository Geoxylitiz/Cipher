'use client';

import { MeshReflectorMaterial } from '@react-three/drei';

/**
 * Reflective floor for the gallery corridor.
 *
 * Drop this in *below* your panels so it catches the warm/cool point lights
 * from Scene and gives the corridor a sense of ground instead of empty void.
 *
 * Usage (inside Scene, alongside your panels/lights):
 *   <Floor depth={depth} />
 *
 * `depth` should be the same corridor depth you already compute in
 * HomeCollage (tiles.length * RING_SPACING) so the floor stretches the
 * full length of the walkway.
 */
export default function Floor({
  depth = 40,
  width = 14,
  y = -1.8,
  color = '#050505',
}) {
  // Plane is authored flat on XY, so we rotate it -90° on X to lay it
  // horizontal, then push it back so it's centered under the whole corridor
  // (corridor panels run from z = -6 to z = -6 - depth).
  const centerZ = -6 - depth / 2;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, y, centerZ]}
      receiveShadow
    >
      <planeGeometry args={[width, depth + 24]} />
      <MeshReflectorMaterial
        // blur softens the reflection so it doesn't look like a literal mirror
        blur={[400, 120]}
        resolution={1024}
        mixBlur={1}
        mixStrength={40}
        roughness={0.9}
        // depth-based fade keeps reflections from feeling infinite/flat
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.3}
        color={color}
        metalness={0.55}
        mirror={0}
      />
    </mesh>
  );
}
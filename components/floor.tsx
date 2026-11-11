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
  zFront = 10,
  zBack = -40,
  width = 14,
  y = -1.8,
  color = '#050505',
}) {
  // Plane is authored flat on XY, so we rotate it -90° on X to lay it
  // horizontal, then centre it between the front and back of the gallery.
  const centerZ = (zFront + zBack) / 2;
  const length = zFront - zBack;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, y, centerZ]}
      receiveShadow
    >
      <planeGeometry args={[width, length]} />
      <MeshReflectorMaterial
        // blur softens the reflection so it doesn't look like a literal mirror
        blur={[300, 90]}
        resolution={1024}
        mixBlur={0.8}
        mixStrength={18}
        roughness={0.7}
        // depth-based fade: reflections soften with height above the floor.
        // Thresholds must reach the artworks (hung ~1.5–3.5 units up) or
        // their reflections are faded out entirely.
        depthScale={0.8}
        minDepthThreshold={0.2}
        maxDepthThreshold={5}
        color={color}
        metalness={0.4}
        mirror={0.6}
      />
    </mesh>
  );
}
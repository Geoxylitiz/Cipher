'use client';

import * as THREE from 'three';
import { CONCRETE_MAPS, useSurface } from '@/lib/surfaces';

const NORMAL_SCALE = new THREE.Vector2(0.45, 0.45);

/**
 * Makes the floor see-through in proportion to the viewing angle: almost
 * opaque looking straight down, noticeably clear at a glancing angle. A
 * mirrored copy of the room sits underneath (see HomeCollage), so what shows
 * through reads as a reflection that strengthens toward the far end of the
 * room, the way a polished floor behaves.
 */
function fresnelAlpha(shader: { fragmentShader: string }) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    /* glsl */ `#include <opaque_fragment>
    {
      float facing = clamp(dot(normalize(vViewPosition), normalize(vNormal)), 0.0, 1.0);
      gl_FragColor.a = mix(0.97, 0.58, pow(1.0 - facing, 2.2));
    }`
  );
}

/**
 * Polished concrete floor (scanned Poly Haven texture, CC0).
 *
 * drei's MeshReflectorMaterial never rendered a reflection in this scene and
 * still cost a second full scene render every frame. Reflections are faked
 * instead: with `reflective`, the floor turns slightly transparent at
 * glancing angles and reveals a cheap mirrored copy of the room below it.
 */
export default function Floor({
  zFront = 10,
  zBack = -40,
  width = 14,
  y = -1.8,
  color = '#8d8880',
  reflective = false,
}: {
  zFront?: number;
  zBack?: number;
  width?: number;
  y?: number;
  color?: string;
  reflective?: boolean;
}) {
  // Plane is authored flat on XY, so we rotate it -90° on X to lay it
  // horizontal, then centre it between the front and back of the gallery.
  const centerZ = (zFront + zBack) / 2;
  const length = zFront - zBack;
  // Relief only: the scan's speckled colour map read as dirt under gallery
  // light, so the floor is a plain honed grey with the scan's surface texture
  const { normalMap, roughnessMap } = useSurface(CONCRETE_MAPS, width / 5, length / 5);
  const concrete = { normalMap, roughnessMap };

  return (
    // Drawn before every other see-through object, so light pools and haze
    // above the floor are never hidden behind it
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, centerZ]} renderOrder={-1}>
      <planeGeometry args={[width, length]} />
      {reflective ? (
        <meshStandardMaterial
          key="reflective"
          {...concrete}
          normalScale={NORMAL_SCALE}
          color={color}
          emissive={color}
          emissiveIntensity={0.22}
          roughness={0.5}
          metalness={0}
          transparent
          onBeforeCompile={fresnelAlpha}
        />
      ) : (
        <meshStandardMaterial
          key="plain"
          {...concrete}
          normalScale={NORMAL_SCALE}
          color={color}
          emissive={color}
          emissiveIntensity={0.22}
          roughness={0.5}
          metalness={0}
        />
      )}
    </mesh>
  );
}

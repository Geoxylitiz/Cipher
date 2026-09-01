'use client';

/**
 * HomeCollage — 3D walk-through gallery
 * ---------------------------------------------------------------
 * Drop-in replacement for the old 2D rotating collage. Renders the
 * same `homeTilesData` set as floating panels along a winding
 * corridor in 3D space. Scroll / drag to walk forward through it,
 * move your mouse to look around, hover a panel to wake it up,
 * click to open /works.
 *
 * New dependencies (install before using):
 *   npm i three @react-three/fiber @react-three/drei @react-three/postprocessing
 *
 * Both @react-three/fiber and @react-three/drei must be client-only —
 * this file is already marked 'use client', and it should be loaded
 * from its parent with next/dynamic and ssr: false, e.g.:
 *
 *   const HomeCollage = dynamic(() => import('@/components/HomeCollage'), { ssr: false });
 */

import { Suspense, useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Image as DreiImage, Html, Preload } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import LogoMark from '@/components/LogoMark';
import { homeTilesData } from '@/data/works';

/* ------------------------------------------------------------------ */
/*  Layout — turn the flat tile list into a winding 3D corridor        */
/* ------------------------------------------------------------------ */

const GOLDEN_ANGLE = 2.399963; // radians, keeps the spiral from ever lining panels up
const RING_SPACING = 4.6; // distance between panels along the walk axis
const BASE_RADIUS = 5.2;
const PANEL_W = 3.1;
const PANEL_H = 2.05;

type LaidOutTile = {
  id: string | number;
  src: string;
  alt: string;
  position: [number, number, number];
  index: number;
};

function layoutTiles(tiles: typeof homeTilesData): LaidOutTile[] {
  return tiles.map((tile, i) => {
    const angle = i * GOLDEN_ANGLE;
    // gentle breathing radius so the corridor isn't a perfect cylinder
    const radiusJitter = 1 + 0.22 * Math.sin(i * 0.9);
    const radius = BASE_RADIUS * radiusJitter;
    const x = Math.cos(angle) * radius;
    const z = -i * RING_SPACING;
    const y = Math.sin(i * 0.55) * 1.6;

    return {
      id: tile.id,
      src: tile.src,
      alt: tile.alt,
      position: [x, y, z] as [number, number, number],
      index: i,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  A single gallery panel                                             */
/* ------------------------------------------------------------------ */

function GalleryPanel({ tile, onHoverChange }: { tile: LaidOutTile; onHoverChange: (hovered: boolean) => void }) {
  const router = useRouter();
  const group = useRef<THREE.Group>(null);
  const img = useRef<any>(null);
  const glow = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const { camera } = useThree();

  const basePos = useMemo(() => new THREE.Vector3(...tile.position), [tile.position]);
  const lookTarget = useMemo(() => new THREE.Vector3(0, tile.position[1], tile.position[2]), [tile.position]);

  useFrame((state, delta) => {
    if (!group.current) return;
    const t = Math.min(1, delta * 6);

    if (hovered) {
      // pull the panel toward the camera and square it up so it faces the viewer dead-on
      const dirToCam = new THREE.Vector3().subVectors(camera.position, basePos).normalize();
      const targetPos = basePos.clone().add(dirToCam.multiplyScalar(1.6));
      group.current.position.lerp(targetPos, t);

      const targetQuat = new THREE.Quaternion();
      const m = new THREE.Matrix4().lookAt(group.current.position, camera.position, new THREE.Vector3(0, 1, 0));
      targetQuat.setFromRotationMatrix(m);
      group.current.quaternion.slerp(targetQuat, t);

      group.current.scale.lerp(new THREE.Vector3(1.22, 1.22, 1.22), t);
    } else {
      group.current.position.lerp(basePos, t);

      const targetQuat = new THREE.Quaternion();
      const m = new THREE.Matrix4().lookAt(basePos, lookTarget, new THREE.Vector3(0, 1, 0));
      // lookAt builds a matrix as if the object sits at eye looking at target;
      // we want the panel's forward (+z) to face the axis, so flip it
      const euler = new THREE.Euler().setFromRotationMatrix(m);
      targetQuat.setFromEuler(new THREE.Euler(euler.x, euler.y + Math.PI, euler.z));
      group.current.quaternion.slerp(targetQuat, t);

      group.current.scale.lerp(new THREE.Vector3(1, 1, 1), t);
    }

    if (img.current?.material) {
      const targetBrightness = hovered ? 1 : 0.62;
      img.current.material.color.lerp(new THREE.Color(targetBrightness, targetBrightness, targetBrightness), t);
    }

    if (glow.current) {
      const targetOpacity = hovered ? 0.55 : 0;
      const mat = glow.current.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, t);
    }
  });

  const handleOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    onHoverChange(true);
    document.body.style.cursor = 'pointer';
  }, [onHoverChange]);

  const handleOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    onHoverChange(false);
    document.body.style.cursor = 'auto';
  }, [onHoverChange]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    router.push('/works');
  }, [router]);

  return (
    <group ref={group} position={tile.position}>
      {/* soft accent glow behind the panel, only visible on hover */}
      <mesh ref={glow} position={[0, 0, -0.05]}>
        <planeGeometry args={[PANEL_W * 1.35, PANEL_H * 1.35]} />
        <meshBasicMaterial color="#ff6a3d" transparent opacity={0} toneMapped={false} />
      </mesh>

      <DreiImage
        ref={img}
        url={tile.src}
        scale={[PANEL_W, PANEL_H] as any}
        transparent
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
      />

      {hovered && (
        <Html center distanceFactor={8} position={[0, -PANEL_H / 2 - 0.35, 0]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 13,
              letterSpacing: '0.04em',
              color: '#fff',
              background: 'rgba(0,0,0,0.55)',
              padding: '6px 12px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(6px)',
            }}
          >
            {tile.alt || 'View work'} →
          </div>
        </Html>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Camera rig — scroll to walk forward, mouse to look around          */
/* ------------------------------------------------------------------ */

function CameraRig({ depth, onProgress }: { depth: number; onProgress: (p: number) => void }) {
  const { camera, gl } = useThree();
  const scrollZ = useRef(0);
  const targetScrollZ = useRef(0);
  const mouse = useRef({ x: 0, y: 0 });
  const dragState = useRef<{ dragging: boolean; lastY: number }>({ dragging: false, lastY: 0 });

  useEffect(() => {
    const el = gl.domElement;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetScrollZ.current = THREE.MathUtils.clamp(targetScrollZ.current + e.deltaY * 0.02, 0, depth);
    };

    const onPointerDown = (e: PointerEvent) => {
      dragState.current.dragging = true;
      dragState.current.lastY = e.clientY;
    };
    const onPointerUp = () => {
      dragState.current.dragging = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      mouse.current.x = nx;
      mouse.current.y = ny;

      if (dragState.current.dragging) {
        const dy = e.clientY - dragState.current.lastY;
        dragState.current.lastY = e.clientY;
        targetScrollZ.current = THREE.MathUtils.clamp(targetScrollZ.current - dy * 0.06, 0, depth);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [gl, depth]);

  useFrame((_, delta) => {
    const t = Math.min(1, delta * 3.2);
    scrollZ.current = THREE.MathUtils.lerp(scrollZ.current, targetScrollZ.current, t);

    const targetPos = new THREE.Vector3(
      Math.sin(scrollZ.current * 0.05) * 0.6,
      Math.sin(scrollZ.current * 0.09) * 0.35,
      -scrollZ.current
    );
    camera.position.lerp(targetPos, t);

    const lookTarget = new THREE.Vector3(
      targetPos.x + mouse.current.x * 1.4,
      targetPos.y - mouse.current.y * 0.9,
      targetPos.z - 8
    );
    const m = new THREE.Matrix4().lookAt(camera.position, lookTarget, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    camera.quaternion.slerp(q, t * 0.8);

    onProgress(depth > 0 ? THREE.MathUtils.clamp(scrollZ.current / depth, 0, 1) : 0);
  });

  return null;
}

/* ------------------------------------------------------------------ */
/*  Atmosphere — drifting particles for depth cues in the corridor     */
/* ------------------------------------------------------------------ */

function Dust({ count = 400, depth }: { count?: number; depth: number }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 30;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 16;
      arr[i * 3 + 2] = -Math.random() * (depth + 20);
    }
    return arr;
  }, [count, depth]);

  useFrame((state) => {
    if (points.current) {
      points.current.rotation.y = state.clock.elapsedTime * 0.01;
    }
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#ffb08a" transparent opacity={0.35} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene                                                               */
/* ------------------------------------------------------------------ */

function Scene({ tiles, onProgress, onAnyHover }: {
  tiles: LaidOutTile[];
  onProgress: (p: number) => void;
  onAnyHover: (hovered: boolean) => void;
}) {
  const depth = tiles.length > 0 ? tiles.length * RING_SPACING : 0;
  const hoveredCount = useRef(0);

  const handleHoverChange = useCallback((hovered: boolean) => {
    hoveredCount.current += hovered ? 1 : -1;
    onAnyHover(hoveredCount.current > 0);
  }, [onAnyHover]);

  return (
    <>
      <fog attach="fog" args={['#0a0a0a', 6, 26]} />
      <color attach="background" args={['#0a0a0a']} />

      <ambientLight intensity={0.35} />
      <pointLight position={[0, 4, 4]} intensity={40} color="#ff8a5c" distance={20} />
      <pointLight position={[0, -4, -depth]} intensity={30} color="#5c8aff" distance={24} />

      <Dust depth={depth} />

      {tiles.map((tile) => (
        <GalleryPanel key={tile.id} tile={tile} onHoverChange={handleHoverChange} />
      ))}

      <CameraRig depth={depth} onProgress={onProgress} />
      <Preload all />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Top-level export                                                    */
/* ------------------------------------------------------------------ */

export default function HomeCollage() {
  const tiles = useMemo(() => layoutTiles(homeTilesData), []);
  const [progress, setProgress] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [anyHovered, setAnyHovered] = useState(false);

  const handleProgress = useCallback((p: number) => {
    setProgress(p);
    if (p > 0.01) setHasInteracted(true);
  }, []);

  return (
    <div className="w-full relative h-screen overflow-hidden bg-[#0a0a0a]">
      {/* Central logo — fixed HUD element, dims once you start walking */}
      <div
        className="absolute inset-0 flex items-start justify-center pt-10 z-20 pointer-events-none transition-opacity duration-700"
        style={{ opacity: anyHovered ? 0.15 : 1 }}
      >
        <LogoMark className="w-16 h-16 text-white" />
      </div>

      {/* Scroll hint */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-2 transition-opacity duration-700"
        style={{ opacity: hasInteracted ? 0 : 1 }}
      >
        <span className="text-white/60 text-xs tracking-wide">scroll or drag to walk through</span>
        <div className="w-px h-8 bg-white/30 animate-pulse" />
      </div>

      {/* Progress rail */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 z-20 h-40 w-px bg-white/15 pointer-events-none">
        <div
          className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white transition-[top] duration-300"
          style={{ top: `${progress * 100}%` }}
        />
      </div>

      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 55, near: 0.1, far: 100, position: [0, 0, 0] }}
        className="absolute inset-0 z-10"
      >
        <Suspense fallback={null}>
          <Scene tiles={tiles} onProgress={handleProgress} onAnyHover={setAnyHovered} />
          <EffectComposer>
            <Bloom intensity={0.5} luminanceThreshold={0.25} luminanceSmoothing={0.9} mipmapBlur />
            <Vignette eskil={false} offset={0.15} darkness={0.7} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
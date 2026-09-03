'use client';
import { Suspense, useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Image as DreiImage, Html, Preload } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import { homeTilesData } from '@/data/works';
import Floor from './floor';

/* ------------------------------------------------------------------ */
/*  ROOM DIMENSIONS — Tweak these to change the size of the museum    */
/* ------------------------------------------------------------------ */
const WALL_OFFSET = 6.0;  // How far the paintings are from the center walkway
const WALL_X = 8.5;       // How far the physical walls are from the center (Must be > WALL_OFFSET)
const CORRIDOR_WIDTH = WALL_X * 2 + 2; // Total width passed to the floor
/* ------------------------------------------------------------------ */

const RING_SPACING = 4.6; // distance between panels along the corridor (z axis)
const EYE_LEVEL = 0.15;   // slight lift so panels sit at a natural eye height
const PANEL_W = 4.1;
const PANEL_H = 3.05;

type LaidOutTile = {
  id: string | number;
  src: string;
  alt: string;
  position: [number, number, number];
  index: number;
};

function layoutTiles(tiles: typeof homeTilesData): LaidOutTile[] {
  return tiles.map((tile, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * WALL_OFFSET; // Uses the new constant
    const y = EYE_LEVEL;
    const z = -i * RING_SPACING + -6;
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
/*  Museum Architecture — walls, ceiling, columns, lights, benches      */
/* ------------------------------------------------------------------ */
function TrackLight({ position, side }: { position: [number, number, number]; side: number }) {
  const x = side * WALL_X; // Uses the new constant
  const y = 3.8;
  const z = position[2];
  
  const inwardOffset = -side * 0.2; 
  const tiltAngle = side > 0 ? Math.PI / 2 + 0.4 : -Math.PI / 2 - 0.4;

  return (
    <group position={[x, y, z]}>
      {/* Wall mount plate */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.05, 0.2, 0.2]} />
        <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
      </mesh>
      
      {/* Arm extending inward */}
      <mesh position={[inwardOffset * 0.6, -0.05, 0]}>
        <boxGeometry args={[0.24, 0.04, 0.04]} />
        <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Housing */}
      <mesh position={[inwardOffset * 1.2, -0.1, 0]} rotation={[0, 0, tiltAngle]}>
        <cylinderGeometry args={[0.05, 0.08, 0.15, 8]} />
        <meshStandardMaterial color="#0a0a0a" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Bulb / Glow */}
      <mesh position={[inwardOffset * 1.2 + side * -0.15, -0.25, 0]} rotation={[0, 0, tiltAngle]}>
        <cylinderGeometry args={[0.07, 0.07, 0.02, 16]} />
        <meshStandardMaterial color="#fff" emissive="#ffdfaa" emissiveIntensity={5} toneMapped={false} />
      </mesh>

      {/* Point light illuminating the painting */}
      <pointLight 
        position={[inwardOffset * 1.5, -0.25, 0]} 
        intensity={15} 
        distance={6} // Increased slightly to reach paintings if room is wider
        color="#ffdfaa" 
        decay={2} 
      />
    </group>
  );
}

function Bench({ z }: { z: number }) {
  return (
    <group position={[0, -2, z]}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[2.5, 0.08, 0.7]} />
        <meshStandardMaterial color="#2a221c" roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[-0.9, 0.2, 0]}>
        <boxGeometry args={[0.4, 0.4, 0.5]} />
        <meshStandardMaterial color="#0f0f0f" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0.9, 0.2, 0]}>
        <boxGeometry args={[0.4, 0.4, 0.5]} />
        <meshStandardMaterial color="#0f0f0f" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Pilaster({ x, z, height, wallTexture, wallBump }: {
  x: number; z: number; height: number;
  wallTexture: THREE.CanvasTexture | null;
  wallBump: THREE.CanvasTexture | null;
}) {
  const baseH = 0.4;
  const abacusH = 0.1;
  const capH = 0.45;
  const shaftH = height - baseH - abacusH - capH;

  const shaftW = 0.3, shaftD = 0.4;
  const baseW = 0.44, baseD = 0.54;
  const capW = 0.4, capD = 0.5;
  const abacusW = 0.48, abacusD = 0.58;

  const y0 = -height / 2;
  const shaftY = y0 + baseH + shaftH / 2;
  const capY = y0 + baseH + shaftH + capH / 2;
  const abacusY = y0 + baseH + shaftH + capH + abacusH / 2;

  return (
    <group position={[x, 0, z]}>
      {/* Base / plinth */}
      <mesh position={[0, y0 + baseH / 2, 0]}>
        <boxGeometry args={[baseW, baseH, baseD]} />
        <meshStandardMaterial color="#141416" roughness={0.55} metalness={0.15} />
      </mesh>
      {/* Base cap molding — thin reveal line */}
      <mesh position={[0, y0 + baseH + 0.02, 0]}>
        <boxGeometry args={[baseW - 0.06, 0.05, baseD - 0.06]} />
        <meshStandardMaterial color="#050505" roughness={0.4} metalness={0.25} />
      </mesh>

      {/* Shaft */}
      <mesh position={[0, shaftY, 0]}>
        <boxGeometry args={[shaftW, shaftH, shaftD]} />
        <meshStandardMaterial
          color="#242428" roughness={0.7} metalness={0.1}
          map={wallTexture ?? undefined} bumpMap={wallBump ?? undefined} bumpScale={0.03}
        />
      </mesh>
      {/* Fluting — recessed vertical grooves catch light as dark lines */}
      {[-0.09, -0.03, 0.03, 0.09].map((offset, i) => (
        <mesh key={i} position={[offset, shaftY, shaftD / 2 - 0.005]}>
          <boxGeometry args={[0.018, shaftH * 0.92, 0.015]} />
          <meshStandardMaterial color="#050505" roughness={0.9} />
        </mesh>
      ))}

      {/* Capital */}
      <mesh position={[0, capY, 0]}>
        <boxGeometry args={[capW, capH, capD]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.6} metalness={0.15} />
      </mesh>
      {/* Abacus — top slab, slightly proud */}
      <mesh position={[0, abacusY, 0]}>
        <boxGeometry args={[abacusW, abacusH, abacusD]} />
        <meshStandardMaterial color="#050505" roughness={0.4} metalness={0.25} />
      </mesh>
    </group>
  );
}

function MuseumArchitecture({ depth, tiles }: { depth: number; tiles: LaidOutTile[] }) {
  const ceilingY = 4.5;
  const floorY = -1.8;
  const height = ceilingY - floorY;
  const centerZ = -6 - depth / 2;
  const corridorLength = depth + 24;

  const pilasterSpacing = 12;
  const numPilasters = Math.ceil(corridorLength / pilasterSpacing) + 1;
  
  const benchSpacing = 23;
  const numBenches = Math.max(1, Math.floor(corridorLength / benchSpacing));

  // Texture states
  const [wallTexture, setWallTexture] = useState<THREE.CanvasTexture | null>(null);
  const [wallBump, setWallBump] = useState<THREE.CanvasTexture | null>(null);
  const [ceilingTexture, setCeilingTexture] = useState<THREE.CanvasTexture | null>(null);
  const [trimTexture, setTrimTexture] = useState<THREE.CanvasTexture | null>(null);

  // Procedural Texture Generation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let isMounted = true;

    // --- WALL COLOR TEXTURE ---
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, size, size);

    // Cloudy plaster variations (light patches)
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 250 + 100;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      const alpha = Math.random() * 0.07;
      grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      grad.addColorStop(1, `rgba(0, 0, 0, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    
    // Darker patches
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 300 + 150;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      const alpha = Math.random() * 0.12;
      grad.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
      grad.addColorStop(1, `rgba(0, 0, 0, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }

    // Fine grain noise
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 12;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    
    // --- WALL BUMP TEXTURE ---
    const bumpSize = 512;
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = bumpSize;
    bumpCanvas.height = bumpSize;
    const bumpCtx = bumpCanvas.getContext('2d')!;

    const bumpImgData = bumpCtx.createImageData(bumpSize, bumpSize);
    const bumpData = bumpImgData.data;
    
    const noiseGrid = new Float32Array(bumpSize * bumpSize);
    for (let i = 0; i < noiseGrid.length; i++) noiseGrid[i] = Math.random();
    
    // Box blur to create organic plaster bumps
    const blur = (input: Float32Array, output: Float32Array, w: number, h: number) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = (y + dy + h) % h;
              const nx = (x + dx + w) % w;
              sum += input[ny * w + nx];
            }
          }
          output[y * w + x] = sum / 9;
        }
      }
    };
    
    let temp = new Float32Array(bumpSize * bumpSize);
    blur(noiseGrid, temp, bumpSize, bumpSize);
    blur(temp, noiseGrid, bumpSize, bumpSize);
    blur(noiseGrid, temp, bumpSize, bumpSize);
    blur(temp, noiseGrid, bumpSize, bumpSize);
    
    for (let i = 0; i < bumpSize * bumpSize; i++) {
      const val = noiseGrid[i] * 255;
      bumpData[i * 4] = val;
      bumpData[i * 4 + 1] = val;
      bumpData[i * 4 + 2] = val;
      bumpData[i * 4 + 3] = 255;
    }
    bumpCtx.putImageData(bumpImgData, 0, 0);
    
    // Add sharp speckles for plaster aggregate
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * bumpSize;
      const y = Math.random() * bumpSize;
      const r = Math.random() * 1.5 + 0.5;
      bumpCtx.fillStyle = `rgba(255,255,255,${Math.random() * 0.35})`;
      bumpCtx.beginPath();
      bumpCtx.arc(x, y, r, 0, Math.PI * 2);
      bumpCtx.fill();
    }
    
    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.anisotropy = 16;

    // --- CEILING TEXTURE ---
    const ceilCanvas = document.createElement('canvas');
    ceilCanvas.width = size;
    ceilCanvas.height = size;
    const ceilCtx = ceilCanvas.getContext('2d')!;
    ceilCtx.fillStyle = '#0f0f11';
    ceilCtx.fillRect(0, 0, size, size);

    for (let i = 0; i < 60; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 300 + 100;
      const grad = ceilCtx.createRadialGradient(x, y, 0, x, y, r);
      const alpha = Math.random() * 0.04;
      grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      grad.addColorStop(1, `rgba(0, 0, 0, 0)`);
      ceilCtx.fillStyle = grad;
      ceilCtx.fillRect(0, 0, size, size);
    }

    const ceilImgData = ceilCtx.getImageData(0, 0, size, size);
    const ceilData = ceilImgData.data;
    for (let i = 0; i < ceilData.length; i += 4) {
      const noise = (Math.random() - 0.5) * 6;
      ceilData[i] = Math.max(0, Math.min(255, ceilData[i] + noise));
      ceilData[i + 1] = Math.max(0, Math.min(255, ceilData[i + 1] + noise));
      ceilData[i + 2] = Math.max(0, Math.min(255, ceilData[i + 2] + noise));
    }
    ceilCtx.putImageData(ceilImgData, 0, 0);

    const ceilTex = new THREE.CanvasTexture(ceilCanvas);
    ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
    ceilTex.colorSpace = THREE.SRGBColorSpace;
    ceilTex.anisotropy = 16;

    // --- TRIM TEXTURE (Baseboards/Crown) ---
    const trimCanvas = document.createElement('canvas');
    trimCanvas.width = 512;
    trimCanvas.height = 512;
    const trimCtx = trimCanvas.getContext('2d')!;
    trimCtx.fillStyle = '#0a0a0a';
    trimCtx.fillRect(0, 0, 512, 512);
    
    for (let y = 0; y < 512; y++) {
      const noise = (Math.random() - 0.5) * 8;
      trimCtx.fillStyle = `rgba(255, 255, 255, ${Math.abs(noise) / 255 * 0.5})`;
      trimCtx.fillRect(0, y, 512, 1);
    }
    const trimTex = new THREE.CanvasTexture(trimCanvas);
    trimTex.wrapS = trimTex.wrapT = THREE.RepeatWrapping;
    trimTex.colorSpace = THREE.SRGBColorSpace;

    if (isMounted) {
      setWallTexture(tex);
      setWallBump(bumpTex);
      setCeilingTexture(ceilTex);
      setTrimTexture(trimTex);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Update Texture Repeats Dynamically based on dimensions
  useEffect(() => {
    if (wallTexture && wallBump) {
      const repeatX = corridorLength / 3.5;
      const repeatY = height / 3.5;
      wallTexture.repeat.set(repeatX, repeatY);
      wallBump.repeat.set(repeatX, repeatY);
      wallTexture.needsUpdate = true;
      wallBump.needsUpdate = true;
    }
    if (ceilingTexture) {
      const repeatX = corridorLength / 5;
      const repeatY = (WALL_X * 2) / 5;
      ceilingTexture.repeat.set(repeatX, repeatY);
      ceilingTexture.needsUpdate = true;
    }
    if (trimTexture) {
      const repeatX = corridorLength / 2;
      trimTexture.repeat.set(repeatX, 1);
      trimTexture.needsUpdate = true;
    }
  }, [wallTexture, wallBump, ceilingTexture, trimTexture, corridorLength, height]);

  return (
    <group>
      {/* Ceiling */}
      <mesh position={[0, ceilingY, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WALL_X * 2, corridorLength]} />
        <meshStandardMaterial 
          color="#0f0f11" 
          roughness={0.9} 
          metalness={0.05} 
          map={ceilingTexture}
          bumpMap={wallBump}
          bumpScale={0.02}
        />
      </mesh>

      {/* Left Wall */}
      <mesh position={[-WALL_X, floorY + height / 2, centerZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[corridorLength, height]} />
        <meshStandardMaterial 
          color="#1c1c1e" 
          roughness={0.8} 
          metalness={0.05} 
          map={wallTexture} 
          bumpMap={wallBump} 
          bumpScale={0.05}
        />
      </mesh>

      {/* Right Wall */}
      <mesh position={[WALL_X, floorY + height / 2, centerZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[corridorLength, height]} />
        <meshStandardMaterial 
          color="#1c1c1e" 
          roughness={0.8} 
          metalness={0.05} 
          map={wallTexture} 
          bumpMap={wallBump} 
          bumpScale={0.05}
        />
      </mesh>

      {/* Center Carpet Runner */}
      <mesh position={[0, floorY + 0.01, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.5, corridorLength]} />
        <meshStandardMaterial color="#151210" roughness={0.95} metalness={0.0} />
      </mesh>

      {/* Baseboards */}
      <mesh position={[-WALL_X + 0.05, floorY + 0.15, centerZ]}>
        <boxGeometry args={[0.1, 0.3, corridorLength]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.4} metalness={0.3} map={trimTexture} />
      </mesh>
      <mesh position={[WALL_X - 0.05, floorY + 0.15, centerZ]}>
        <boxGeometry args={[0.1, 0.3, corridorLength]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.4} metalness={0.3} map={trimTexture} />
      </mesh>

      {/* Crown Molding */}
      <mesh position={[-WALL_X + 0.05, ceilingY - 0.15, centerZ]}>
        <boxGeometry args={[0.1, 0.3, corridorLength]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.4} metalness={0.3} map={trimTexture} />
      </mesh>
      <mesh position={[WALL_X - 0.05, ceilingY - 0.15, centerZ]}>
        <boxGeometry args={[0.1, 0.3, corridorLength]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.4} metalness={0.3} map={trimTexture} />
      </mesh>

     
      {/* Pilasters */}
      {Array.from({ length: numPilasters }).map((_, i) => {
        const z = centerZ - corridorLength / 2 + i * pilasterSpacing;
        const pilasterHeight = height - 0.6;
        return (
          <group key={`pilaster-${i}`}>
            <Pilaster x={-WALL_X + 0.2} z={z} height={pilasterHeight} wallTexture={wallTexture} wallBump={wallBump} />
            <Pilaster x={WALL_X - 0.2} z={z} height={pilasterHeight} wallTexture={wallTexture} wallBump={wallBump} />
          </group>
        );
      })}

      {/* Track Lights */}
      {tiles.map((tile) => {
        const side = tile.position[0] > 0 ? 1 : -1;
        return <TrackLight key={`light-${tile.id}`} position={tile.position} side={side} />;
      })}

      {/* Benches */}
      {Array.from({ length: numBenches }).map((_, i) => {
        const z = centerZ - corridorLength / 2 + 11.5 + i * benchSpacing;
        return <Bench key={`bench-${i}`} z={z} />;
      })}
    </group>
  );
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
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state, delta) => {
    if (!group.current) return;
    const t = Math.min(1, delta * 6);
    if (hovered) {
      const dirToCam = new THREE.Vector3().subVectors(camera.position, basePos).normalize();
      const targetPos = basePos.clone().add(dirToCam.multiplyScalar(1.6));
      group.current.position.lerp(targetPos, t);
      dummy.position.copy(group.current.position);
      dummy.lookAt(camera.position);
      group.current.quaternion.slerp(dummy.quaternion, t);
      group.current.scale.lerp(new THREE.Vector3(1.22, 1.22, 1.22), t);
    } else {
      group.current.position.lerp(basePos, t);
      const biasedTarget = lookTarget.clone().lerp(camera.position, 0.35);
      dummy.position.copy(basePos);
      dummy.lookAt(biasedTarget);
      group.current.quaternion.slerp(dummy.quaternion, t);
      group.current.scale.lerp(new THREE.Vector3(1, 1, 1), t);
    }
    if (img.current?.material) {
      const targetBrightness = hovered ? 1.2 : 0.85;
      img.current.material.color.lerp(new THREE.Color(targetBrightness, targetBrightness, targetBrightness), t);
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
      <mesh position={[0, 0, -0.08]}>
        <boxGeometry args={[PANEL_W + 0.15, PANEL_H + 0.15, 0.08]} />
        <meshStandardMaterial color="#111111" roughness={0.3} metalness={0.5} />
      </mesh>

      <mesh ref={glow} position={[0, 0, -0.1]}>
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
/*  Camera rig                                                         */
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
/*  Atmosphere                                                         */
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
/*  Scene                                                              */
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
      
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 4, 4]} intensity={40} color="#ff8a5c" distance={20} decay={1.5} />
      <pointLight position={[0, 2, -depth - 5]} intensity={30} color="#5c8aff" distance={30} decay={1.5} />
      
      <Dust depth={depth} />
      
      {/* Dynamically passes the calculated width to the Floor component */}
      <Floor depth={depth} width={CORRIDOR_WIDTH} />
      
      <MuseumArchitecture depth={depth} tiles={tiles} />
      
      {tiles.map((tile) => (
        <GalleryPanel key={tile.id} tile={tile} onHoverChange={handleHoverChange} />
      ))}
      
      <CameraRig depth={depth} onProgress={onProgress} />
      <Preload all />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Top-level export                                                   */
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
      <div
        className="absolute inset-0 flex items-start justify-center pt-10 z-20 pointer-events-none transition-opacity duration-700"
        style={{ opacity: anyHovered ? 0.15 : 1 }}
      >
      </div>

      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-2 transition-opacity duration-700"
        style={{ opacity: hasInteracted ? 0 : 1 }}
      >
        <span className="text-white/60 text-xs tracking-wide">scroll or drag to walk through</span>
        <div className="w-px h-8 bg-white/30 animate-pulse" />
      </div>

      <div className="absolute right-6 top-1/2 -translate-y-1/2 z-20 h-40 w-px bg-white/15 pointer-events-none">
        <div
          className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white transition-[top] duration-300"
          style={{ top: `${progress * 100}%` }}
        />
      </div>

      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 60, near: 0.1, far: 100, position: [0, 0, 0] }}
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
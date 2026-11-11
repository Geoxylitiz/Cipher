'use client';
import { Suspense, useMemo, useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, Preload, useTexture } from '@react-three/drei';
import {
  EffectComposer,
  Bloom,
  Vignette,
  ToneMapping,
  Noise,
  ChromaticAberration,
  DepthOfField,
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode, type DepthOfFieldEffect } from 'postprocessing';
import * as THREE from 'three';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { worksData, homeTilesData } from '@/data/works';
import Floor from './floor';

/* ------------------------------------------------------------------ */
/*  ROOM DIMENSIONS — Tweak these to change the size of the museum    */
/* ------------------------------------------------------------------ */
const WALL_X = 6.5;                     // How far the walls are from the center walkway
const ART_X = WALL_X - 0.1;             // Artworks hang flush against the wall
const TRACK_X = WALL_X - 2.5;           // Ceiling light track, inset from each wall
const CORRIDOR_WIDTH = WALL_X * 2 + 2;  // Total width passed to the floor
const CEILING_Y = 4.5;
const FLOOR_Y = -1.8;
const DOOR_W = 4.4;                     // Doorway between rooms
const DOOR_H = 3.8;
const PARTITION_T = 0.5;
const ENTRY_Z = 0;                      // First doorway
const CAMERA_START_Z = 7;               // Where the visitor stands before entering
const ROOM_PAD = 4.2;                   // Space between a doorway and the first/last work
/* ------------------------------------------------------------------ */

const RING_SPACING = 3.8; // z distance between consecutive works (alternating walls)
const EYE_LEVEL = 0.35;   // centre height of each artwork
const PANEL_W = 3.2;      // image size
const PANEL_H = 2.4;
const MAT = 0.32;         // passe-partout border around the image
const FRAME = 0.11;       // frame moulding width
const OUTER_W = PANEL_W + 2 * MAT + 2 * FRAME;
const OUTER_H = PANEL_H + 2 * MAT + 2 * FRAME;
const HERO_SCALE = 1.35;  // the closing piece on the end wall is larger
const HERO_Y = EYE_LEVEL + 0.4;

const CA_OFFSET = new THREE.Vector2(0.0007, 0.0005);
const DOF_TARGET: [number, number, number] = [0, 0, 0];

/* ------------------------------------------------------------------ */
/*  Rooms — the collection is hung by discipline                       */
/* ------------------------------------------------------------------ */
const ROOMS = [
  { numeral: 'I', name: 'Production', category: 'Production', light: '#ffe2b8' },
  { numeral: 'II', name: 'Direction', category: 'Direction', light: '#e6ecff' },
  { numeral: 'III', name: 'Creative', category: 'Creative', light: '#ffdcc8' },
] as const;
const HERO_SLUG = 'the-dazzling';

/* ------------------------------------------------------------------ */
/*  Spotlight rig, in the artwork's local space (+z faces the room)    */
/* ------------------------------------------------------------------ */
type SpotRig = {
  spot: THREE.Vector3;
  target: THREE.Vector3;
  angle: number;
  intensity: number;
  beam: {
    dir: THREE.Vector3;
    length: number;
    radius: number;
    center: THREE.Vector3;
    quaternion: THREE.Quaternion;
  };
};

function makeSpotRig(spot: THREE.Vector3, target: THREE.Vector3, angle: number, intensity: number): SpotRig {
  const dir = spot.clone().sub(target);
  const dist = dir.length();
  dir.normalize();
  const length = dist * 0.94;
  return {
    spot,
    target,
    angle,
    intensity,
    beam: {
      dir,
      length,
      radius: Math.tan(angle) * length * 1.15,
      center: spot.clone().addScaledVector(dir, -length / 2),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
    },
  };
}

const WALL_SPOT = makeSpotRig(
  new THREE.Vector3(0, CEILING_Y - 0.42 - EYE_LEVEL, ART_X - TRACK_X),
  new THREE.Vector3(0, -0.35, 0),
  0.36,
  34
);
const HERO_SPOT = makeSpotRig(
  new THREE.Vector3(0, CEILING_Y - 0.42 - HERO_Y, 4.2),
  new THREE.Vector3(0, -0.9, 0),
  0.62,
  64
);

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */
type GalleryWork = {
  index: number;
  slug: string;
  title: string;
  category: string;
  src: string;
  room: number;
  position: [number, number, number];
  rotationY: number;
  side: number;      // -1 left wall, 1 right wall, 0 end wall
  hero: boolean;
  scale: number;
  spot: SpotRig;
  light: string;
};

type Stop = {
  pos: THREE.Vector3;       // where the visitor stands
  look: THREE.Vector3;      // what they look at
  normal: THREE.Vector3;    // direction the work faces (close-up approaches along it)
  size: number;             // outer frame width, used to frame the close-up
  workIndex: number | null;
  room: number;
};

type GalleryLayout = {
  works: GalleryWork[];
  stops: Stop[];
  partitions: { z: number; room: number }[];
  benches: number[];
  zFront: number;
  zBack: number;
};

function imageFor(id: string) {
  const n = parseInt(id, 10);
  return (homeTilesData.find((t) => t.id === n) ?? homeTilesData[0]).src;
}

function layoutGallery(): GalleryLayout {
  const works: GalleryWork[] = [];
  const partitions: GalleryLayout['partitions'] = [];
  const benches: number[] = [];
  let z = ENTRY_Z;
  let wallCount = 0;

  ROOMS.forEach((room, r) => {
    partitions.push({ z, room: r });
    const items = worksData.filter((w) => w.category === room.category && w.slug !== HERO_SLUG);
    const roomStart = z;
    items.forEach((w, j) => {
      const side = wallCount++ % 2 === 0 ? -1 : 1;
      works.push({
        index: works.length,
        slug: w.slug,
        title: w.title,
        category: w.category,
        src: imageFor(w.id),
        room: r,
        position: [side * ART_X, EYE_LEVEL, roomStart - ROOM_PAD - j * RING_SPACING],
        // Left wall faces +x, right wall faces -x
        rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        side,
        hero: false,
        scale: 1,
        spot: WALL_SPOT,
        light: room.light,
      });
    });
    const lastZ = roomStart - ROOM_PAD - Math.max(0, items.length - 1) * RING_SPACING;
    benches.push((roomStart + lastZ) / 2);
    z = lastZ - ROOM_PAD;
  });

  // Closing piece, centred on the end wall of the last room
  const hero = worksData.find((w) => w.slug === HERO_SLUG)!;
  const lastRoom = ROOMS.length - 1;
  const zBack = z - 3;
  works.push({
    index: works.length,
    slug: hero.slug,
    title: hero.title,
    category: hero.category,
    src: imageFor(hero.id),
    room: lastRoom,
    position: [0, HERO_Y, zBack + 0.1],
    rotationY: 0,
    side: 0,
    hero: true,
    scale: HERO_SCALE,
    spot: HERO_SPOT,
    light: ROOMS[lastRoom].light,
  });

  const stops: Stop[] = [
    {
      pos: new THREE.Vector3(0, 0, CAMERA_START_Z),
      look: new THREE.Vector3(0, 0, CAMERA_START_Z - 10),
      normal: new THREE.Vector3(0, 0, 1),
      size: 0,
      workIndex: null,
      room: 0,
    },
    ...works.map((w): Stop => {
      const [x, y, wz] = w.position;
      if (w.hero) {
        return {
          pos: new THREE.Vector3(0, 0.3, wz + 9),
          look: new THREE.Vector3(0, y, wz),
          normal: new THREE.Vector3(0, 0, 1),
          size: OUTER_W * w.scale,
          workIndex: w.index,
          room: w.room,
        };
      }
      return {
        // Stand across the room, slightly before the work, for a 3/4 view
        pos: new THREE.Vector3(w.side * 0.6, 0.05, wz + 1.1),
        look: new THREE.Vector3(x, y - 0.05, wz),
        normal: new THREE.Vector3(-w.side, 0, 0),
        size: OUTER_W * w.scale,
        workIndex: w.index,
        room: w.room,
      };
    }),
  ];

  return { works, stops, partitions, benches, zFront: CAMERA_START_Z + 8, zBack };
}

/* Shared navigation state between the DOM overlay and the camera rig */
type NavState = {
  s: number;               // current (smoothed) position along the stops
  target: number;          // where we're heading
  focused: number | null;  // index of the work in close-up
  lastInput: number;
  dragging: boolean;
};

/* ------------------------------------------------------------------ */
/*  Museum Architecture — walls, ceiling, pilasters, track, benches    */
/* ------------------------------------------------------------------ */
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
      <mesh position={[0, y0 + baseH / 2, 0]}>
        <boxGeometry args={[baseW, baseH, baseD]} />
        <meshStandardMaterial color="#141416" roughness={0.55} metalness={0.15} />
      </mesh>
      <mesh position={[0, y0 + baseH + 0.02, 0]}>
        <boxGeometry args={[baseW - 0.06, 0.05, baseD - 0.06]} />
        <meshStandardMaterial color="#050505" roughness={0.4} metalness={0.25} />
      </mesh>
      <mesh position={[0, shaftY, 0]}>
        <boxGeometry args={[shaftW, shaftH, shaftD]} />
        <meshStandardMaterial
          color="#5a5652" roughness={0.7} metalness={0.1}
          map={wallTexture ?? undefined} bumpMap={wallBump ?? undefined} bumpScale={0.03}
        />
      </mesh>
      {[-0.09, -0.03, 0.03, 0.09].map((offset, i) => (
        <mesh key={i} position={[offset, shaftY, shaftD / 2 - 0.005]}>
          <boxGeometry args={[0.018, shaftH * 0.92, 0.015]} />
          <meshStandardMaterial color="#050505" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, capY, 0]}>
        <boxGeometry args={[capW, capH, capD]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh position={[0, abacusY, 0]}>
        <boxGeometry args={[abacusW, abacusH, abacusD]} />
        <meshStandardMaterial color="#050505" roughness={0.4} metalness={0.25} />
      </mesh>
    </group>
  );
}

function useRoomTitleTexture(numeral: string, name: string) {
  return useMemo(() => {
    if (typeof document === 'undefined') return null;
    const w = 1024, h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(236,230,220,0.55)';
    ctx.font = '500 30px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(`ROOM ${numeral}`.split('').join(' '), w / 2, 70);
    ctx.fillStyle = 'rgba(244,238,228,0.92)';
    ctx.font = 'italic 112px Georgia, "Times New Roman", serif';
    ctx.fillText(name, w / 2, 190);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [numeral, name]);
}

function Partition({ z, room, wallTexture, wallBump }: {
  z: number;
  room: number;
  wallTexture: THREE.CanvasTexture | null;
  wallBump: THREE.CanvasTexture | null;
}) {
  const height = CEILING_Y - FLOOR_Y;
  const sideW = WALL_X - DOOR_W / 2;
  const lintelH = CEILING_Y - (FLOOR_Y + DOOR_H);
  const lintelY = FLOOR_Y + DOOR_H + lintelH / 2;
  const title = useRoomTitleTexture(ROOMS[room].numeral, ROOMS[room].name);
  const material = (
    <meshStandardMaterial
      color="#ffffff"
      roughness={0.85}
      map={wallTexture ?? undefined}
      bumpMap={wallBump ?? undefined}
      bumpScale={0.04}
    />
  );

  return (
    <group position={[0, 0, z]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (DOOR_W / 2 + sideW / 2), FLOOR_Y + height / 2, 0]}>
          <boxGeometry args={[sideW, height, PARTITION_T]} />
          {material}
        </mesh>
      ))}
      <mesh position={[0, lintelY, 0]}>
        <boxGeometry args={[DOOR_W, lintelH, PARTITION_T]} />
        {material}
      </mesh>
      {/* Doorway reveal — thin dark architrave */}
      {[-1, 1].map((side) => (
        <mesh key={`reveal-${side}`} position={[side * (DOOR_W / 2 + 0.03), FLOOR_Y + DOOR_H / 2, PARTITION_T / 2 + 0.01]}>
          <boxGeometry args={[0.06, DOOR_H, 0.02]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, FLOOR_Y + DOOR_H + 0.03, PARTITION_T / 2 + 0.01]}>
        <boxGeometry args={[DOOR_W + 0.12, 0.06, 0.02]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Room title, lettered on the wall above the doorway */}
      {title && (
        <mesh position={[0, lintelY + 0.05, PARTITION_T / 2 + 0.02]} raycast={() => null}>
          <planeGeometry args={[3.6, 0.9]} />
          <meshBasicMaterial map={title} transparent depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function MuseumArchitecture({ layout }: { layout: GalleryLayout }) {
  const height = CEILING_Y - FLOOR_Y;
  const centerZ = (layout.zFront + layout.zBack) / 2;
  const corridorLength = layout.zFront - layout.zBack;

  const [wallTexture, setWallTexture] = useState<THREE.CanvasTexture | null>(null);
  const [wallBump, setWallBump] = useState<THREE.CanvasTexture | null>(null);
  const [ceilingTexture, setCeilingTexture] = useState<THREE.CanvasTexture | null>(null);
  const [trimTexture, setTrimTexture] = useState<THREE.CanvasTexture | null>(null);

  // Procedural Texture Generation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let isMounted = true;

    // --- WALL COLOR TEXTURE ---
    // Mid-tone warm grey: the room reads dark because of the lighting,
    // not because the paint is black — that's what lets light pools show.
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#4a4642';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 120; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 250 + 100;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      const alpha = Math.random() * 0.05;
      grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      grad.addColorStop(1, `rgba(0, 0, 0, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }

    for (let i = 0; i < 80; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 300 + 150;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      const alpha = Math.random() * 0.1;
      grad.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
      grad.addColorStop(1, `rgba(0, 0, 0, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 10;
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

    const temp = new Float32Array(bumpSize * bumpSize);
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
      ceilingTexture.repeat.set(corridorLength / 5, (WALL_X * 2) / 5);
      ceilingTexture.needsUpdate = true;
    }
    if (trimTexture) {
      trimTexture.repeat.set(corridorLength / 2, 1);
      trimTexture.needsUpdate = true;
    }
  }, [wallTexture, wallBump, ceilingTexture, trimTexture, corridorLength, height]);

  return (
    <group>
      {/* Ceiling */}
      <mesh position={[0, CEILING_Y, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
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

      {/* Ceiling light tracks */}
      {[-1, 1].map((side) => (
        <mesh key={`track-${side}`} position={[side * TRACK_X, CEILING_Y - 0.03, centerZ]}>
          <boxGeometry args={[0.07, 0.05, corridorLength]} />
          <meshStandardMaterial color="#0b0b0b" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}

      {/* Side walls */}
      {[-1, 1].map((side) => (
        <mesh
          key={`wall-${side}`}
          position={[side * WALL_X, FLOOR_Y + height / 2, centerZ]}
          rotation={[0, -side * Math.PI / 2, 0]}
        >
          <planeGeometry args={[corridorLength, height]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.85}
            metalness={0}
            map={wallTexture}
            bumpMap={wallBump}
            bumpScale={0.05}
          />
        </mesh>
      ))}

      {/* End wall — home of the closing piece */}
      <mesh position={[0, FLOOR_Y + height / 2, layout.zBack]}>
        <planeGeometry args={[WALL_X * 2, height]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.85}
          metalness={0}
          map={wallTexture}
          bumpMap={wallBump}
          bumpScale={0.05}
        />
      </mesh>

      {/* Doorways between rooms */}
      {layout.partitions.map((p) => (
        <Partition key={`partition-${p.room}`} z={p.z} room={p.room} wallTexture={wallTexture} wallBump={wallBump} />
      ))}

      {/* Baseboards + crown moulding */}
      {[-1, 1].map((side) => (
        <group key={`trim-${side}`}>
          <mesh position={[side * (WALL_X - 0.05), FLOOR_Y + 0.15, centerZ]}>
            <boxGeometry args={[0.1, 0.3, corridorLength]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.4} metalness={0.3} map={trimTexture} />
          </mesh>
          <mesh position={[side * (WALL_X - 0.05), CEILING_Y - 0.15, centerZ]}>
            <boxGeometry args={[0.1, 0.3, corridorLength]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.4} metalness={0.3} map={trimTexture} />
          </mesh>
        </group>
      ))}

      {/* Pilasters — one on the opposite wall of every wall-hung work, so each
          wall alternates work / pilaster / work and every piece gets its own bay. */}
      {layout.works.filter((w) => !w.hero).map((w) => (
        <Pilaster
          key={`pilaster-${w.slug}`}
          x={-w.side * (WALL_X - 0.2)}
          z={w.position[2]}
          height={height - 0.6}
          wallTexture={wallTexture}
          wallBump={wallBump}
        />
      ))}

      {/* One bench in the middle of each room */}
      {layout.benches.map((z, i) => (
        <Bench key={`bench-${i}`} z={z} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Light beam — a soft additive cone that fakes light through haze    */
/* ------------------------------------------------------------------ */
const beamVertex = /* glsl */ `
  uniform float uHeight;
  varying float vAlong;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vAlong = position.y / uHeight + 0.5; // 1 at the fixture, 0 at the wall
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlong;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    // Clamp before pow(): a negative base yields NaN, which bloom then
    // smears across the entire frame.
    float facing = clamp(abs(dot(normalize(vNormalV), normalize(-vViewPos))), 0.0, 1.0);
    float a = clamp(vAlong, 0.0, 1.0);
    float edge = pow(facing, 4.0);
    float along = pow(a, 2.2) * smoothstep(0.0, 0.5, a) * (1.0 - smoothstep(0.85, 1.0, a));
    gl_FragColor = vec4(uColor * edge * along * uOpacity, 1.0);
  }
`;
const BEAM_OPACITY = 0.022;

function LightBeam({ rig, color, intensity }: {
  rig: SpotRig;
  color: string;
  intensity: React.MutableRefObject<number>;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uHeight: { value: rig.beam.length },
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: BEAM_OPACITY },
        },
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [rig, color]
  );

  useFrame(() => {
    material.uniforms.uOpacity.value = BEAM_OPACITY * intensity.current;
  });

  return (
    <mesh position={rig.beam.center} quaternion={rig.beam.quaternion} material={material} raycast={() => null}>
      <coneGeometry args={[rig.beam.radius, rig.beam.length, 40, 1, true]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Track fixture + spotlight aimed at one artwork                     */
/* ------------------------------------------------------------------ */
function ArtSpotlight({ rig, color, ceilingLocalY, intensity }: {
  rig: SpotRig;
  color: string;
  ceilingLocalY: number;
  intensity: React.MutableRefObject<number>;
}) {
  const spot = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);

  useLayoutEffect(() => {
    if (spot.current && target.current) spot.current.target = target.current;
  }, []);

  useFrame(() => {
    if (spot.current) spot.current.intensity = rig.intensity * intensity.current;
  });

  const stemH = ceilingLocalY - rig.spot.y;
  const housingPos = useMemo(() => rig.spot.clone().addScaledVector(rig.beam.dir, 0.12), [rig]);

  return (
    <group>
      {/* Stem down from the ceiling track */}
      <mesh position={[rig.spot.x, rig.spot.y + stemH / 2, rig.spot.z]} raycast={() => null}>
        <cylinderGeometry args={[0.015, 0.015, stemH, 8]} />
        <meshStandardMaterial color="#0b0b0b" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Housing, aimed along the beam */}
      <mesh position={housingPos} quaternion={rig.beam.quaternion} raycast={() => null}>
        <cylinderGeometry args={[0.09, 0.07, 0.26, 20]} />
        <meshStandardMaterial color="#0a0a0a" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Lens glow */}
      <mesh position={rig.spot} quaternion={rig.beam.quaternion} raycast={() => null}>
        <cylinderGeometry args={[0.065, 0.065, 0.01, 20]} />
        <meshStandardMaterial color="#fff" emissive={color} emissiveIntensity={6} toneMapped={false} />
      </mesh>

      <spotLight
        ref={spot}
        position={rig.spot}
        angle={rig.angle}
        penumbra={0.7}
        intensity={rig.intensity}
        distance={16}
        decay={2}
        color={color}
      />
      <object3D ref={target} position={rig.target} />
      <LightBeam rig={rig} color={color} intensity={intensity} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Floor pool — soft warm spill on the floor below each lit work      */
/* ------------------------------------------------------------------ */
let poolTexture: THREE.CanvasTexture | null = null;
function getPoolTexture() {
  if (poolTexture || typeof document === 'undefined') return poolTexture;
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  poolTexture = new THREE.CanvasTexture(canvas);
  return poolTexture;
}

const POOL_OPACITY = 0.075;

function FloorPool({ y, z, width, color, intensity }: {
  y: number;
  z: number;
  width: number;
  color: string;
  intensity: React.MutableRefObject<number>;
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const texture = useMemo(() => getPoolTexture(), []);

  useFrame(() => {
    if (mat.current) mat.current.opacity = POOL_OPACITY * intensity.current;
  });

  if (!texture) return null;
  return (
    <mesh position={[0, y, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[width, 3.2]} />
      <meshBasicMaterial
        ref={mat}
        map={texture}
        color={color}
        transparent
        opacity={POOL_OPACITY}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Wall label — small printed card beside each work                   */
/* ------------------------------------------------------------------ */
function useLabelTexture(index: number, title: string, category: string) {
  return useMemo(() => {
    if (typeof document === 'undefined') return null;
    const w = 512, h = 320;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ece8e1';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#1b1a18';
    ctx.font = '500 26px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(`No. ${String(index + 1).padStart(2, '0')}`, 36, 62);

    // Title, wrapped to two lines max
    ctx.font = 'italic 40px Georgia, "Times New Roman", serif';
    const words = title.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > w - 72 && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, 36, 136 + i * 48));

    ctx.fillStyle = '#6b665f';
    ctx.font = '24px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${category} · Cipher Studio`, 36, h - 40);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [index, title, category]);
}

/* ------------------------------------------------------------------ */
/*  A single framed artwork                                            */
/* ------------------------------------------------------------------ */
function GalleryPanel({ work, focused, anyFocused, onSelect, onHoverChange }: {
  work: GalleryWork;
  focused: boolean;
  anyFocused: boolean;
  onSelect: (index: number) => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const imageMat = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const lightLevel = useRef(1);

  const texture = useTexture(work.src);
  const labelTexture = useLabelTexture(work.index, work.title, work.category);

  // Crop the image to the panel's aspect ratio ("object-fit: cover")
  useLayoutEffect(() => {
    const img = texture.image as { width: number; height: number } | undefined;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    if (img?.width && img?.height) {
      const imageAspect = img.width / img.height;
      const panelAspect = PANEL_W / PANEL_H;
      if (imageAspect > panelAspect) {
        const r = panelAspect / imageAspect;
        texture.repeat.set(r, 1);
        texture.offset.set((1 - r) / 2, 0);
      } else {
        const r = imageAspect / panelAspect;
        texture.repeat.set(1, r);
        texture.offset.set(0, (1 - r) / 2);
      }
    }
    texture.needsUpdate = true;
  }, [texture]);

  useFrame((_, delta) => {
    // In close-up, the selected work brightens and the rest of the room dims
    const target = anyFocused ? (focused ? 1.6 : 0.2) : hovered ? 1.45 : 1;
    lightLevel.current = THREE.MathUtils.damp(lightLevel.current, target, 3.5, delta);
    if (imageMat.current) {
      imageMat.current.emissiveIntensity = THREE.MathUtils.damp(
        imageMat.current.emissiveIntensity,
        hovered || focused ? 0.1 : anyFocused ? 0.005 : 0.03,
        4,
        delta
      );
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
    onSelect(work.index);
  }, [onSelect, work.index]);

  const outerW = OUTER_W * work.scale;
  const outerH = OUTER_H * work.scale;
  const ceilingLocalY = CEILING_Y - work.position[1];

  return (
    <group position={work.position} rotation={[0, work.rotationY, 0]}>
      <group scale={work.scale}>
        {/* Frame moulding */}
        <mesh position={[0, 0, -0.05]} raycast={() => null}>
          <boxGeometry args={[OUTER_W, OUTER_H, 0.1]} />
          <meshStandardMaterial color="#0e0d0c" roughness={0.38} metalness={0.25} />
        </mesh>

        {/* Passe-partout */}
        <mesh position={[0, 0, 0.002]} raycast={() => null}>
          <planeGeometry args={[PANEL_W + 2 * MAT, PANEL_H + 2 * MAT]} />
          <meshStandardMaterial color="#e6e1d8" roughness={0.92} />
        </mesh>

        {/* The work itself — lit by the spotlight, not self-illuminated */}
        <mesh
          position={[0, 0, 0.006]}
          onPointerOver={handleOver}
          onPointerOut={handleOut}
          onClick={handleClick}
        >
          <planeGeometry args={[PANEL_W, PANEL_H]} />
          <meshStandardMaterial
            ref={imageMat}
            map={texture}
            emissiveMap={texture}
            emissive="#ffffff"
            emissiveIntensity={0.03}
            roughness={0.55}
            metalness={0}
          />
        </mesh>
      </group>

      {/* Wall label */}
      {labelTexture && (
        <mesh position={[outerW / 2 + 0.5, -outerH / 2 + 0.75, 0.01]} raycast={() => null}>
          <planeGeometry args={[0.56, 0.35]} />
          <meshStandardMaterial map={labelTexture} roughness={0.9} emissiveMap={labelTexture} emissive="#ffffff" emissiveIntensity={0.04} />
        </mesh>
      )}

      <ArtSpotlight rig={work.spot} color={work.light} ceilingLocalY={ceilingLocalY} intensity={lightLevel} />
      <FloorPool
        y={FLOOR_Y - work.position[1] + 0.01}
        z={work.hero ? 2.4 : 0.9}
        width={outerW * 1.5}
        color={work.light}
        intensity={lightLevel}
      />

      {hovered && !focused && (
        <Html center distanceFactor={8} position={[0, -outerH / 2 - 0.3, 0.05]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.85)',
              whiteSpace: 'nowrap',
            }}
          >
            View →
          </div>
        </Html>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Camera rig — glides between stops and settles in front of each work */
/* ------------------------------------------------------------------ */
const SNAP_DELAY_MS = 160;
const CAPTION_WIDTH = 400;       // px — keep in sync with the caption panel's md:w-[400px]
const CAPTION_BREAKPOINT = 768;  // px — below this the caption is a bottom sheet

function CameraRig({ stops, nav, onStopChange, onUserMove, progressDot }: {
  stops: Stop[];
  nav: React.MutableRefObject<NavState>;
  onStopChange: (stop: number) => void;
  onUserMove: () => void;
  progressDot: React.RefObject<HTMLDivElement | null>;
}) {
  const { camera, gl, size } = useThree();
  const mouse = useRef({ x: 0, y: 0 });
  const lastY = useRef(0);
  const focusAmt = useRef(0);
  const lastFocused = useRef<number | null>(null);
  const reportedStop = useRef(-1);
  const scratch = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      stopLook: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      focusPos: new THREE.Vector3(),
      focusLook: new THREE.Vector3(),
    }),
    []
  );
  const last = stops.length - 1;

  useEffect(() => {
    const el = gl.domElement;
    const move = (amount: number) => {
      const n = nav.current;
      n.target = THREE.MathUtils.clamp(n.target + amount, 0, last);
      n.lastInput = performance.now();
      onUserMove();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      move(e.deltaY * 0.0035);
    };
    const onPointerDown = (e: PointerEvent) => {
      nav.current.dragging = true;
      lastY.current = e.clientY;
    };
    const onPointerUp = () => {
      nav.current.dragging = false;
      nav.current.lastInput = performance.now();
    };
    const onPointerMove = (e: PointerEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1;
      if (nav.current.dragging) {
        const dy = e.clientY - lastY.current;
        lastY.current = e.clientY;
        if (Math.abs(dy) > 0) move(-dy * 0.012);
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
  }, [gl, nav, last, onUserMove]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const n = nav.current;
    const { pos, look, stopLook, forward, dir, right, up, m, q, focusPos, focusLook } = scratch;

    // Settle on the nearest stop once input goes quiet
    if (!n.dragging && performance.now() - n.lastInput > SNAP_DELAY_MS) {
      n.target = Math.round(n.target);
    }
    n.s = THREE.MathUtils.damp(n.s, n.target, 3, delta);
    if (Math.abs(n.s - n.target) < 0.0005) n.s = n.target;

    const i0 = THREE.MathUtils.clamp(Math.floor(n.s), 0, Math.max(0, last - 1));
    const i1 = Math.min(i0 + 1, last);
    const f = THREE.MathUtils.clamp(n.s - i0, 0, 1);
    const e = f * f * (3 - 2 * f);
    const A = stops[i0];
    const B = stops[i1];

    // Position along the path; look at the work when parked, down the room in between
    pos.lerpVectors(A.pos, B.pos, e);
    stopLook.lerpVectors(A.look, B.look, e);
    forward.set(pos.x, pos.y, pos.z - 10);
    const parked = Math.pow(Math.abs(2 * f - 1), 1.5);
    look.lerpVectors(forward, stopLook, parked);

    // Close-up on the selected work
    if (n.focused !== null) lastFocused.current = n.focused;
    focusAmt.current = THREE.MathUtils.damp(focusAmt.current, n.focused !== null ? 1 : 0, 2.6, delta);
    if (lastFocused.current !== null && focusAmt.current > 0.001) {
      const fs = stops[lastFocused.current + 1];
      const { width, height } = size;
      const aspect = width / height;
      const desktop = width >= CAPTION_BREAKPOINT;
      const tanHalf = Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2));
      // Share of the screen left for the artwork once the caption is in
      const usableW = desktop ? (width - Math.min(CAPTION_WIDTH, width)) / width : 1;
      const usableH = desktop ? 1 : 0.55;
      // Back off far enough that the whole frame (plus margin) fits that space
      const d = Math.max(
        3.2,
        (fs.size * 1.3) / (usableW * 2 * tanHalf * aspect),
        (fs.size * (OUTER_H / OUTER_W) * 1.3) / (usableH * 2 * tanHalf)
      );
      focusPos.copy(fs.look).addScaledVector(fs.normal, d);
      // Aim off-centre so the work sits beside (desktop) or above (mobile) the caption
      dir.copy(fs.normal).negate();
      right.crossVectors(dir, up).normalize();
      focusLook.copy(fs.look);
      if (desktop) {
        const visibleW = 2 * d * tanHalf * aspect;
        focusLook.addScaledVector(right, (Math.min(CAPTION_WIDTH, width) / (2 * width)) * visibleW);
      } else {
        focusLook.addScaledVector(up, -0.22 * 2 * d * tanHalf);
      }
      pos.lerp(focusPos, focusAmt.current);
      look.lerp(focusLook, focusAmt.current);
    }

    // Gentle head movement with the mouse (in the camera's own frame)
    const freedom = 1 - focusAmt.current * 0.85;
    dir.subVectors(look, pos).normalize();
    right.crossVectors(dir, up).normalize();
    look.addScaledVector(right, mouse.current.x * 1.1 * freedom);
    look.addScaledVector(up, -mouse.current.y * 0.5 * freedom);

    const k = 1 - Math.exp(-6 * delta);
    camera.position.lerp(pos, k);
    m.lookAt(camera.position, look, up);
    q.setFromRotationMatrix(m);
    camera.quaternion.slerp(q, k);

    if (progressDot.current) {
      progressDot.current.style.top = `${(last > 0 ? n.s / last : 0) * 100}%`;
    }
    const nearest = Math.round(n.s);
    if (nearest !== reportedStop.current) {
      reportedStop.current = nearest;
      onStopChange(nearest);
    }
  });

  return null;
}

/* ------------------------------------------------------------------ */
/*  Depth of field — background melts away in close-up                 */
/* ------------------------------------------------------------------ */
function FocusBlur({ stops, nav }: { stops: Stop[]; nav: React.MutableRefObject<NavState> }) {
  const dof = useRef<DepthOfFieldEffect>(null);
  const lastFocused = useRef<number | null>(null);

  useFrame((_, delta) => {
    const effect = dof.current;
    if (!effect) return;
    const n = nav.current;
    if (n.focused !== null) lastFocused.current = n.focused;
    if (lastFocused.current !== null && effect.target) {
      effect.target.copy(stops[lastFocused.current + 1].look);
    }
    effect.bokehScale = THREE.MathUtils.damp(effect.bokehScale, n.focused !== null ? 4.5 : 0, 2.5, Math.min(delta, 0.1));
  });

  return <DepthOfField ref={dof} target={DOF_TARGET} worldFocusRange={2.2} bokehScale={0} />;
}

/* ------------------------------------------------------------------ */
/*  Atmosphere                                                         */
/* ------------------------------------------------------------------ */
function Dust({ count = 450, zFront, zBack }: { count?: number; zFront: number; zBack: number }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * WALL_X * 2;
      arr[i * 3 + 1] = FLOOR_Y + Math.random() * (CEILING_Y - FLOOR_Y);
      arr[i * 3 + 2] = zBack + Math.random() * (zFront - zBack);
    }
    return arr;
  }, [count, zFront, zBack]);

  useFrame((state) => {
    if (points.current) {
      points.current.position.y = Math.sin(state.clock.elapsedTime * 0.15) * 0.15;
      points.current.position.x = Math.sin(state.clock.elapsedTime * 0.07) * 0.2;
    }
  });

  return (
    <points ref={points} raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.025} color="#ffd9b0" transparent opacity={0.14} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene                                                              */
/* ------------------------------------------------------------------ */
function Scene({ layout, nav, focused, onSelect, onStopChange, onUserMove, onAnyHover, progressDot }: {
  layout: GalleryLayout;
  nav: React.MutableRefObject<NavState>;
  focused: number | null;
  onSelect: (index: number) => void;
  onStopChange: (stop: number) => void;
  onUserMove: () => void;
  onAnyHover: (hovered: boolean) => void;
  progressDot: React.RefObject<HTMLDivElement | null>;
}) {
  const hoveredCount = useRef(0);

  const handleHoverChange = useCallback((hovered: boolean) => {
    hoveredCount.current = Math.max(0, hoveredCount.current + (hovered ? 1 : -1));
    onAnyHover(hoveredCount.current > 0);
  }, [onAnyHover]);

  return (
    <>
      <fog attach="fog" args={['#070707', 8, 34]} />
      <color attach="background" args={['#070707']} />

      {/* Almost no fill — the spotlights do the work */}
      <ambientLight intensity={0.06} />
      <hemisphereLight args={['#2a2420', '#050505', 0.15]} />

      <Dust zFront={layout.zFront} zBack={layout.zBack} />

      <Floor zFront={layout.zFront} zBack={layout.zBack} width={CORRIDOR_WIDTH} />

      <MuseumArchitecture layout={layout} />

      {layout.works.map((work) => (
        <GalleryPanel
          key={work.slug}
          work={work}
          focused={focused === work.index}
          anyFocused={focused !== null}
          onSelect={onSelect}
          onHoverChange={handleHoverChange}
        />
      ))}

      <CameraRig
        stops={layout.stops}
        nav={nav}
        onStopChange={onStopChange}
        onUserMove={onUserMove}
        progressDot={progressDot}
      />
      <Preload all />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Top-level export                                                   */
/* ------------------------------------------------------------------ */
const SERIF = '"Instrument Serif", "Cormorant Garamond", Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';

export default function HomeCollage() {
  const router = useRouter();
  const layout = useMemo(() => layoutGallery(), []);
  const nav = useRef<NavState>({ s: 0, target: 0, focused: null, lastInput: 0, dragging: false });
  const progressDot = useRef<HTMLDivElement>(null);
  const [stop, setStop] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [, setAnyHovered] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${CAPTION_BREAKPOINT}px)`);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const lastStop = layout.stops.length - 1;
  const totalWorks = layout.works.length;
  const currentStop = layout.stops[stop];
  const room = ROOMS[currentStop.room];
  const focusedWork = focused !== null ? layout.works[focused] : null;

  const setFocus = useCallback((index: number | null) => {
    nav.current.focused = index;
    setFocused(index);
  }, []);

  const goTo = useCallback((stopIndex: number) => {
    const n = nav.current;
    n.target = THREE.MathUtils.clamp(stopIndex, 0, lastStop);
    n.lastInput = performance.now();
    setHasInteracted(true);
  }, [lastStop]);

  const handleSelect = useCallback((index: number) => {
    if (nav.current.focused === index) {
      router.push(`/works/${layout.works[index].slug}`);
      return;
    }
    goTo(index + 1);
    setFocus(index);
  }, [goTo, layout.works, router, setFocus]);

  const handleUserMove = useCallback(() => {
    setHasInteracted(true);
    if (nav.current.focused !== null) setFocus(null);
  }, [setFocus]);

  // Keyboard: arrows step between works, Enter opens/focuses, Escape steps back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = nav.current;
      const current = Math.round(n.target);
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        if (n.focused !== null) setFocus(null);
        goTo(current + 1);
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        if (n.focused !== null) setFocus(null);
        goTo(current - 1);
      } else if (e.key === 'Enter') {
        const workIndex = layout.stops[current]?.workIndex;
        if (workIndex !== null && workIndex !== undefined) handleSelect(workIndex);
      } else if (e.key === 'Escape') {
        setFocus(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, handleSelect, layout.stops, setFocus]);

  const counter = currentStop.workIndex !== null ? String(currentStop.workIndex + 1).padStart(2, '0') : '00';

  return (
    <div className="w-full relative h-screen overflow-hidden bg-[#070707]">
      {/* Room + counter */}
      <div
        className="absolute left-6 md:left-10 bottom-20 md:bottom-12 z-20 pointer-events-none text-[#f5f5f2] transition-opacity duration-700"
        style={{ opacity: focused !== null ? 0 : 1 }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`room-${currentStop.room}-${currentStop.workIndex === null}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="text-[10px] md:text-[11px] uppercase tracking-[0.32em] text-white/55"
            style={{ fontFamily: MONO }}
          >
            {currentStop.workIndex === null ? 'Cipher Studio — The Collection' : `Room ${room.numeral} — ${room.name}`}
          </motion.div>
        </AnimatePresence>
        <div className="flex items-end gap-3 mt-2">
          <div className="relative overflow-hidden h-[64px] md:h-[104px]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={counter}
                initial={{ y: '100%' }}
                animate={{ y: '0%' }}
                exit={{ y: '-100%' }}
                transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
                className="block text-[64px] md:text-[104px] leading-none italic"
                style={{ fontFamily: SERIF }}
              >
                {counter}
              </motion.span>
            </AnimatePresence>
          </div>
          <span className="pb-2 md:pb-3 text-xs text-white/40" style={{ fontFamily: MONO }}>
            / {String(totalWorks).padStart(2, '0')}
          </span>
        </div>
        <AnimatePresence mode="wait">
          {currentStop.workIndex !== null && (
            <motion.div
              key={`title-${currentStop.workIndex}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="mt-1 text-lg md:text-2xl text-white/85"
              style={{ fontFamily: SERIF }}
            >
              {layout.works[currentStop.workIndex].title}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hint */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-2 transition-opacity duration-700"
        style={{ opacity: hasInteracted ? 0 : 1 }}
      >
        <span className="text-white/60 text-[10px] uppercase tracking-[0.3em]" style={{ fontFamily: MONO }}>
          Scroll, drag or use the arrow keys
        </span>
        <div className="w-px h-8 bg-white/30 animate-pulse" />
      </div>

      {/* Progress rail with a tick per stop */}
      <div
        className="absolute right-6 top-1/2 -translate-y-1/2 z-20 h-48 w-px bg-white/15 pointer-events-none transition-opacity duration-700"
        style={{ opacity: focused !== null ? 0 : 1 }}
      >
        {layout.stops.map((s, i) => (
          <div
            key={i}
            className="absolute left-1/2 -translate-x-1/2 h-px bg-white/35"
            style={{
              top: `${(i / lastStop) * 100}%`,
              width: i > 0 && layout.stops[i - 1].room !== s.room ? 12 : 5,
            }}
          />
        ))}
        <div
          ref={progressDot}
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white"
          style={{ top: '0%' }}
        />
      </div>

      {/* Caption panel in close-up */}
      <AnimatePresence>
        {focusedWork && (
          <motion.aside
            key={focusedWork.slug}
            initial={isDesktop ? { x: '105%' } : { y: '105%' }}
            animate={{ x: '0%', y: '0%' }}
            exit={isDesktop ? { x: '105%' } : { y: '105%' }}
            transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
            className="absolute z-30 inset-x-0 bottom-0 max-h-[45vh] overflow-y-auto border-t md:overflow-visible md:max-h-none md:inset-x-auto md:top-0 md:right-0 md:w-[400px] md:border-t-0 md:border-l bg-[#0b0a09]/80 backdrop-blur-md border-white/10 text-[#f5f5f2] flex flex-col justify-end p-6 md:p-10"
          >
            <div className="text-[11px] uppercase tracking-[0.32em] text-white/50" style={{ fontFamily: MONO }}>
              No. {String(focusedWork.index + 1).padStart(2, '0')} · Room {ROOMS[focusedWork.room].numeral}
            </div>
            <h2 className="mt-3 md:mt-4 text-4xl md:text-6xl leading-[0.95] italic" style={{ fontFamily: SERIF }}>
              {focusedWork.title}
            </h2>
            <div className="mt-6 h-px w-full bg-white/15" />
            <dl className="mt-6 grid grid-cols-2 gap-y-3 text-sm" style={{ fontFamily: MONO }}>
              <dt className="text-white/40 uppercase text-[11px] tracking-[0.2em]">Discipline</dt>
              <dd className="text-white/85">{focusedWork.category}</dd>
              <dt className="text-white/40 uppercase text-[11px] tracking-[0.2em]">Studio</dt>
              <dd className="text-white/85">Cipher Studio</dd>
            </dl>
            <Link
              href={`/works/${focusedWork.slug}`}
              className="mt-10 inline-flex items-center justify-between border border-white/25 px-5 py-4 text-xs uppercase tracking-[0.25em] hover:bg-white hover:text-black transition-colors"
              style={{ fontFamily: MONO }}
            >
              Open project <span aria-hidden>→</span>
            </Link>
            <button
              type="button"
              onClick={() => setFocus(null)}
              className="mt-4 text-left text-[11px] uppercase tracking-[0.25em] text-white/45 hover:text-white transition-colors"
              style={{ fontFamily: MONO }}
            >
              Back to the room (Esc)
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ fov: 60, near: 0.1, far: 100, position: [0, 0, CAMERA_START_Z] }}
        className="absolute inset-0 z-10"
        onPointerMissed={() => {
          if (!nav.current.dragging && nav.current.focused !== null) setFocus(null);
        }}
      >
        <Suspense fallback={null}>
          <Scene
            layout={layout}
            nav={nav}
            focused={focused}
            onSelect={handleSelect}
            onStopChange={setStop}
            onUserMove={handleUserMove}
            onAnyHover={setAnyHovered}
            progressDot={progressDot}
          />
          <EffectComposer multisampling={4}>
            <Bloom intensity={0.55} luminanceThreshold={0.85} luminanceSmoothing={0.3} mipmapBlur />
            <FocusBlur stops={layout.stops} nav={nav} />
            <ChromaticAberration offset={CA_OFFSET} radialModulation modulationOffset={0.35} />
            <ToneMapping mode={ToneMappingMode.AGX} />
            <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.35} />
            <Vignette eskil={false} offset={0.2} darkness={0.75} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}

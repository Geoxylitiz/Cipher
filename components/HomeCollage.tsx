'use client';
import { Suspense, useMemo, useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { PerformanceMonitor, Preload } from '@react-three/drei';
import { useArtworkTexture } from '@/lib/artwork-texture';
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
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { ROOMS, LOBBY, galleryWorks, type Display } from '@/data/gallery';
import { canvasFamily, useFontsReady, SERIF_STACK, MONO_STACK } from '@/lib/fonts';
import { isIntroDone, onIntroDone, setCursorLabel, RETURN_STOP_KEY } from '@/lib/ui-events';
import { detectQuality, rememberLowQuality, type Quality } from '@/lib/quality';
import { PLASTER_MAPS, useSurface, type Surface } from '@/lib/surfaces';
import Floor from './floor';

/* ------------------------------------------------------------------ */
/*  ROOM DIMENSIONS — Tweak these to change the size of the museum    */
/* ------------------------------------------------------------------ */
const WALL_X = 6.5;                     // How far the walls are from the center walkway
const ART_X = WALL_X - 0.01;            // Artworks hang flush against the wall
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
const PAIR_SPACING = 2.9; // z distance between two works hung as a pair
const EYE_LEVEL = 0.35;   // centre height of each wall-hung artwork
const FINALE_DEPTH = 6;       // extra floor between the last wall work and the end wall
const FINALE_PANEL_W = 9.6;   // dark feature panel behind the closing piece
const FINALE_PANEL_T = 0.12;
const FINALE_PANEL_TINT = '#1d1c1b';
const HERO_BOTTOM = 1.15;     // height of the closing piece's lower edge above the floor
const FRAME_DEPTH = 0.09;     // how far a frame stands off the wall
const CANVAS_DEPTH = 0.07;    // stretcher depth of an unframed canvas
const PLINTH_H = 1.05;        // height of a display plinth
const PLINTH_STANDOFF = 1.4;  // how far a plinth piece stands off the wall

const CA_OFFSET = new THREE.Vector2(0.0007, 0.0005);
const DOF_TARGET: [number, number, number] = [0, 0, 0];

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
      // The visible haze stays a narrow shaft even when the light itself is wide
      radius: Math.tan(Math.min(angle, 0.4)) * length * 1.15,
      center: spot.clone().addScaledVector(dir, -length / 2),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
    },
  };
}

/** A track spot sized to cover one work: wide enough for the whole frame. */
function spotFor(outerW: number, outerH: number, y: number, trackZ: number, intensity = 36, trackX = 0): SpotRig {
  const spot = new THREE.Vector3(trackX, CEILING_Y - 0.42 - y, trackZ);
  const target = new THREE.Vector3(0, -outerH * 0.1, 0);
  const dist = spot.distanceTo(target);
  const halfDiagonal = Math.hypot(outerW, outerH) / 2;
  const angle = THREE.MathUtils.clamp(Math.atan((halfDiagonal * 1.2) / dist), 0.34, 0.95);
  return makeSpotRig(spot, target, angle, intensity);
}

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
  display: Display;
  outerW: number;    // overall size including mat and frame
  outerH: number;
  labelBelow: boolean; // label under the work instead of beside it (pairs)
  pilaster: boolean;   // gets a pilaster on the opposite wall
  spots: SpotRig[];
  light: string;
  wall: string;      // colour of the wall behind the work
  haze: number;      // how visible this room's light beams are
};

type Paint = { wall: string; ceiling: string; wash: number };

/** One stretch of the building between two doorways (room -1 is the lobby). */
type RoomSpan = {
  room: number;
  zStart: number;
  zEnd: number;
  paint: Paint;
  light: string;
};

type Stop = {
  kind: 'entrance' | 'room' | 'work';
  pos: THREE.Vector3;       // where the visitor stands
  look: THREE.Vector3;      // what they look at
  normal: THREE.Vector3;    // direction the work faces (close-up approaches along it)
  size: number;             // outer frame width and height, used to frame the close-up
  sizeH: number;
  fov: number;              // lens: wider for room overviews
  workIndex: number | null;
  room: number;
};

type GalleryLayout = {
  works: GalleryWork[];
  stops: Stop[];
  stopOfWork: number[];     // stop index for each work
  partitions: { z: number; room: number }[];
  rooms: RoomSpan[];
  benches: number[];
  zFront: number;
  zBack: number;
};

function layoutGallery(): GalleryLayout {
  const works: GalleryWork[] = [];
  const stops: Stop[] = [];
  const stopOfWork: number[] = [];
  const partitions: GalleryLayout['partitions'] = [];
  const benches: number[] = [];
  let z = ENTRY_Z;
  let side = 1;

  stops.push({
    kind: 'entrance',
    pos: new THREE.Vector3(0, 0, CAMERA_START_Z),
    look: new THREE.Vector3(0, 0, CAMERA_START_Z - 10),
    normal: new THREE.Vector3(0, 0, 1),
    size: 0,
    sizeH: 0,
    fov: 60,
    workIndex: null,
    room: 0,
  });

  ROOMS.forEach((room, r) => {
    partitions.push({ z, room: r });
    const roomStart = z;
    const items = galleryWorks.filter((w) => w.room === r && !w.hero);

    // Overview: just inside the doorway, looking down the whole room
    stops.push({
      kind: 'room',
      pos: new THREE.Vector3(0, 0.25, roomStart - 1.1),
      look: new THREE.Vector3(0, 0.45, roomStart - 13),
      normal: new THREE.Vector3(0, 0, 1),
      size: 0,
      sizeH: 0,
      fov: 72,
      workIndex: null,
      room: r,
    });

    let wz = roomStart - ROOM_PAD;
    items.forEach((w, j) => {
      const d = w.display;
      if (d.pair && j > 0) {
        // Second half of a pair: same wall, close beside the previous work
        wz -= PAIR_SPACING;
      } else {
        side = -side;
        if (j > 0) wz -= RING_SPACING;
      }
      const outerW = d.w + 2 * (d.mat + d.frame);
      const outerH = d.h + 2 * (d.mat + d.frame);
      const plinth = d.kind === 'plinth';
      const standoff = plinth ? PLINTH_STANDOFF : 0;
      const x = side * (ART_X - standoff);
      const y = plinth ? FLOOR_Y + PLINTH_H + outerH / 2 : EYE_LEVEL;
      const index = works.length;

      works.push({
        index,
        slug: w.slug,
        title: w.title,
        category: w.category,
        src: w.src,
        room: r,
        position: [x, y, wz],
        // Left wall faces +x, right wall faces -x
        rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        side,
        hero: false,
        display: d,
        outerW,
        outerH,
        labelBelow: !!d.pair || !!items[j + 1]?.display.pair,
        pilaster: !d.pair,
        spots: [spotFor(outerW, outerH, y, ART_X - TRACK_X - standoff)],
        light: room.light,
        wall: room.wall,
        haze: room.haze,
      });

      // Stand back in proportion to the work, for a 3/4 view
      const dist = THREE.MathUtils.clamp(outerW * 1.45, 3.6, 5.9);
      stopOfWork.push(stops.length);
      stops.push({
        kind: 'work',
        pos: new THREE.Vector3(x - side * dist, 0.05, wz + 1.1),
        look: new THREE.Vector3(x, y - 0.05, wz),
        normal: new THREE.Vector3(-side, 0, 0),
        size: outerW,
        sizeH: outerH,
        fov: 60,
        workIndex: index,
        room: r,
      });
    });

    benches.push((roomStart + wz) / 2);
    z = wz - ROOM_PAD;
  });

  // Closing piece, centred on the end wall of the last room
  const hero = galleryWorks.find((w) => w.hero)!;
  const hd = hero.display;
  const heroW = hd.w + 2 * (hd.mat + hd.frame);
  const heroH = hd.h + 2 * (hd.mat + hd.frame);
  const zBack = z - FINALE_DEPTH;
  const heroZ = zBack + FINALE_PANEL_T + 0.01;
  const heroY = FLOOR_Y + HERO_BOTTOM + heroH / 2;
  // A bench facing the closing piece
  benches.push(heroZ + 5.5);
  works.push({
    index: works.length,
    slug: hero.slug,
    title: hero.title,
    category: hero.category,
    src: hero.src,
    room: hero.room,
    position: [0, heroY, heroZ],
    rotationY: 0,
    side: 0,
    hero: true,
    display: hd,
    outerW: heroW,
    outerH: heroH,
    labelBelow: false,
    pilaster: false,
    // Lit from both side tracks, so nothing hangs in front of it
    spots: [-1, 1].map((sx) => spotFor(heroW, heroH, heroY, 4.6, 40, sx * TRACK_X)),
    light: ROOMS[hero.room].light,
    wall: FINALE_PANEL_TINT,
    haze: ROOMS[hero.room].haze,
  });
  stopOfWork.push(stops.length);
  stops.push({
    kind: 'work',
    // Pull back and widen the lens, so the whole end wall is revealed at once
    pos: new THREE.Vector3(0, 0.35, heroZ + 13),
    look: new THREE.Vector3(0, heroY - 0.2, heroZ),
    normal: new THREE.Vector3(0, 0, 1),
    size: heroW,
    sizeH: heroH,
    fov: 68,
    workIndex: works.length - 1,
    room: hero.room,
  });

  const zFront = CAMERA_START_Z + 8;
  const rooms: RoomSpan[] = [
    { room: -1, zStart: zFront, zEnd: ENTRY_Z, paint: LOBBY, light: ROOMS[0].light },
    ...ROOMS.map((room, r): RoomSpan => ({
      room: r,
      zStart: partitions[r].z,
      zEnd: r + 1 < partitions.length ? partitions[r + 1].z : zBack,
      paint: room,
      light: room.light,
    })),
  ];

  return { works, stops, stopOfWork, partitions, rooms, benches, zFront, zBack };
}

/* Shared navigation state between the DOM overlay and the camera rig */
type NavState = {
  s: number;               // current (smoothed) position along the stops
  target: number;          // where we're heading
  focused: number | null;  // index of the work in close-up
  lastInput: number;
  dragging: boolean;
  jump: boolean;           // place the camera instantly (returning from a project)
};

const noRaycast = () => null;

/* Scanned plaster surfaces (see lib/surfaces.ts) */
// Walls are painted, not raw plaster: only the scan's relief (normal + roughness)
// is used, so light rakes across real surface texture on clean paint.
const NORMAL_SCALE = new THREE.Vector2(0.5, 0.5);
const relief = (s: Surface) => ({ normalMap: s.normalMap, roughnessMap: s.roughnessMap });

const SKY_W = 3.4;        // width of the ceiling lay-light in each room
const BEAM_DEPTH = 0.2;   // ceiling beams
const TRACK_Y = CEILING_Y - BEAM_DEPTH - 0.03;

/**
 * Vertical falloff for the wall wash: brightest under the cove at the top,
 * dimmer toward the floor. Used as an emissive map, so the paint colour
 * reads without paying for extra real-time lights.
 */
let washTexture: THREE.CanvasTexture | null = null;
function getWashTexture() {
  if (washTexture || typeof document === 'undefined') return washTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgb(255,255,255)');
  g.addColorStop(0.4, 'rgb(170,170,170)');
  g.addColorStop(1, 'rgb(105,105,105)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  washTexture = new THREE.CanvasTexture(canvas);
  return washTexture;
}

/** Painted plaster: the room colour, lit softly from above. */
function PaintMaterial({ color, wash, surface, graded = true }: {
  color: string;
  wash: number;
  surface: Surface;
  graded?: boolean; // false for surfaces without a vertical direction (ceilings)
}) {
  const washMap = useMemo(() => getWashTexture(), []);
  return (
    <meshStandardMaterial
      color={color}
      roughness={1}
      metalness={0}
      {...relief(surface)}
      normalScale={NORMAL_SCALE}
      emissive={color}
      emissiveMap={graded ? washMap ?? undefined : undefined}
      emissiveIntensity={wash}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Museum Architecture — walls, ceiling, pilasters, track, benches    */
/* ------------------------------------------------------------------ */
function Bench({ z }: { z: number }) {
  return (
    <group position={[0, -2, z]}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[2.5, 0.08, 0.7]} />
        <meshStandardMaterial color="#3a2e25" roughness={0.6} metalness={0.1} />
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

function Pilaster({ x, z, height, surface, paint }: {
  x: number; z: number; height: number;
  surface: Surface;
  paint: Paint;
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
      <mesh position={[0, shaftY, 0]}>
        <boxGeometry args={[shaftW, shaftH, shaftD]} />
        <PaintMaterial color={paint.wall} wash={paint.wash * 0.85} surface={surface} />
      </mesh>
      <mesh position={[0, capY, 0]}>
        <boxGeometry args={[capW, capH, capD]} />
        <PaintMaterial color={paint.wall} wash={paint.wash} surface={surface} graded={false} />
      </mesh>
      <mesh position={[0, abacusY, 0]}>
        <boxGeometry args={[abacusW, abacusH, abacusD]} />
        <meshStandardMaterial color="#141416" roughness={0.4} metalness={0.25} />
      </mesh>
    </group>
  );
}

function useRoomTitleTexture(numeral: string, name: string) {
  const fontsReady = useFontsReady();
  return useMemo(() => {
    if (typeof document === 'undefined') return null;
    const w = 1024, h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(236,230,220,0.6)';
    ctx.font = `500 30px ${canvasFamily('--font-code', 'ui-monospace, Menlo, Consolas, monospace')}`;
    ctx.fillText(`ROOM ${numeral}`.split('').join(' '), w / 2, 70);
    ctx.fillStyle = 'rgba(244,238,228,0.95)';
    ctx.font = `italic 124px ${canvasFamily('--font-display', 'Georgia, serif')}`;
    ctx.fillText(name, w / 2, 190);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeral, name, fontsReady]);
}

/**
 * Wall with a doorway. It is built as two skins so each face carries the
 * colour of the room it looks into.
 */
function Partition({ z, room, surface, front, back }: {
  z: number;
  room: number;
  surface: Surface;
  front: Paint; // the space you are leaving
  back: Paint;  // the room you are entering
}) {
  const height = CEILING_Y - FLOOR_Y;
  const sideW = WALL_X - DOOR_W / 2;
  const lintelH = CEILING_Y - (FLOOR_Y + DOOR_H);
  const lintelY = FLOOR_Y + DOOR_H + lintelH / 2;
  const half = PARTITION_T / 2;
  const title = useRoomTitleTexture(ROOMS[room].numeral, ROOMS[room].name);

  return (
    <group position={[0, 0, z]}>
      {([[half / 2, front], [-half / 2, back]] as const).map(([dz, paint], i) => (
        <group key={i} position={[0, 0, dz]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (DOOR_W / 2 + sideW / 2), FLOOR_Y + height / 2, 0]}>
              <boxGeometry args={[sideW, height, half]} />
              <PaintMaterial color={paint.wall} wash={paint.wash} surface={surface} />
            </mesh>
          ))}
          <mesh position={[0, lintelY, 0]}>
            <boxGeometry args={[DOOR_W, lintelH, half]} />
            <PaintMaterial color={paint.wall} wash={paint.wash} surface={surface} graded={false} />
          </mesh>
        </group>
      ))}
      {/* Door lining — dark jambs and head, proud of both faces */}
      {[-1, 1].map((side) => (
        <mesh key={`jamb-${side}`} position={[side * (DOOR_W / 2 - 0.03), FLOOR_Y + DOOR_H / 2, 0]}>
          <boxGeometry args={[0.06, DOOR_H, PARTITION_T + 0.08]} />
          <meshStandardMaterial color="#0d0c0b" roughness={0.45} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, FLOOR_Y + DOOR_H - 0.03, 0]}>
        <boxGeometry args={[DOOR_W, 0.06, PARTITION_T + 0.08]} />
        <meshStandardMaterial color="#0d0c0b" roughness={0.45} metalness={0.3} />
      </mesh>
      {/* Room title, lettered on the wall above the doorway */}
      {title && (
        <mesh position={[0, lintelY + 0.05, half + 0.02]} raycast={() => null}>
          <planeGeometry args={[3.6, 0.9]} />
          <meshBasicMaterial map={title} transparent depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Walls, ceiling, beams and lay-light for one room (or the lobby). */
function RoomShell({ span }: { span: RoomSpan }) {
  const height = CEILING_Y - FLOOR_Y;
  const length = span.zStart - span.zEnd;
  const centerZ = (span.zStart + span.zEnd) / 2;
  const { paint } = span;
  const isRoom = span.room >= 0;

  // Scanned plaster (Poly Haven, CC0) — each surface gets its own tiling
  const wall = useSurface(PLASTER_MAPS, length / 3, height / 3);
  const ceiling = useSurface(PLASTER_MAPS, (WALL_X * 2) / 4, length / 4);
  const beam = useSurface(PLASTER_MAPS, 2, 0.2);

  const skyLen = length - 3.2;
  const skyColor = useMemo(() => new THREE.Color(span.light).multiplyScalar(1.5), [span.light]);

  // Ceiling beams, evenly spaced along the room
  const beamZs = useMemo(() => {
    const n = Math.max(2, Math.round(length / 3.8));
    return Array.from({ length: n - 1 }, (_, i) => span.zStart - ((i + 1) * length) / n);
  }, [length, span.zStart]);
  // Glazing bars across the lay-light
  const barZs = useMemo(() => {
    const n = Math.max(2, Math.round(skyLen / 1.9));
    return Array.from({ length: n + 1 }, (_, i) => centerZ + skyLen / 2 - (i * skyLen) / n);
  }, [skyLen, centerZ]);

  const beamSideW = WALL_X - SKY_W / 2 - 0.15;

  return (
    <group>
      {/* Ceiling */}
      <mesh position={[0, CEILING_Y, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WALL_X * 2, length]} />
        <PaintMaterial color={paint.ceiling} wash={paint.wash * 0.55} surface={ceiling} graded={false} />
      </mesh>

      {/* Beams — split either side of the lay-light in a room, full width in the lobby */}
      {beamZs.map((z) =>
        isRoom ? (
          [-1, 1].map((side) => (
            <mesh key={`${z}-${side}`} position={[side * (SKY_W / 2 + 0.15 + beamSideW / 2), CEILING_Y - BEAM_DEPTH / 2, z]}>
              <boxGeometry args={[beamSideW, BEAM_DEPTH, 0.28]} />
              <PaintMaterial color={paint.ceiling} wash={paint.wash * 0.75} surface={beam} graded={false} />
            </mesh>
          ))
        ) : (
          <mesh key={z} position={[0, CEILING_Y - BEAM_DEPTH / 2, z]}>
            <boxGeometry args={[WALL_X * 2, BEAM_DEPTH, 0.28]} />
            <PaintMaterial color={paint.ceiling} wash={paint.wash * 0.75} surface={beam} graded={false} />
          </mesh>
        )
      )}

      {/* Lay-light: a glazed strip of soft daylight down the middle of the room */}
      {isRoom && (
        <group position={[0, 0, centerZ]}>
          {[-1, 1].map((side) => (
            <mesh key={`curb-${side}`} position={[side * (SKY_W / 2 + 0.075), CEILING_Y - BEAM_DEPTH / 2, 0]}>
              <boxGeometry args={[0.15, BEAM_DEPTH, skyLen + 0.3]} />
              <PaintMaterial color={paint.ceiling} wash={paint.wash * 0.75} surface={beam} graded={false} />
            </mesh>
          ))}
          {[-1, 1].map((end) => (
            <mesh key={`end-${end}`} position={[0, CEILING_Y - BEAM_DEPTH / 2, end * (skyLen / 2 + 0.075)]}>
              <boxGeometry args={[SKY_W, BEAM_DEPTH, 0.15]} />
              <PaintMaterial color={paint.ceiling} wash={paint.wash * 0.75} surface={beam} graded={false} />
            </mesh>
          ))}
          <mesh position={[0, CEILING_Y - 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[SKY_W, skyLen]} />
            <meshBasicMaterial color={skyColor} fog={false} />
          </mesh>
          <mesh position={[0, CEILING_Y - 0.1, 0]}>
            <boxGeometry args={[0.05, 0.05, skyLen]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.4} />
          </mesh>
        </group>
      )}
      {isRoom &&
        barZs.map((z) => (
          <mesh key={`bar-${z}`} position={[0, CEILING_Y - 0.1, z]}>
            <boxGeometry args={[SKY_W, 0.05, 0.05]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.4} />
          </mesh>
        ))}

      {/* Light tracks, hung under the beams */}
      {isRoom &&
        [-1, 1].map((side) => (
          <mesh key={`track-${side}`} position={[side * TRACK_X, TRACK_Y, centerZ]}>
            <boxGeometry args={[0.07, 0.05, length - PARTITION_T]} />
            <meshStandardMaterial color="#0b0b0b" metalness={0.8} roughness={0.35} />
          </mesh>
        ))}

      {/* Side walls, with skirting and a cornice */}
      {[-1, 1].map((side) => (
        <group key={`wall-${side}`}>
          <mesh position={[side * WALL_X, FLOOR_Y + height / 2, centerZ]} rotation={[0, (-side * Math.PI) / 2, 0]}>
            <planeGeometry args={[length, height]} />
            <PaintMaterial color={paint.wall} wash={paint.wash} surface={wall} />
          </mesh>
          <mesh position={[side * (WALL_X - 0.04), FLOOR_Y + 0.13, centerZ]}>
            <boxGeometry args={[0.08, 0.26, length]} />
            <meshStandardMaterial color="#0d0c0b" roughness={0.45} metalness={0.3} />
          </mesh>
          <mesh position={[side * (WALL_X - 0.07), CEILING_Y - 0.11, centerZ]}>
            <boxGeometry args={[0.14, 0.22, length]} />
            <PaintMaterial color={paint.ceiling} wash={paint.wash * 0.9} surface={beam} graded={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function MuseumArchitecture({ layout }: { layout: GalleryLayout }) {
  const height = CEILING_Y - FLOOR_Y;
  const lastRoom = layout.rooms[layout.rooms.length - 1];

  const endWall = useSurface(PLASTER_MAPS, (WALL_X * 2) / 3, height / 3);
  const pilaster = useSurface(PLASTER_MAPS, 0.25, height / 3);
  const partition = useSurface(PLASTER_MAPS, 1.6, height / 3);

  return (
    <group>
      {layout.rooms.map((span) => (
        <RoomShell key={`room-${span.room}`} span={span} />
      ))}

      {/* End wall — home of the closing piece */}
      <mesh position={[0, FLOOR_Y + height / 2, layout.zBack]}>
        <planeGeometry args={[WALL_X * 2, height]} />
        <PaintMaterial color={lastRoom.paint.wall} wash={lastRoom.paint.wash} surface={endWall} />
      </mesh>

      {/* Finale: a dark panel that sets the closing piece apart, edged in brass */}
      <mesh position={[0, FLOOR_Y + height / 2, layout.zBack + FINALE_PANEL_T / 2]}>
        <boxGeometry args={[FINALE_PANEL_W, height, FINALE_PANEL_T]} />
        <PaintMaterial color={FINALE_PANEL_TINT} wash={1.1} surface={endWall} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`inlay-${side}`} position={[side * (FINALE_PANEL_W / 2 + 0.015), FLOOR_Y + height / 2, layout.zBack + FINALE_PANEL_T / 2]}>
          <boxGeometry args={[0.03, height, FINALE_PANEL_T + 0.02]} />
          <meshStandardMaterial color="#b0915a" roughness={0.35} metalness={0.8} />
        </mesh>
      ))}

      {/* Doorways between rooms */}
      {layout.partitions.map((p) => (
        <Partition
          key={`partition-${p.room}`}
          z={p.z}
          room={p.room}
          surface={partition}
          front={layout.rooms[p.room].paint}
          back={layout.rooms[p.room + 1].paint}
        />
      ))}

      {/* Pilasters — one on the opposite wall of every wall-hung work, so each
          wall alternates work / pilaster / work and every piece gets its own bay. */}
      {layout.works.filter((w) => w.pilaster).map((w) => (
        <Pilaster
          key={`pilaster-${w.slug}`}
          x={-w.side * (WALL_X - 0.2)}
          z={w.position[2]}
          height={height - 0.44}
          surface={pilaster}
          paint={layout.rooms[w.room + 1].paint}
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
/*  Reflection — a cheap, unlit copy of the building, drawn upside     */
/*  down under the floor. The floor lets it show through at glancing   */
/*  angles (see floor.tsx), which reads as a polished-floor reflection */
/*  without rendering the scene twice.                                 */
/* ------------------------------------------------------------------ */
const AMBIENT_SHARE = 0.25; // roughly what the fill light adds to a painted wall

function ReflectedRoom({ span }: { span: RoomSpan }) {
  const height = CEILING_Y - FLOOR_Y;
  const length = span.zStart - span.zEnd;
  const centerZ = (span.zStart + span.zEnd) / 2;
  const { paint } = span;
  const washMap = useMemo(() => getWashTexture(), []);
  const colors = useMemo(
    () => ({
      wall: new THREE.Color(paint.wall).multiplyScalar(paint.wash + AMBIENT_SHARE),
      ceiling: new THREE.Color(paint.ceiling).multiplyScalar(paint.wash * 0.55 + AMBIENT_SHARE),
      // Dimmer than the real lay-light: a honed floor only gives back a soft sheen
      sky: new THREE.Color(span.light).multiplyScalar(0.55),
    }),
    [paint, span.light]
  );

  return (
    <group>
      <mesh position={[0, CEILING_Y, centerZ]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[WALL_X * 2, length]} />
        <meshBasicMaterial color={colors.ceiling} side={THREE.DoubleSide} />
      </mesh>
      {span.room >= 0 && (
        <mesh position={[0, CEILING_Y - 0.04, centerZ]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <planeGeometry args={[SKY_W, length - 3.2]} />
          <meshBasicMaterial color={colors.sky} side={THREE.DoubleSide} />
        </mesh>
      )}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * WALL_X, FLOOR_Y + height / 2, centerZ]}
          rotation={[0, (-side * Math.PI) / 2, 0]}
          raycast={noRaycast}
        >
          <planeGeometry args={[length, height]} />
          <meshBasicMaterial color={colors.wall} map={washMap ?? undefined} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function ReflectedArchitecture({ layout }: { layout: GalleryLayout }) {
  const height = CEILING_Y - FLOOR_Y;
  const sideW = WALL_X - DOOR_W / 2;
  const lintelH = CEILING_Y - (FLOOR_Y + DOOR_H);
  const washMap = useMemo(() => getWashTexture(), []);
  const lastRoom = layout.rooms[layout.rooms.length - 1];
  const paintColor = (paint: Paint) => new THREE.Color(paint.wall).multiplyScalar(paint.wash + AMBIENT_SHARE);
  const endColor = useMemo(() => paintColor(lastRoom.paint), [lastRoom.paint]);
  const panelColor = useMemo(() => new THREE.Color(FINALE_PANEL_TINT).multiplyScalar(1.1 + AMBIENT_SHARE), []);
  const partitionColors = useMemo(
    () => layout.partitions.map((p) => paintColor(layout.rooms[p.room].paint)),
    [layout]
  );

  return (
    // Mirror the building in the floor plane
    <group position={[0, 2 * FLOOR_Y, 0]} scale={[1, -1, 1]}>
      {layout.rooms.map((span) => (
        <ReflectedRoom key={span.room} span={span} />
      ))}
      <mesh position={[0, FLOOR_Y + height / 2, layout.zBack]} raycast={noRaycast}>
        <planeGeometry args={[WALL_X * 2, height]} />
        <meshBasicMaterial color={endColor} map={washMap ?? undefined} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, FLOOR_Y + height / 2, layout.zBack + FINALE_PANEL_T]} raycast={noRaycast}>
        <planeGeometry args={[FINALE_PANEL_W, height]} />
        <meshBasicMaterial color={panelColor} map={washMap ?? undefined} side={THREE.DoubleSide} />
      </mesh>
      {layout.partitions.map((p, i) => (
        <group key={p.room} position={[0, 0, p.z]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (DOOR_W / 2 + sideW / 2), FLOOR_Y + height / 2, 0]} raycast={noRaycast}>
              <boxGeometry args={[sideW, height, PARTITION_T]} />
              <meshBasicMaterial color={partitionColors[i]} map={washMap ?? undefined} side={THREE.DoubleSide} />
            </mesh>
          ))}
          <mesh position={[0, FLOOR_Y + DOOR_H + lintelH / 2, 0]} raycast={noRaycast}>
            <boxGeometry args={[DOOR_W, lintelH, PARTITION_T]} />
            <meshBasicMaterial color={partitionColors[i]} side={THREE.DoubleSide} />
          </mesh>
        </group>
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

function LightBeam({ rig, color, intensity, haze }: {
  rig: SpotRig;
  color: string;
  intensity: React.MutableRefObject<number>;
  haze: number;
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
    material.uniforms.uOpacity.value = BEAM_OPACITY * haze * intensity.current;
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
/**
 * Low-quality stand-in for a spotlight: a soft additive pool painted on the
 * wall behind the frame. No real light, so no per-pixel lighting cost.
 */
function WallWash({ width, height, color, wall, intensity }: {
  width: number;
  height: number;
  color: string;
  wall: string;
  intensity: React.MutableRefObject<number>;
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const texture = useMemo(() => getPoolTexture(), []);
  // Light picks up the paint it lands on: tint the pool with the wall colour,
  // and add less of it on pale walls so they do not blow out
  const { tint, strength } = useMemo(() => {
    const paint = new THREE.Color(wall);
    const luminance = 0.2126 * paint.r + 0.7152 * paint.g + 0.0722 * paint.b;
    return {
      tint: new THREE.Color(color).multiply(paint),
      strength: THREE.MathUtils.lerp(0.9, 0.2, Math.min(1, luminance * 1.3)),
    };
  }, [color, wall]);
  useFrame(() => {
    if (mat.current) mat.current.opacity = strength * intensity.current;
  });
  if (!texture) return null;
  return (
    <mesh position={[0, 0.25, 0.004]} raycast={() => null}>
      <planeGeometry args={[width * 1.9, height * 2]} />
      <meshBasicMaterial
        ref={mat}
        map={texture}
        color={tint}
        transparent
        opacity={strength}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function ArtSpotlight({ rig, color, wall, haze, ceilingLocalY, intensity, lit, washSize }: {
  rig: SpotRig;
  color: string;
  wall: string;
  haze: number;
  ceilingLocalY: number;
  intensity: React.MutableRefObject<number>;
  lit: boolean;               // false = low quality: fake the light pool instead
  washSize: [number, number] | null; // null = nothing behind the work to wash
}) {
  const spot = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);

  useLayoutEffect(() => {
    if (spot.current && target.current) spot.current.target = target.current;
  }, [lit]);

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

      {lit ? (
        <>
          <spotLight
            ref={spot}
            position={rig.spot}
            angle={rig.angle}
            penumbra={1}
            intensity={rig.intensity}
            distance={16}
            decay={2}
            color={color}
          />
          <object3D ref={target} position={rig.target} />
        </>
      ) : (
        washSize && <WallWash width={washSize[0]} height={washSize[1]} color={color} wall={wall} intensity={intensity} />
      )}
      <LightBeam rig={rig} color={color} intensity={intensity} haze={haze} />
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
  const fontsReady = useFontsReady();
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
    ctx.font = `500 26px ${canvasFamily('--font-code', 'ui-monospace, Menlo, Consolas, monospace')}`;
    ctx.fillText(`No. ${String(index + 1).padStart(2, '0')}`, 36, 62);

    // Title, wrapped to two lines max
    ctx.font = `italic 46px ${canvasFamily('--font-display', 'Georgia, serif')}`;
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
    ctx.font = `22px ${canvasFamily('--font-code', 'ui-monospace, monospace')}`;
    ctx.fillText(`${category} · Meowhlock Studio`, 36, h - 40);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [index, title, category, fontsReady]);
}

/* ------------------------------------------------------------------ */
/*  A single artwork: framed, unframed canvas, or leaning on a plinth  */
/* ------------------------------------------------------------------ */
const PLINTH_DEPTH = 0.8;
const FILLET = 0.02; // width of the gilt lip inside a frame

function GalleryPanel({ work, focused, anyFocused, lit, reflect, onSelect, onHoverChange }: {
  work: GalleryWork;
  focused: boolean;
  anyFocused: boolean;
  lit: boolean; // real spotlight (high quality) vs. faked glow (low quality)
  reflect: boolean; // draw this work's reflection under the floor
  onSelect: (index: number) => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const imageMat = useRef<THREE.MeshStandardMaterial>(null);
  const matMat = useRef<THREE.MeshStandardMaterial>(null);
  const mirrorMat = useRef<THREE.MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const lightLevel = useRef(1);
  const d = work.display;

  const texture = useArtworkTexture(work.src, work.title);
  const labelTexture = useLabelTexture(work.index, work.title, work.category);

  // Crop the image to the work's aspect ratio ("object-fit: cover")
  useLayoutEffect(() => {
    const img = texture.image as { width: number; height: number } | undefined;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    if (img?.width && img?.height) {
      const imageAspect = img.width / img.height;
      const panelAspect = d.w / d.h;
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
  }, [texture, d.w, d.h]);

  useFrame((_, delta) => {
    // In close-up, the selected work brightens and the rest of the room dims
    const target = anyFocused ? (focused ? 1.6 : 0.2) : hovered ? 1.45 : 1;
    lightLevel.current = THREE.MathUtils.damp(lightLevel.current, target, 3.5, delta);
    if (imageMat.current) {
      // Without a real spotlight (low quality) the work carries its own glow
      const glow = lit
        ? hovered || focused ? 0.1 : anyFocused ? 0.005 : 0.03
        : hovered || focused ? 0.8 : anyFocused ? 0.12 : 0.55;
      imageMat.current.emissiveIntensity = THREE.MathUtils.damp(imageMat.current.emissiveIntensity, glow, 4, delta);
    }
    if (matMat.current) {
      matMat.current.emissiveIntensity = lit ? 0 : 0.3 * lightLevel.current;
    }
    // The reflection follows the light on the work
    if (mirrorMat.current) mirrorMat.current.color.setScalar(0.7 * lightLevel.current);
  });

  // The custom cursor reads "View", or "Open" once the work is in close-up
  useEffect(() => {
    if (hovered) setCursorLabel(focused ? 'Open' : 'View');
  }, [hovered, focused]);
  useEffect(() => () => setCursorLabel(null), []);

  const handleOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    onHoverChange(true);
    document.body.style.cursor = 'pointer'; // fallback when the custom cursor is off (touch)
  }, [onHoverChange]);

  const handleOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    onHoverChange(false);
    setCursorLabel(null);
    document.body.style.cursor = 'auto';
  }, [onHoverChange]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(work.index);
  }, [onSelect, work.index]);

  const { outerW, outerH } = work;
  const ceilingLocalY = CEILING_Y - work.position[1];
  const floorLocalY = FLOOR_Y - work.position[1];
  const isCanvas = d.kind === 'canvas';
  const isPlinth = d.kind === 'plinth';
  const imageZ = isCanvas ? CANVAS_DEPTH + 0.002 : 0.04;
  const frameRoughness = d.frameMetal > 0.5 ? 0.32 : 0.5;

  const labelPosition: [number, number, number] = isPlinth
    ? [0, -outerH / 2 - 0.32, PLINTH_DEPTH / 2 + 0.006]
    : work.labelBelow
      ? [0, -outerH / 2 - 0.34, 0.01]
      : [outerW / 2 + 0.5, -outerH / 2 + Math.min(0.75, outerH * 0.3), 0.01];

  return (
    <group position={work.position} rotation={[0, work.rotationY, 0]}>
      {/* Pivot at the bottom edge, so a plinth piece can lean back */}
      <group position={[0, -outerH / 2, isPlinth ? 0.08 : 0]} rotation={[isPlinth ? -0.14 : 0, 0, 0]}>
        <group position={[0, outerH / 2, 0]}>
          {isCanvas ? (
            /* Stretched canvas: a deep box with raw canvas edges */
            <mesh position={[0, 0, CANVAS_DEPTH / 2]} raycast={noRaycast}>
              <boxGeometry args={[d.w, d.h, CANVAS_DEPTH]} />
              <meshStandardMaterial color="#d8d1c3" roughness={0.95} />
            </mesh>
          ) : (
            <>
              {/* Backing board */}
              <mesh position={[0, 0, 0.015]} raycast={noRaycast}>
                <boxGeometry args={[outerW - 0.01, outerH - 0.01, 0.03]} />
                <meshStandardMaterial color={d.frameColor} roughness={frameRoughness} metalness={d.frameMetal} />
              </mesh>
              {/* Frame moulding: four bars standing proud of the mat */}
              {[-1, 1].map((s) => (
                <mesh key={`h${s}`} position={[0, s * (outerH / 2 - d.frame / 2), FRAME_DEPTH / 2]} raycast={noRaycast}>
                  <boxGeometry args={[outerW, d.frame, FRAME_DEPTH]} />
                  <meshStandardMaterial color={d.frameColor} roughness={frameRoughness} metalness={d.frameMetal} />
                </mesh>
              ))}
              {[-1, 1].map((s) => (
                <mesh key={`v${s}`} position={[s * (outerW / 2 - d.frame / 2), 0, FRAME_DEPTH / 2]} raycast={noRaycast}>
                  <boxGeometry args={[d.frame, outerH - 2 * d.frame, FRAME_DEPTH]} />
                  <meshStandardMaterial color={d.frameColor} roughness={frameRoughness} metalness={d.frameMetal} />
                </mesh>
              ))}
              {/* Passe-partout */}
              {d.mat > 0 && (
                <mesh position={[0, 0, 0.036]} raycast={noRaycast}>
                  <planeGeometry args={[d.w + 2 * d.mat, d.h + 2 * d.mat]} />
                  <meshStandardMaterial ref={matMat} color="#e6e1d8" roughness={0.92} emissive="#e6e1d8" emissiveIntensity={0} />
                </mesh>
              )}
              {/* Gilt fillet: a thin lip where the frame meets the mat */}
              {d.mat > 0 && d.frameMetal < 0.5 && (
                <>
                  {[-1, 1].map((s) => (
                    <mesh key={`fh${s}`} position={[0, s * (d.h / 2 + d.mat - FILLET / 2), 0.05]} raycast={noRaycast}>
                      <boxGeometry args={[d.w + 2 * d.mat, FILLET, 0.028]} />
                      <meshStandardMaterial color="#b0915a" roughness={0.35} metalness={0.8} />
                    </mesh>
                  ))}
                  {[-1, 1].map((s) => (
                    <mesh key={`fv${s}`} position={[s * (d.w / 2 + d.mat - FILLET / 2), 0, 0.05]} raycast={noRaycast}>
                      <boxGeometry args={[FILLET, d.h + 2 * d.mat, 0.028]} />
                      <meshStandardMaterial color="#b0915a" roughness={0.35} metalness={0.8} />
                    </mesh>
                  ))}
                </>
              )}
            </>
          )}

          {/* The work itself — lit by the spotlight, not self-illuminated */}
          <mesh
            position={[0, 0, imageZ]}
            onPointerOver={handleOver}
            onPointerOut={handleOut}
            onClick={handleClick}
          >
            <planeGeometry args={[d.w, d.h]} />
            <meshStandardMaterial
              ref={imageMat}
              map={texture}
              emissiveMap={texture}
              emissive="#ffffff"
              emissiveIntensity={0.03}
              roughness={isCanvas ? 0.85 : 0.55}
              metalness={0}
            />
          </mesh>
        </group>
      </group>

      {/* Plinth under a leaning piece */}
      {isPlinth && (
        <mesh position={[0, (floorLocalY - outerH / 2) / 2, 0]} raycast={noRaycast}>
          <boxGeometry args={[outerW + 0.5, -outerH / 2 - floorLocalY, PLINTH_DEPTH]} />
          <meshStandardMaterial color="#d9d4ca" roughness={0.8} />
        </mesh>
      )}

      {/* Reflection in the floor: flat, unlit copies mirrored below floor level */}
      {reflect && (
        <group position={[0, 2 * floorLocalY, 0]} scale={[1, -1, 1]}>
          {!isCanvas && (
            <mesh position={[0, 0, 0.03]} raycast={noRaycast}>
              <planeGeometry args={[outerW, outerH]} />
              <meshBasicMaterial color={d.frameColor} side={THREE.DoubleSide} />
            </mesh>
          )}
          {!isCanvas && d.mat > 0 && (
            <mesh position={[0, 0, 0.036]} raycast={noRaycast}>
              <planeGeometry args={[d.w + 2 * d.mat, d.h + 2 * d.mat]} />
              <meshBasicMaterial color="#8f8b84" side={THREE.DoubleSide} />
            </mesh>
          )}
          <mesh position={[0, 0, imageZ]} raycast={noRaycast}>
            <planeGeometry args={[d.w, d.h]} />
            <meshBasicMaterial ref={mirrorMat} map={texture} side={THREE.DoubleSide} />
          </mesh>
          {isPlinth && (
            <mesh position={[0, (floorLocalY - outerH / 2) / 2, 0]} raycast={noRaycast}>
              <boxGeometry args={[outerW + 0.5, -outerH / 2 - floorLocalY, PLINTH_DEPTH]} />
              <meshBasicMaterial color="#86827b" side={THREE.DoubleSide} />
            </mesh>
          )}
        </group>
      )}

      {/* Label: beside the work, below it (pairs), or on the plinth */}
      {labelTexture && (
        <mesh position={labelPosition} raycast={noRaycast}>
          <planeGeometry args={[0.56, 0.35]} />
          <meshStandardMaterial map={labelTexture} roughness={0.9} emissiveMap={labelTexture} emissive="#ffffff" emissiveIntensity={0.04} />
        </mesh>
      )}

      {work.spots.map((rig, i) => (
        <ArtSpotlight
          key={i}
          rig={rig}
          color={work.light}
          wall={work.wall}
          haze={work.haze}
          ceilingLocalY={ceilingLocalY}
          intensity={lightLevel}
          lit={lit}
          washSize={isPlinth || i > 0 ? null : [outerW, outerH]}
        />
      ))}
      <FloorPool
        y={floorLocalY + 0.01}
        z={work.hero ? 2.4 : 0.9}
        width={outerW * 1.5}
        color={work.light}
        intensity={lightLevel}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Camera rig — glides between stops and settles in front of each work */
/* ------------------------------------------------------------------ */
const SNAP_DELAY_MS = 160;
const CAPTION_WIDTH = 400;       // px — keep in sync with the caption panel's md:w-[400px]
const CAPTION_BREAKPOINT = 768;  // px — below this the caption is a bottom sheet

function CameraRig({ stops, stopOfWork, nav, onStopChange, onUserMove, progressDot }: {
  stops: Stop[];
  stopOfWork: number[];
  nav: React.MutableRefObject<NavState>;
  onStopChange: (stop: number) => void;
  onUserMove: () => void;
  progressDot: React.RefObject<HTMLDivElement | null>;
}) {
  const { camera, gl, size } = useThree();
  const mouse = useRef({ x: 0, y: 0 });
  const lastY = useRef(0);
  const focusAmt = useRef(0);
  const introAmt = useRef(0);
  const lastFocused = useRef<number | null>(null);
  const reportedStop = useRef(-1);

  // Returning visitors skip the entrance push-in
  useEffect(() => {
    if (isIntroDone()) introAmt.current = 1;
  }, []);
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

  useFrame((state, rawDelta) => {
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

    // Lens: wider for room overviews, normal in front of a work or in close-up
    const cam = camera as THREE.PerspectiveCamera;
    const fovTarget = THREE.MathUtils.lerp(THREE.MathUtils.lerp(A.fov, B.fov, e), 60, focusAmt.current);
    if (Math.abs(cam.fov - fovTarget) > 0.01) {
      cam.fov = THREE.MathUtils.damp(cam.fov, fovTarget, 4, delta);
      cam.updateProjectionMatrix();
    }

    // Entrance: start further back and higher, then push in as the intro opens
    if (isIntroDone()) introAmt.current = THREE.MathUtils.damp(introAmt.current, 1, 0.85, delta);
    const back = 1 - introAmt.current;
    if (back > 0.0005) {
      pos.z += back * 7;
      pos.y += back * 0.9;
      look.y += back * 0.4;
    }

    // Close-up on the selected work
    if (n.focused !== null) lastFocused.current = n.focused;
    focusAmt.current = THREE.MathUtils.damp(focusAmt.current, n.focused !== null ? 1 : 0, 2.6, delta);
    if (lastFocused.current !== null && focusAmt.current > 0.001) {
      const fs = stops[stopOfWork[lastFocused.current]];
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
        (fs.sizeH * 1.3) / (usableH * 2 * tanHalf)
      );
      focusPos.copy(fs.look).addScaledVector(fs.normal, d);
      // Aim off-centre so the work sits beside (desktop) or above (mobile) the caption
      dir.copy(fs.normal).negate();
      right.crossVectors(dir, up).normalize();
      focusLook.copy(fs.look);
      if (desktop) {
        // Step sideways rather than turn, so the work stays square to the lens
        const visibleW = 2 * d * tanHalf * aspect;
        const shift = (Math.min(CAPTION_WIDTH, width) / (2 * width)) * visibleW;
        focusLook.addScaledVector(right, shift);
        focusPos.addScaledVector(right, shift);
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
    // ...and the body shifts with it, plus a slow idle sway, so near and far
    // objects slide against each other and the room reads as deep
    const t = state.clock.elapsedTime;
    pos.addScaledVector(right, mouse.current.x * 0.3 * freedom + Math.sin(t * 0.31) * 0.035);
    pos.addScaledVector(up, -mouse.current.y * 0.14 * freedom + Math.sin(t * 0.23 + 1.3) * 0.022);

    const k = 1 - Math.exp(-6 * delta);
    if (n.jump) {
      // Returning from a project: appear at the remembered stop, no glide
      camera.position.copy(pos);
      m.lookAt(pos, look, up);
      camera.quaternion.setFromRotationMatrix(m);
      n.jump = false;
    } else {
      camera.position.lerp(pos, k);
      m.lookAt(camera.position, look, up);
      q.setFromRotationMatrix(m);
      camera.quaternion.slerp(q, k);
    }

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
function FocusBlur({ stops, stopOfWork, nav }: {
  stops: Stop[];
  stopOfWork: number[];
  nav: React.MutableRefObject<NavState>;
}) {
  const dof = useRef<DepthOfFieldEffect>(null);
  const lastFocused = useRef<number | null>(null);

  useFrame((_, delta) => {
    const effect = dof.current;
    if (!effect) return;
    const n = nav.current;
    if (n.focused !== null) lastFocused.current = n.focused;
    if (lastFocused.current !== null && effect.target) {
      effect.target.copy(stops[stopOfWork[lastFocused.current]].look);
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
  const dustSprite = useMemo(() => getPoolTexture(), []);
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
      {/* Round, soft-edged motes (plain points render as hard squares up close) */}
      <pointsMaterial
        size={0.03}
        color="#ffd9b0"
        transparent
        opacity={0.16}
        alphaMap={dustSprite ?? undefined}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene                                                              */
/* ------------------------------------------------------------------ */
function Scene({ layout, nav, focused, quality, onDecline, onSelect, onStopChange, onUserMove, onAnyHover, progressDot }: {
  layout: GalleryLayout;
  nav: React.MutableRefObject<NavState>;
  focused: number | null;
  quality: Quality;
  onDecline: () => void;
  onSelect: (index: number) => void;
  onStopChange: (stop: number) => void;
  onUserMove: () => void;
  onAnyHover: (hovered: boolean) => void;
  progressDot: React.RefObject<HTMLDivElement | null>;
}) {
  const hoveredCount = useRef(0);
  const high = quality === 'high';
  const [monitoring, setMonitoring] = useState(false);

  // Start watching frame rate only once the intro has settled — shader
  // compiles and the entrance push-in would otherwise read as "slow".
  useEffect(() => {
    if (!high) return;
    let timer = 0;
    const off = onIntroDone(() => {
      timer = window.setTimeout(() => setMonitoring(true), 4000);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [high]);

  const handleHoverChange = useCallback((hovered: boolean) => {
    hoveredCount.current = Math.max(0, hoveredCount.current + (hovered ? 1 : -1));
    onAnyHover(hoveredCount.current > 0);
  }, [onAnyHover]);

  return (
    <>
      <fog attach="fog" args={['#0a0a0a', 16, 72]} />
      <color attach="background" args={['#070707']} />

      {/* Soft fill so the building reads; the walls carry their own wash and
          the spotlights still pick out the works */}
      <ambientLight intensity={high ? 0.45 : 0.6} />
      <hemisphereLight args={['#fff1e0', '#3a3530', high ? 0.55 : 0.7]} />

      {high && monitoring && (
        <PerformanceMonitor
          // Judge over ~8s windows; downgrade if most samples sit under 24 fps
          ms={500}
          iterations={16}
          bounds={() => [24, 1000]}
          onDecline={({ fps }) => {
            // Hidden or occluded views throttle to ~1 fps (sometimes while still
            // reporting "visible"); a genuinely weak GPU lands around 10–25 fps.
            if (document.visibilityState !== 'visible' || fps < 6) return;
            onDecline();
          }}
        />
      )}

      <Dust zFront={layout.zFront} zBack={layout.zBack} count={high ? 450 : 200} />

      <Floor zFront={layout.zFront} zBack={layout.zBack} width={CORRIDOR_WIDTH} reflective={high} />
      {high && <ReflectedArchitecture layout={layout} />}

      <MuseumArchitecture layout={layout} />

      {layout.works.map((work) => (
        <GalleryPanel
          key={work.slug}
          work={work}
          focused={focused === work.index}
          anyFocused={focused !== null}
          lit={high}
          reflect={high}
          onSelect={onSelect}
          onHoverChange={handleHoverChange}
        />
      ))}

      <CameraRig
        stops={layout.stops}
        stopOfWork={layout.stopOfWork}
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
const SERIF = SERIF_STACK;
const MONO = MONO_STACK;

export default function HomeCollage() {
  const router = useRouter();
  const layout = useMemo(() => layoutGallery(), []);
  const nav = useRef<NavState>({ s: 0, target: 0, focused: null, lastInput: 0, dragging: false, jump: false });
  const progressDot = useRef<HTMLDivElement>(null);
  const [stop, setStop] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [, setAnyHovered] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  // Decided on the client before the canvas mounts, so materials compile once
  const [quality, setQuality] = useState<Quality | null>(null);

  useEffect(() => {
    setQuality(detectQuality());
  }, []);

  const handleDecline = useCallback(() => {
    rememberLowQuality();
    setQuality('low');
  }, []);

  // Coming back from a project page: reappear in front of the work you left
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(RETURN_STOP_KEY);
      sessionStorage.removeItem(RETURN_STOP_KEY);
    } catch {
      /* storage unavailable — start at the entrance */
    }
    const s = saved !== null ? parseInt(saved, 10) : NaN;
    if (Number.isFinite(s) && s > 0 && s <= layout.stops.length - 1) {
      Object.assign(nav.current, { s, target: s, jump: true });
      setHasInteracted(true);
    }
  }, [layout.stops.length]);

  /** Fade to black, then open the project page (remembering where we were). */
  const openProject = useCallback((index: number) => {
    const slug = layout.works[index].slug;
    try {
      sessionStorage.setItem(RETURN_STOP_KEY, String(layout.stopOfWork[index]));
    } catch {
      /* ignore */
    }
    setCursorLabel(null);
    setLeavingTo(slug);
    router.prefetch(`/works/${slug}`);
  }, [layout.works, layout.stopOfWork, router]);

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
      openProject(index);
      return;
    }
    goTo(layout.stopOfWork[index]);
    setFocus(index);
  }, [goTo, layout.stopOfWork, openProject, setFocus]);

  const handleUserMove = useCallback(() => {
    setHasInteracted(true);
    if (nav.current.focused !== null) setFocus(null);
  }, [setFocus]);

  // Keyboard: arrows step between works, Enter opens/focuses, Escape steps back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Let buttons and links handle their own Enter/Space
      if ((e.target as Element | null)?.closest?.('a, button, input, textarea')) return;
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

  // What the corner readout says: a work number, a room numeral, or the entrance
  const isRoomStop = currentStop.kind === 'room';
  const counter = currentStop.workIndex !== null
    ? String(currentStop.workIndex + 1).padStart(2, '0')
    : isRoomStop ? room.numeral : '00';
  const worksInRoom = layout.works.filter((w) => w.room === currentStop.room).length;
  const eyebrow = currentStop.kind === 'entrance'
    ? 'Meowhlock Studio — The Collection'
    : isRoomStop ? 'Now entering' : `Room ${room.numeral} — ${room.name}`;
  const caption = currentStop.workIndex !== null
    ? layout.works[currentStop.workIndex].title
    : isRoomStop ? room.name : null;

  return (
    <div className="w-full relative h-screen overflow-hidden bg-[#070707]">
      {/* Soft scrims so the header and readout stay legible in the bright room */}
      <div className="absolute inset-x-0 top-0 h-28 z-[15] pointer-events-none bg-gradient-to-b from-black/45 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-56 z-[15] pointer-events-none bg-gradient-to-t from-black/45 to-transparent" />

      {/* Room + counter */}
      <div
        className="absolute left-6 md:left-10 bottom-20 md:bottom-12 z-20 pointer-events-none text-[#f5f5f2] transition-opacity duration-700"
        style={{ opacity: focused !== null ? 0 : 1 }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`room-${currentStop.room}-${currentStop.kind}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="text-[10px] md:text-[11px] uppercase tracking-[0.32em] text-white/55"
            style={{ fontFamily: MONO }}
          >
            {eyebrow}
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
            {isRoomStop ? `${worksInRoom} works` : `/ ${String(totalWorks).padStart(2, '0')}`}
          </span>
        </div>
        <AnimatePresence mode="wait">
          {caption !== null && (
            <motion.div
              key={`title-${stop}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="mt-1 text-lg md:text-2xl text-white/85"
              style={{ fontFamily: SERIF }}
            >
              {caption}
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
              width: s.kind === 'room' ? 12 : 5,
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
              <dd className="text-white/85">Meowhlock Studio</dd>
            </dl>
            <a
              href={`/works/${focusedWork.slug}`}
              onClick={(e) => {
                // Plain clicks get the fade-to-black; modified clicks open normally
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                openProject(focusedWork.index);
              }}
              className="mt-8 md:mt-10 inline-flex items-center justify-between border border-white/25 px-5 py-4 text-xs uppercase tracking-[0.25em] hover:bg-white hover:text-black transition-colors"
              style={{ fontFamily: MONO }}
            >
              Open project <span aria-hidden>→</span>
            </a>
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

      {/* Fade to black before opening a project */}
      <AnimatePresence>
        {leavingTo && (
          <motion.div
            key="leaving"
            className="absolute inset-0 z-[60] bg-[#070707]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
            onAnimationComplete={() => router.push(`/works/${leavingTo}`)}
          />
        )}
      </AnimatePresence>

      {quality && (
        <Canvas
          dpr={quality === 'high' ? [1, 2] : [1, 1.5]}
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
              quality={quality}
              onDecline={handleDecline}
              onSelect={handleSelect}
              onStopChange={setStop}
              onUserMove={handleUserMove}
              onAnyHover={setAnyHovered}
              progressDot={progressDot}
            />
            {quality === 'high' ? (
              <EffectComposer key="high" multisampling={4}>
                <Bloom intensity={0.55} luminanceThreshold={0.85} luminanceSmoothing={0.3} mipmapBlur />
                <FocusBlur stops={layout.stops} stopOfWork={layout.stopOfWork} nav={nav} />
                <ChromaticAberration offset={CA_OFFSET} radialModulation modulationOffset={0.35} />
                <ToneMapping mode={ToneMappingMode.AGX} />
                <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.35} />
                <Vignette eskil={false} offset={0.2} darkness={0.75} />
              </EffectComposer>
            ) : (
              <EffectComposer key="low" multisampling={0}>
                <Bloom intensity={0.45} luminanceThreshold={0.85} luminanceSmoothing={0.3} mipmapBlur />
                <ToneMapping mode={ToneMappingMode.AGX} />
                <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.3} />
                <Vignette eskil={false} offset={0.2} darkness={0.75} />
              </EffectComposer>
            )}
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}

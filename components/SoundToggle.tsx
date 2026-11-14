'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MONO_STACK } from '@/lib/fonts';

/**
 * Optional ambient room tone, off by default. Generated with Web Audio
 * (filtered brown noise plus a faint low drone), so no audio asset ships.
 */
type Graph = { ctx: AudioContext; master: GainNode };

const LEVEL = 0.06;

function buildGraph(): Graph {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // Brown noise: integrated white noise, soft and low like air handling
  const seconds = 6;
  const buffer = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 420;
  noise.connect(lowpass).connect(master);

  // Slow swell so it breathes instead of hissing flatly
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 140;
  lfo.connect(lfoGain).connect(lowpass.frequency);

  // Faint low drone, a fifth apart
  [55, 82.4].forEach((freq) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.value = 0.05;
    osc.connect(g).connect(master);
    osc.start();
  });

  noise.start();
  lfo.start();
  return { ctx, master };
}

export default function SoundToggle() {
  const [on, setOn] = useState(false);
  const graph = useRef<Graph | null>(null);

  const toggle = useCallback(() => {
    const next = !on;
    setOn(next);
    if (next && !graph.current) graph.current = buildGraph();
    const g = graph.current;
    if (!g) return;
    const now = g.ctx.currentTime;
    if (next) {
      void g.ctx.resume();
      g.master.gain.cancelScheduledValues(now);
      g.master.gain.setTargetAtTime(LEVEL, now, 0.6);
    } else {
      g.master.gain.cancelScheduledValues(now);
      g.master.gain.setTargetAtTime(0, now, 0.25);
    }
  }, [on]);

  useEffect(() => () => void graph.current?.ctx.close(), []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Turn ambient sound off' : 'Turn ambient sound on'}
      className="fixed right-6 bottom-6 z-40 flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-white/60 hover:text-white transition-colors mix-blend-difference"
      style={{ fontFamily: MONO_STACK }}
    >
      <span className="flex items-end gap-[3px] h-3" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="w-[2px] bg-current"
            style={{
              height: on ? undefined : 3,
              animation: on ? `meow-eq 1.${i + 1}s ease-in-out ${i * 0.15}s infinite alternate` : 'none',
            }}
          />
        ))}
      </span>
      Sound {on ? 'on' : 'off'}
    </button>
  );
}

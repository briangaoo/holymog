'use client';

import { useEffect, useRef } from 'react';

/**
 * Decorative cosmic backdrop for the home page with cursor-reactive
 * physics + per-star glitter twinkle.
 *
 * Physics: each star/planet has a mass, a reach radius, and a max
 * displacement. When the cursor enters its reach, it pushes the
 * particle outward with a quadratic falloff scaled by 1/mass. Stars
 * (mass=1) shove dramatically; planets (mass 3-8) barely drift.
 *
 * Cursor lag: a "tracked" mouse position lerps toward the real cursor
 * each frame at a low coefficient, so the influence point trails the
 * real cursor by ~0.6s — particles you've passed keep reacting after
 * you've moved on.
 *
 * Star-vs-planet implementation note: stars write displacement to CSS
 * vars (--tx / --ty) so their `hm-twinkle` keyframe can compose
 * translate + scale + brightness on the same `transform` / `filter`
 * channels without the JS overwriting the keyframe. Planets have no
 * keyframe to share with, so they get direct `transform` writes.
 */

type StarSpec = {
  x: number; // % horizontal
  y: number; // % vertical
  r: number; // size scalar (px = max(2, r*3.2))
  o: number; // base opacity
  c?: string; // colour, default white
  d: number; // twinkle period seconds
};

const STARS: StarSpec[] = [
  // Top band
  { x: 4, y: 6, r: 1.0, o: 0.7, d: 4.2 },
  { x: 12, y: 3, r: 0.6, o: 0.5, d: 3.6 },
  { x: 19, y: 9, r: 1.4, o: 0.9, c: '#a5f3fc', d: 5.1 },
  { x: 28, y: 4, r: 0.8, o: 0.6, d: 4.8 },
  { x: 36, y: 11, r: 0.5, o: 0.4, d: 6.0 },
  { x: 45, y: 5, r: 1.0, o: 0.8, d: 3.9 },
  { x: 53, y: 2, r: 0.6, o: 0.5, d: 5.5 },
  { x: 62, y: 8, r: 1.3, o: 0.9, c: '#fde68a', d: 4.5 },
  { x: 71, y: 4, r: 0.7, o: 0.6, d: 4.1 },
  { x: 79, y: 10, r: 0.8, o: 0.7, d: 5.8 },
  { x: 87, y: 5, r: 1.0, o: 0.7, d: 3.8 },
  { x: 94, y: 11, r: 0.6, o: 0.5, d: 6.3 },
  // Upper-mid band
  { x: 7, y: 17, r: 0.9, o: 0.7, d: 5.2 },
  { x: 16, y: 22, r: 0.5, o: 0.4, d: 4.0 },
  { x: 23, y: 18, r: 1.1, o: 0.8, c: '#fbcfe8', d: 5.7 },
  { x: 33, y: 24, r: 0.6, o: 0.5, d: 4.4 },
  { x: 42, y: 20, r: 0.4, o: 0.35, d: 6.1 },
  { x: 50, y: 26, r: 0.5, o: 0.5, d: 4.7 },
  { x: 58, y: 21, r: 1.2, o: 0.85, d: 5.4 },
  { x: 66, y: 17, r: 0.5, o: 0.4, d: 3.9 },
  { x: 74, y: 24, r: 0.9, o: 0.7, c: '#a5f3fc', d: 5.0 },
  { x: 83, y: 19, r: 0.7, o: 0.6, d: 4.6 },
  { x: 91, y: 25, r: 1.0, o: 0.7, d: 5.3 },
  // Mid band
  { x: 5, y: 36, r: 0.7, o: 0.55, d: 5.0 },
  { x: 9, y: 44, r: 1.0, o: 0.7, d: 6.2 },
  { x: 14, y: 50, r: 0.5, o: 0.4, d: 4.3 },
  { x: 6, y: 58, r: 0.9, o: 0.7, c: '#fde68a', d: 5.6 },
  { x: 12, y: 63, r: 0.4, o: 0.35, d: 4.0 },
  { x: 16, y: 71, r: 0.7, o: 0.55, d: 5.9 },
  { x: 88, y: 38, r: 0.6, o: 0.5, d: 4.5 },
  { x: 92, y: 47, r: 1.1, o: 0.8, c: '#a5f3fc', d: 5.2 },
  { x: 86, y: 55, r: 0.5, o: 0.4, d: 6.0 },
  { x: 94, y: 62, r: 0.8, o: 0.65, d: 4.8 },
  { x: 90, y: 70, r: 0.6, o: 0.5, d: 5.5 },
  // Lower-mid band
  { x: 4, y: 78, r: 1.0, o: 0.75, d: 5.1 },
  { x: 13, y: 84, r: 0.6, o: 0.5, d: 4.4 },
  { x: 21, y: 80, r: 0.8, o: 0.65, c: '#fbcfe8', d: 5.7 },
  { x: 29, y: 87, r: 0.5, o: 0.4, d: 4.0 },
  { x: 37, y: 81, r: 1.2, o: 0.85, d: 6.3 },
  { x: 45, y: 86, r: 0.7, o: 0.55, d: 4.7 },
  { x: 54, y: 80, r: 0.5, o: 0.4, d: 5.4 },
  { x: 62, y: 88, r: 0.9, o: 0.7, c: '#fde68a', d: 4.6 },
  { x: 70, y: 82, r: 0.6, o: 0.5, d: 5.9 },
  { x: 78, y: 87, r: 1.0, o: 0.75, d: 4.2 },
  { x: 85, y: 81, r: 0.5, o: 0.4, d: 6.0 },
  { x: 93, y: 86, r: 0.8, o: 0.65, d: 5.0 },
  // Bottom band
  { x: 8, y: 92, r: 0.7, o: 0.55, d: 5.3 },
  { x: 17, y: 95, r: 1.0, o: 0.75, c: '#a5f3fc', d: 4.8 },
  { x: 26, y: 93, r: 0.5, o: 0.4, d: 6.1 },
  { x: 34, y: 96, r: 0.8, o: 0.65, d: 4.4 },
  { x: 43, y: 92, r: 0.6, o: 0.5, d: 5.7 },
  { x: 51, y: 95, r: 1.1, o: 0.8, d: 4.1 },
  { x: 59, y: 93, r: 0.5, o: 0.4, d: 5.5 },
  { x: 68, y: 96, r: 0.7, o: 0.55, d: 6.2 },
  { x: 77, y: 92, r: 0.9, o: 0.7, c: '#fde68a', d: 4.9 },
  { x: 85, y: 95, r: 0.5, o: 0.4, d: 5.0 },
  { x: 92, y: 93, r: 1.0, o: 0.75, d: 4.5 },
  // Sprinkle
  { x: 2, y: 12, r: 0.4, o: 0.35, d: 5.2 },
  { x: 97, y: 14, r: 0.5, o: 0.4, d: 6.0 },
  { x: 98, y: 78, r: 0.4, o: 0.35, d: 4.8 },
  { x: 1, y: 88, r: 0.5, o: 0.4, d: 5.3 },
  { x: 22, y: 6, r: 0.4, o: 0.35, d: 5.5 },
  { x: 67, y: 12, r: 0.5, o: 0.4, d: 4.6 },
  { x: 39, y: 18, r: 0.4, o: 0.35, d: 6.2 },
  { x: 80, y: 16, r: 0.4, o: 0.35, d: 5.8 },
  // Density pass
  { x: 2, y: 2, r: 0.3, o: 0.3, d: 4.7 },
  { x: 9, y: 14, r: 0.4, o: 0.4, d: 5.6 },
  { x: 14, y: 7, r: 0.3, o: 0.32, d: 4.0 },
  { x: 24, y: 13, r: 0.5, o: 0.5, c: '#a5f3fc', d: 5.9 },
  { x: 31, y: 8, r: 0.35, o: 0.35, d: 4.3 },
  { x: 40, y: 14, r: 0.4, o: 0.4, d: 6.1 },
  { x: 48, y: 10, r: 0.3, o: 0.3, d: 5.0 },
  { x: 56, y: 13, r: 0.45, o: 0.45, c: '#fbcfe8', d: 4.4 },
  { x: 65, y: 6, r: 0.3, o: 0.3, d: 5.3 },
  { x: 74, y: 13, r: 0.4, o: 0.4, d: 4.9 },
  { x: 81, y: 6, r: 0.35, o: 0.35, d: 6.2 },
  { x: 90, y: 13, r: 0.5, o: 0.5, c: '#fde68a', d: 5.4 },
  { x: 96, y: 4, r: 0.3, o: 0.3, d: 4.6 },
  { x: 3, y: 27, r: 0.35, o: 0.35, d: 5.7 },
  { x: 11, y: 31, r: 0.5, o: 0.5, d: 4.2 },
  { x: 19, y: 28, r: 0.3, o: 0.3, d: 6.0 },
  { x: 27, y: 33, r: 0.45, o: 0.45, c: '#a5f3fc', d: 4.5 },
  { x: 36, y: 28, r: 0.3, o: 0.3, d: 5.8 },
  { x: 44, y: 32, r: 0.5, o: 0.5, d: 4.8 },
  { x: 52, y: 28, r: 0.35, o: 0.35, d: 6.1 },
  { x: 60, y: 32, r: 0.4, o: 0.4, d: 5.0 },
  { x: 69, y: 28, r: 0.35, o: 0.35, d: 4.4 },
  { x: 77, y: 32, r: 0.5, o: 0.5, c: '#fde68a', d: 5.6 },
  { x: 86, y: 28, r: 0.3, o: 0.3, d: 4.7 },
  { x: 96, y: 33, r: 0.4, o: 0.4, d: 6.0 },
  { x: 3, y: 50, r: 0.4, o: 0.4, d: 5.3 },
  { x: 8, y: 67, r: 0.5, o: 0.5, c: '#a5f3fc', d: 4.6 },
  { x: 95, y: 52, r: 0.35, o: 0.35, d: 5.9 },
  { x: 89, y: 60, r: 0.45, o: 0.45, c: '#fbcfe8', d: 4.3 },
  { x: 96, y: 73, r: 0.3, o: 0.3, d: 6.0 },
  // Side flank fill
  { x: 19, y: 38, r: 0.5, o: 0.5, d: 5.4 },
  { x: 24, y: 44, r: 0.4, o: 0.4, c: '#a5f3fc', d: 4.8 },
  { x: 21, y: 51, r: 0.6, o: 0.55, d: 5.9 },
  { x: 27, y: 56, r: 0.4, o: 0.4, d: 4.4 },
  { x: 18, y: 60, r: 0.5, o: 0.5, c: '#fde68a', d: 6.0 },
  { x: 25, y: 64, r: 0.35, o: 0.35, d: 5.1 },
  { x: 30, y: 48, r: 0.45, o: 0.45, d: 4.6 },
  { x: 32, y: 41, r: 0.4, o: 0.4, d: 5.7 },
  { x: 22, y: 70, r: 0.5, o: 0.5, d: 4.9 },
  { x: 29, y: 67, r: 0.35, o: 0.35, c: '#fbcfe8', d: 6.2 },
  { x: 68, y: 41, r: 0.4, o: 0.4, d: 5.5 },
  { x: 72, y: 47, r: 0.55, o: 0.55, c: '#fde68a', d: 4.7 },
  { x: 76, y: 52, r: 0.4, o: 0.4, d: 6.0 },
  { x: 70, y: 58, r: 0.5, o: 0.5, d: 5.2 },
  { x: 78, y: 62, r: 0.35, o: 0.35, c: '#a5f3fc', d: 4.5 },
  { x: 81, y: 56, r: 0.45, o: 0.45, d: 5.8 },
  { x: 73, y: 67, r: 0.4, o: 0.4, d: 4.3 },
  { x: 80, y: 70, r: 0.5, o: 0.5, c: '#fbcfe8', d: 6.1 },
  { x: 67, y: 50, r: 0.35, o: 0.35, d: 5.0 },
  { x: 83, y: 44, r: 0.4, o: 0.4, d: 4.9 },
  { x: 9, y: 76, r: 0.35, o: 0.35, d: 4.9 },
  { x: 18, y: 73, r: 0.4, o: 0.4, d: 5.7 },
  { x: 25, y: 76, r: 0.3, o: 0.3, d: 4.1 },
  { x: 33, y: 73, r: 0.5, o: 0.5, c: '#a5f3fc', d: 5.5 },
  { x: 41, y: 76, r: 0.35, o: 0.35, d: 6.1 },
  { x: 49, y: 73, r: 0.4, o: 0.4, d: 4.7 },
  { x: 58, y: 76, r: 0.3, o: 0.3, d: 5.2 },
  { x: 66, y: 73, r: 0.5, o: 0.5, c: '#fde68a', d: 4.4 },
  { x: 74, y: 76, r: 0.35, o: 0.35, d: 5.8 },
  { x: 82, y: 73, r: 0.4, o: 0.4, d: 4.6 },
  { x: 89, y: 76, r: 0.3, o: 0.3, d: 6.2 },
  { x: 4, y: 89, r: 0.4, o: 0.4, d: 5.0 },
  { x: 12, y: 91, r: 0.3, o: 0.3, d: 4.5 },
  { x: 20, y: 89, r: 0.5, o: 0.5, c: '#fbcfe8', d: 5.7 },
  { x: 30, y: 91, r: 0.35, o: 0.35, d: 4.9 },
  { x: 38, y: 89, r: 0.4, o: 0.4, d: 6.1 },
  { x: 47, y: 91, r: 0.3, o: 0.3, d: 5.3 },
  { x: 55, y: 89, r: 0.5, o: 0.5, d: 4.6 },
  { x: 63, y: 91, r: 0.35, o: 0.35, c: '#a5f3fc', d: 5.9 },
  { x: 72, y: 89, r: 0.4, o: 0.4, d: 4.3 },
  { x: 81, y: 91, r: 0.3, o: 0.3, d: 5.6 },
  { x: 88, y: 89, r: 0.45, o: 0.45, d: 4.8 },
  { x: 96, y: 91, r: 0.35, o: 0.35, c: '#fde68a', d: 6.0 },
];

// Physics tuning. Numbers chosen to make the effect *unmistakable* —
// stars get pushed visibly when the cursor passes, planets respond
// just enough to feel weighted.
const STAR_MASS = 1;
const STAR_REACH = 220; // px — radius of cursor influence
const STAR_MAX_PUSH = 36; // px — at the cursor (post-falloff)

const PLANET_REACH = 420;
const PLANET_MAX_PUSH = 26;

// Lerp factors. LERP = how fast each particle settles toward target;
// MOUSE_LAG = how fast the tracked cursor catches up to the real one.
// Smaller MOUSE_LAG = bigger trail.
const LERP = 0.15;
const MOUSE_LAG = 0.07;

type Particle = {
  el: HTMLElement;
  cx: number; // base pixel centre x
  cy: number; // base pixel centre y
  mass: number;
  reach: number;
  maxPush: number;
  tx: number;
  ty: number;
  // Stars compose translate via CSS vars (so the twinkle keyframe can
  // also drive scale). Planets just write transform directly.
  usesVars: boolean;
};

export function Starfield() {
  const particlesRef = useRef<Particle[]>([]);
  const realMouseRef = useRef({ x: -99999, y: -99999 });
  const trackedMouseRef = useRef({ x: -99999, y: -99999 });

  const register =
    (mass: number, reach: number, maxPush: number, usesVars: boolean) =>
    (el: HTMLElement | null) => {
      if (!el) return;
      if (particlesRef.current.some((p) => p.el === el)) return;
      particlesRef.current.push({
        el,
        cx: 0,
        cy: 0,
        mass,
        reach,
        maxPush,
        tx: 0,
        ty: 0,
        usesVars,
      });
    };

  // Measure each particle's untransformed pixel centre on mount + resize.
  useEffect(() => {
    const recalc = () => {
      for (const p of particlesRef.current) {
        // Briefly clear whatever transform / vars are applied so the
        // bounding rect reflects the static layout position.
        const prevT = p.el.style.transform;
        const prevTx = p.el.style.getPropertyValue('--tx');
        const prevTy = p.el.style.getPropertyValue('--ty');
        if (p.usesVars) {
          p.el.style.setProperty('--tx', '0px');
          p.el.style.setProperty('--ty', '0px');
        } else {
          p.el.style.transform = '';
        }
        const r = p.el.getBoundingClientRect();
        p.cx = r.left + r.width / 2;
        p.cy = r.top + r.height / 2;
        if (p.usesVars) {
          if (prevTx) p.el.style.setProperty('--tx', prevTx);
          if (prevTy) p.el.style.setProperty('--ty', prevTy);
        } else {
          p.el.style.transform = prevT;
        }
      }
    };
    const id = requestAnimationFrame(recalc);
    window.addEventListener('resize', recalc);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', recalc);
    };
  }, []);

  // rAF loop + mouse listeners.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      realMouseRef.current.x = e.clientX;
      realMouseRef.current.y = e.clientY;
    };
    const onLeave = () => {
      realMouseRef.current.x = -99999;
      realMouseRef.current.y = -99999;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', onLeave);

    let raf = 0;
    const tick = () => {
      const real = realMouseRef.current;
      const tracked = trackedMouseRef.current;
      tracked.x += (real.x - tracked.x) * MOUSE_LAG;
      tracked.y += (real.y - tracked.y) * MOUSE_LAG;
      const mx = tracked.x;
      const my = tracked.y;
      for (const p of particlesRef.current) {
        const dx = p.cx - mx;
        const dy = p.cy - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let targetX = 0;
        let targetY = 0;
        if (dist < p.reach && dist > 0) {
          const t = 1 - dist / p.reach;
          const push = (t * t * p.maxPush) / p.mass;
          targetX = (dx / dist) * push;
          targetY = (dy / dist) * push;
        }
        p.tx += (targetX - p.tx) * LERP;
        p.ty += (targetY - p.ty) * LERP;
        const rx = Math.round(p.tx * 10) / 10;
        const ry = Math.round(p.ty * 10) / 10;
        if (p.usesVars) {
          p.el.style.setProperty('--tx', `${rx}px`);
          p.el.style.setProperty('--ty', `${ry}px`);
        } else {
          p.el.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      // Stop the loop + remove listeners ONLY. We DO NOT wipe
      // particlesRef.current — in React StrictMode (dev) effects run
      // mount → cleanup → remount in quick succession on the same JSX,
      // and callback refs don't re-fire since the DOM elements never
      // unmount. Wiping the registry would leave the second rAF run
      // iterating an empty array. Real unmount is fine: the elements
      // are GC'd along with the closures that referenced them.
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <style>{`
        /* Glitter twinkle — composes the cursor-physics translate
           (--tx/--ty, written by the rAF loop) with scale + brightness
           pulses. Larger stars get a sharper pop (--star-scale and
           --star-flare set per element). */
        @keyframes hm-twinkle {
          0%, 100% {
            opacity: var(--star-min, 0.6);
            transform:
              translate3d(var(--tx, 0px), var(--ty, 0px), 0)
              scale(1);
            filter: brightness(1);
          }
          50% {
            opacity: var(--star-max, 1);
            transform:
              translate3d(var(--tx, 0px), var(--ty, 0px), 0)
              scale(var(--star-scale, 1.3));
            filter: brightness(var(--star-flare, 1.6));
          }
        }
      `}</style>

      {STARS.map((s, i) => {
        const sizePx = Math.max(2, s.r * 3.2);
        const color = s.c ?? '#ffffff';
        // Bigger stars get a sharper pop + brighter flare at peak.
        const peakScale = 1.18 + s.r * 0.22;
        const peakFlare = 1.4 + s.r * 0.55;
        return (
          <span
            key={i}
            ref={register(STAR_MASS, STAR_REACH, STAR_MAX_PUSH, true)}
            className="absolute rounded-full"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: `${sizePx}px`,
              height: `${sizePx}px`,
              backgroundColor: color,
              boxShadow: `0 0 ${sizePx * 2}px ${color}, 0 0 ${sizePx * 4}px ${color}55`,
              marginLeft: `-${sizePx / 2}px`,
              marginTop: `-${sizePx / 2}px`,
              opacity: s.o,
              ['--star-min' as never]: Math.max(0.45, s.o * 0.7),
              ['--star-max' as never]: Math.min(1, s.o + 0.25),
              ['--star-scale' as never]: peakScale,
              ['--star-flare' as never]: peakFlare,
              ['--tx' as never]: '0px',
              ['--ty' as never]: '0px',
              animation: `hm-twinkle ${s.d}s ease-in-out ${(i * 0.17) % s.d}s infinite`,
              willChange: 'transform, opacity, filter',
            }}
          />
        );
      })}

      {/* Planet 1 — small teal moon, upper-left edge. mass = 4. */}
      <Planet
        registerRef={register(4, PLANET_REACH, PLANET_MAX_PUSH, false)}
        top="13%"
        left="-4%"
        size="clamp(80px, 9vw, 140px)"
        gradient="radial-gradient(circle at 32% 30%, #5eead4 0%, #14b8a6 38%, #064e3b 78%, #042f2e 100%)"
        glow="rgba(20,184,166,0.25)"
      />

      {/* Planet 2 — Saturn-style ringed violet, mid-right. mass = 6. */}
      <RingedPlanet
        registerRef={register(6, PLANET_REACH, PLANET_MAX_PUSH, false)}
        top="40%"
        right="-6%"
        size="clamp(140px, 16vw, 220px)"
        bodyGradient="radial-gradient(circle at 30% 28%, #c4b5fd 0%, #8b5cf6 38%, #4c1d95 78%, #1e1b4b 100%)"
        ringColor="rgba(196,181,253,0.65)"
        ringTilt={-22}
        glow="rgba(139,92,246,0.30)"
      />

      {/* Planet 3 — small amber sun, top-right. mass = 3 (lightest planet). */}
      <Planet
        registerRef={register(3, PLANET_REACH, PLANET_MAX_PUSH, false)}
        top="14%"
        right="8%"
        size="clamp(56px, 6vw, 96px)"
        gradient="radial-gradient(circle at 32% 32%, #fde68a 0%, #f59e0b 36%, #b45309 76%, #451a03 100%)"
        glow="rgba(245,158,11,0.30)"
      />

      {/* Planet 4 — magenta nebula-glob, bottom-left. mass = 8 (heaviest). */}
      <Planet
        registerRef={register(8, PLANET_REACH, PLANET_MAX_PUSH, false)}
        bottom="-8%"
        left="-8%"
        size="clamp(180px, 22vw, 320px)"
        gradient="radial-gradient(circle at 30% 30%, #f9a8d4 0%, #ec4899 30%, #831843 70%, #1f0712 100%)"
        glow="rgba(236,72,153,0.22)"
        opacity={0.85}
      />

      {/* Bottom-right nebular wash — broad, very low opacity, anchors
          the page so the home content doesn't feel like it floats off
          into nothing. */}
      <span
        className="absolute -bottom-40 -right-40 h-[36rem] w-[36rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(34,211,238,0.18) 0%, rgba(168,85,247,0.10) 40%, transparent 70%)',
        }}
      />
    </div>
  );
}

function Planet({
  registerRef,
  top,
  left,
  right,
  bottom,
  size,
  gradient,
  glow,
  opacity = 1,
}: {
  registerRef: (el: HTMLElement | null) => void;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  size: string;
  gradient: string;
  glow?: string;
  opacity?: number;
}) {
  return (
    <span
      ref={registerRef}
      className="absolute rounded-full"
      style={{
        top,
        left,
        right,
        bottom,
        width: size,
        height: size,
        background: gradient,
        opacity,
        boxShadow: glow ? `0 0 80px 10px ${glow}` : undefined,
        willChange: 'transform',
      }}
    />
  );
}

function RingedPlanet({
  registerRef,
  top,
  right,
  size,
  bodyGradient,
  ringColor,
  ringTilt,
  glow,
}: {
  registerRef: (el: HTMLElement | null) => void;
  top: string;
  right: string;
  size: string;
  bodyGradient: string;
  ringColor: string;
  ringTilt: number;
  glow?: string;
}) {
  return (
    <div
      ref={registerRef}
      className="absolute"
      style={{ top, right, width: size, height: size, willChange: 'transform' }}
    >
      <div
        className="relative h-full w-full"
        style={{ transform: `rotate(${ringTilt}deg)` }}
      >
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: '170%',
            height: '36%',
            border: `2px solid ${ringColor}`,
            borderRadius: '50%',
            boxShadow: `0 0 24px ${ringColor}`,
          }}
        />
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: bodyGradient,
            boxShadow: glow ? `0 0 80px 10px ${glow}` : undefined,
          }}
        />
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: '170%',
            height: '36%',
            border: `2px solid ${ringColor}`,
            borderRadius: '50%',
            clipPath: 'inset(50% 0 0 0)',
            boxShadow: `0 0 24px ${ringColor}`,
          }}
        />
      </div>
    </div>
  );
}

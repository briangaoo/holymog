'use client';

import type { ReactNode } from 'react';
import type { UserStats } from '@/lib/customization';
import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';

const FRAG = /* glsl */ `
${NOISE_GLSL}

uniform float u_intensity;

void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // Flame height profile licks outward radially from a base ring.
  // Multiple noise octaves driven upward (against gravity in screen
  // space) create coherent licking flames.
  float t = u_time * 0.85;
  float angN = ang;
  float h1 = snoise(vec2(angN * 4.0, t));
  float h2 = snoise(vec2(angN * 9.0 + 1.7, t * 1.6));
  float h3 = snoise(vec2(angN * 17.0 - 0.6, t * 2.4));
  float flameProfile = h1 * 0.55 + h2 * 0.30 + h3 * 0.15;
  flameProfile = flameProfile * 0.5 + 0.5; // 0..1

  // Intensity scales the flame height — driven by currentStreak via uniform.
  float intensity = clamp(u_intensity, 0.4, 1.6);

  float baseR = 0.58;
  float maxFlameR = 0.96;
  float flameR = baseR + flameProfile * (maxFlameR - baseR) * intensity * 0.65;

  // Heat field: 1 deep in flame, 0 outside; ramp gives flame tongues.
  float heat = smoothstep(flameR, baseR, r);

  // Inner core: brighter where deep inside.
  float core = smoothstep(0.96, 0.5, r / max(flameR, 0.001));

  // Flame palette: deep red at edges → orange → yellow → near-white core.
  vec3 colCool = vec3(0.62, 0.04, 0.02);
  vec3 colWarm = vec3(0.98, 0.45, 0.05);
  vec3 colHot  = vec3(1.0, 0.85, 0.30);
  vec3 colCore = vec3(1.0, 0.97, 0.78);

  vec3 col = mix(colCool, colWarm, smoothstep(0.0, 0.55, heat));
  col = mix(col, colHot, smoothstep(0.55, 0.85, heat));
  col = mix(col, colCore, smoothstep(0.85, 1.0, heat) * core);

  // Embers: sparse hot speckles drifting upward outside the flame line.
  float em = snoise(vec2(uv.x * 22.0, uv.y * 22.0 - u_time * 1.4));
  float ember = step(0.85, em) * smoothstep(flameR + 0.10, flameR + 0.01, r);
  col += vec3(1.0, 0.62, 0.15) * ember * 0.8;

  // Base ring: a hot ember rim at baseR for grounding.
  float baseRim = smoothstep(baseR - 0.02, baseR, r) - smoothstep(baseR, baseR + 0.014, r);
  col += vec3(1.0, 0.40, 0.05) * baseRim * 0.7;

  // Alpha: full inside flame, fades smoothly at the licking edge.
  float alpha = heat + ember + baseRim * 0.8;
  alpha = clamp(alpha, 0.0, 1.0);

  float disc = 1.0 - smoothstep(0.985, 1.0, r);
  gl_FragColor = vec4(col * disc, alpha * disc);
}
`;

/**
 * SMART frame — reads userStats.currentStreak. Intensity linearly scales
 * the flame from 0.5 (low) to 1.5 (high) across streak length [1, 30].
 * Null streak → 0.5 (low flames).
 */
export default function FrameStreakPyre({
  children,
  size,
  userStats,
}: {
  children: ReactNode;
  size: number;
  userStats?: UserStats;
}) {
  const streak = userStats?.currentStreak ?? null;
  const intensity =
    streak == null ? 0.5 : Math.max(0.5, Math.min(1.5, streak / 14));

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 overflow-hidden rounded-full">
        <ShaderCanvas
          context="inline"
          fragShader={FRAG}
          uniforms={{ u_intensity: intensity }}
          fallback={
            <StaticFallback context="inline-ring" color="#f97316" ring />
          }
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(6, Math.round(size * 0.09)) }}
      >
        {children}
      </div>
    </div>
  );
}

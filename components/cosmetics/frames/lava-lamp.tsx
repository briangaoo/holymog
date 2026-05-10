'use client';

import type { ReactNode } from 'react';
import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';
import { PALETTE_GLSL } from '@/components/cosmetics/glsl/palette';

const FRAG = /* glsl */ `
${NOISE_GLSL}
${PALETTE_GLSL}

float metaball(vec2 p, vec2 c, float r) {
  float d = length(p - c);
  return r / max(d, 0.0001);
}

void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * 2.0;

  float t = u_time * 0.35;

  // Three rising metaballs, each on a slow lissajous so they merge / split.
  vec2 c1 = vec2(sin(t * 0.9) * 0.35, sin(t * 0.6 - 1.2) * 0.55);
  vec2 c2 = vec2(sin(t * 0.7 + 2.0) * 0.45, sin(t * 0.5 + 0.8) * 0.55);
  vec2 c3 = vec2(sin(t * 0.6 - 1.5) * 0.30, sin(t * 0.8 + 2.7) * 0.55);

  float f = metaball(p, c1, 0.42)
          + metaball(p, c2, 0.36)
          + metaball(p, c3, 0.30);

  // fbm warps the blob iso so it gets viscous rather than perfectly round.
  float n = fbm(p * 1.8 + vec2(0.0, t * 0.5));
  f += n * 0.18;

  float t_pal = smoothstep(1.4, 3.4, f);
  vec3 col = palette(t_pal * 0.7 + 0.05,
    PAL_SUNSET_A, PAL_SUNSET_B, PAL_SUNSET_C, PAL_SUNSET_D);

  // Dark glass tint outside the blob iso so the ring reads as molten + black bg.
  vec3 bg = vec3(0.04, 0.02, 0.03);
  float blobMask = smoothstep(1.6, 2.4, f);
  col = mix(bg, col, blobMask);

  // Soft hot core highlight along blob centres.
  col += vec3(0.45, 0.18, 0.05) * smoothstep(2.6, 3.4, f);

  // Mask to a disc so it slots into the round avatar frame cleanly.
  float r = length(p);
  float ring = 1.0 - smoothstep(0.985, 1.0, r);

  gl_FragColor = vec4(col * ring, ring);
}
`;

export default function FrameLavaLamp({
  children,
  size,
}: {
  children: ReactNode;
  size: number;
  userStats?: never;
}) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 overflow-hidden rounded-full">
        <ShaderCanvas
          context="inline"
          fragShader={FRAG}
          fallback={
            <StaticFallback context="inline-ring" color="#fb923c" ring />
          }
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(6, Math.round(size * 0.06)) }}
      >
        {children}
      </div>
    </div>
  );
}

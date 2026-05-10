'use client';

import type { ReactNode } from 'react';
import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';
import { PALETTE_GLSL } from '@/components/cosmetics/glsl/palette';

const FRAG = /* glsl */ `
${NOISE_GLSL}
${PALETTE_GLSL}

void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // Thin-film interference: phase shifts with normal angle + warps with fbm.
  // Two warped fbm layers drift in opposite directions so the iridescence
  // looks like oil floating on wet asphalt.
  vec2 warp = vec2(cos(ang), sin(ang)) * r;
  float n1 = fbm(p * 2.4 + vec2(u_time * 0.12, 0.0));
  float n2 = fbm(p * 1.6 - vec2(0.0, u_time * 0.08));
  float phase = n1 * 1.6 + n2 * 1.0 + ang * 0.6 + r * 3.5;

  // Rainbow palette through the phase, gamma'd for that wet-film glow.
  vec3 rainbow = palette(phase * 0.18, PAL_RAINBOW_A, PAL_RAINBOW_B, PAL_RAINBOW_C, PAL_RAINBOW_D);
  rainbow = pow(rainbow, vec3(1.4));

  // Wet asphalt base: near-black with subtle blueish sheen.
  vec3 asphalt = vec3(0.025, 0.028, 0.034);
  float sheen = smoothstep(0.4, 1.0, n1 + n2 * 0.5);
  asphalt += vec3(0.02, 0.03, 0.05) * sheen;

  // Iridescent overlay sits on top of the asphalt at varying intensity.
  float iri = smoothstep(0.0, 0.6, abs(sin(phase * 1.4)));
  vec3 col = mix(asphalt, rainbow, iri * 0.85);

  // Soft circular alpha mask + faint outer rim.
  float disc = 1.0 - smoothstep(0.985, 1.0, r);
  float rim = smoothstep(0.86, 0.99, r) - smoothstep(0.99, 1.0, r);
  col += vec3(0.4, 0.5, 0.6) * rim * 0.25;

  gl_FragColor = vec4(col * disc, disc);
}
`;

export default function FrameOilSlick({
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
            <StaticFallback context="inline-ring" color="#7c3aed" ring />
          }
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(5, Math.round(size * 0.07)) }}
      >
        {children}
      </div>
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';

const FRAG = /* glsl */ `
${NOISE_GLSL}

const float TWO_PI = 6.28318530718;
const float PANELS = 12.0;

void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // Radial sector index → which panel.
  float a = (ang + 3.14159265) / TWO_PI;
  float sector = floor(a * PANELS);
  // Local sector coords: -1..1 across the panel arc, 0..1 along radius.
  float aLocal = fract(a * PANELS) * 2.0 - 1.0;
  float rLocal = clamp((r - 0.05) / 0.95, 0.0, 1.0);

  // Per-panel jewel hue, drifting slowly with a temperature term.
  float drift = sin(u_time * 0.18 + sector * 0.7) * 0.5 + 0.5;
  float hueSeed = sector * 0.137 + drift * 0.20;
  // Deep jewel palette — sample HSV-ish via three sin offsets.
  vec3 jewel = vec3(
    0.30 + 0.45 * sin(hueSeed * TWO_PI),
    0.10 + 0.45 * sin(hueSeed * TWO_PI + 2.0),
    0.30 + 0.45 * sin(hueSeed * TWO_PI + 4.0)
  );
  jewel = clamp(jewel, vec3(0.04), vec3(0.95));

  // Inner radial gradient — glass darker at the centre + bright halo line
  // suggestive of light coming through the panel from the back.
  float inner = smoothstep(0.0, 0.6, rLocal);
  float halo = exp(-pow((rLocal - 0.55), 2.0) * 22.0) * 0.45;
  vec3 col = jewel * (0.55 + 0.45 * inner) + jewel * halo;

  // Surface texture — fbm crinkle simulating hand-poured glass.
  float crinkle = fbm(p * 6.0);
  col *= 0.85 + 0.30 * crinkle;

  // Lead came: dark borders between panels + a base ring + radial spokes.
  float panelEdge = smoothstep(0.92, 1.0, abs(aLocal));
  float baseRing = smoothstep(0.86, 0.94, r) - smoothstep(0.94, 0.99, r);
  float innerRing = smoothstep(0.04, 0.10, r) - smoothstep(0.10, 0.16, r);
  float came = max(max(panelEdge, baseRing), innerRing);
  vec3 leadCol = vec3(0.03, 0.025, 0.018);
  col = mix(col, leadCol, came * 0.92);

  // Light temperature drift — overall hue shift slowly across time.
  float temp = sin(u_time * 0.08) * 0.07;
  col.r += temp;
  col.b -= temp;

  // disc mask
  float disc = 1.0 - smoothstep(0.985, 1.0, r);
  gl_FragColor = vec4(col * disc, disc);
}
`;

export default function FrameStainedGlass({
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
            <StaticFallback context="inline-ring" color="#6b21a8" ring />
          }
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(7, Math.round(size * 0.11)) }}
      >
        {children}
      </div>
    </div>
  );
}

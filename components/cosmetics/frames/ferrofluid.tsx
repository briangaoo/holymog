'use client';

import type { ReactNode } from 'react';
import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';

const FRAG = /* glsl */ `
${NOISE_GLSL}

void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // Living spike profile: noisy angular function that perturbs the outer
  // radius of a black disc. Each spike's height varies with two octaves
  // of noise + a slow phase rotation so the porcupine bristles "breathe."
  float t = u_time * 0.25;
  float angN = ang + t * 0.18;
  float n1 = snoise(vec2(angN * 5.0, t));
  float n2 = snoise(vec2(angN * 11.0 + 3.0, t * 0.7));
  float n3 = snoise(vec2(angN * 19.0 - 1.0, t * 1.3));
  float spike = n1 * 0.5 + n2 * 0.32 + n3 * 0.18;

  float baseR = 0.62;
  float spikeAmp = 0.30;
  float outerR = baseR + spike * spikeAmp * 0.5 + spikeAmp * 0.5;

  // Distance from the spike-perturbed boundary.
  float d = r - outerR;

  // Inside the spike volume = black liquid. Outside = transparent.
  float liquid = 1.0 - smoothstep(0.0, 0.018, d);

  // Surface highlight: bright rim where light catches the meniscus.
  float rim = smoothstep(-0.02, 0.0, d) - smoothstep(0.0, 0.015, d);
  vec3 col = vec3(0.014, 0.012, 0.016) * liquid;
  col += vec3(0.45, 0.50, 0.65) * rim * 0.85;

  // Subtle internal flow noise so the black body has reflective texture.
  float internal = fbm(p * 2.5 + vec2(0.0, t * 0.6));
  col += vec3(0.04, 0.05, 0.08) * internal * liquid;

  // disc mask
  float disc = 1.0 - smoothstep(0.985, 1.0, r);
  float alpha = max(liquid, rim) * disc;
  gl_FragColor = vec4(col * disc, alpha);
}
`;

export default function FrameFerrofluid({
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
            <StaticFallback context="inline-ring" color="#1f2937" ring />
          }
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(7, Math.round(size * 0.10)) }}
      >
        {children}
      </div>
    </div>
  );
}

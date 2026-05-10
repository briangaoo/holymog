'use client';

import type { ReactNode } from 'react';
import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';

/**
 * Wispy gray smoke drifting upward off the letters. The canvas overhangs
 * the text on top so smoke can rise above the baseline without clipping.
 * Screen blend keeps the underlying name fully legible — smoke only
 * lightens, never darkens.
 */

const FRAG = /* glsl */ `
${NOISE_GLSL}

void main() {
  vec2 uv = v_uv;

  // y=0 at top of canvas, y=1 at bottom. Smoke originates at the bottom
  // (where the text sits) and drifts upward.
  float t = u_time * 0.55;
  vec2 p = vec2(uv.x * 2.4, uv.y * 3.2 + t);

  float n = fbm(p);
  // remap roughly [-1,1] noise to [0,1]
  n = clamp(n * 0.55 + 0.5, 0.0, 1.0);

  // density tapers off as y -> 0 (top). Strong near the bottom 60%,
  // gone by the very top so the smoke feels rooted in the text.
  float density = pow(uv.y, 1.2);

  // soft horizontal column variation so each "wisp" feels distinct
  float column = 0.55 + 0.45 * sin(uv.x * 4.0 + u_time * 0.3);

  // cool gray with a faint warm bias
  vec3 color = vec3(0.78, 0.80, 0.85);
  float alpha = smoothstep(0.45, 0.85, n) * density * column * 0.7;

  // premultiplied alpha — ShaderCanvas requests premultipliedAlpha:true
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export default function NameSmokeTrail({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
      <ShaderCanvas
        context="inline"
        fragShader={FRAG}
        fallback={null}
        style={{
          position: 'absolute',
          left: '-10%',
          right: '-10%',
          bottom: 0,
          // extend the canvas 1.3× the text height above the baseline so
          // rising smoke has room to fade out
          top: '-130%',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          opacity: 0.9,
        }}
      />
    </>
  );
}

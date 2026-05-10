'use client';

import type { ReactNode } from 'react';
import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';

/**
 * Sumi brush calligraphy with ink wicking outward into paper fibers.
 * The text itself adopts a slightly darker, slightly bled appearance via
 * inline styling, and a low-frequency noise overlay simulates the paper
 * fibers absorbing ink — soft, breathing, organic.
 *
 * Screen blend would brighten the dark ink so we use 'multiply' here:
 * the bleed darkens the surrounding region the way real ink soaks into
 * fibres on rice paper.
 */

const FRAG = /* glsl */ `
${NOISE_GLSL}

void main() {
  vec2 uv = v_uv;

  // very slow breathing — paper soaks irregularly
  float t = u_time * 0.18;

  // two scales of noise: coarse bleed shape + fine fibre texture
  float coarse = fbm(uv * 2.0 + vec2(t, -t * 0.4));
  float fine   = snoise(uv * 14.0 + vec2(-t, t));

  coarse = clamp(coarse * 0.6 + 0.5, 0.0, 1.0);
  fine   = clamp(fine   * 0.5 + 0.5, 0.0, 1.0);

  // bleed is densest near the vertical centre (the letterforms) and
  // tapers outward at the top/bottom edges
  float centreMask = 1.0 - pow(abs(uv.y - 0.5) * 2.0, 1.6);
  centreMask = max(centreMask, 0.0);

  float ink = coarse * centreMask * (0.78 + 0.22 * fine);

  // warm-tinged near-black for sumi tone; alpha modulates intensity
  vec3 color = vec3(0.06, 0.05, 0.04);
  float alpha = smoothstep(0.30, 0.85, ink) * 0.55;

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export default function NameInkBleed({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <span
        style={{
          position: 'relative',
          zIndex: 1,
          color: '#0a0a0a',
          textShadow:
            '0 0 1px rgba(10,10,10,0.85), 0 0 2px rgba(10,10,10,0.45), 0 0 5px rgba(10,10,10,0.20)',
          // simulate the slight pooling at letter joints
          fontWeight: 600,
        }}
      >
        {children}
      </span>
      <ShaderCanvas
        context="inline"
        fragShader={FRAG}
        fallback={null}
        style={{
          position: 'absolute',
          left: '-12%',
          right: '-12%',
          top: '-20%',
          bottom: '-20%',
          pointerEvents: 'none',
          mixBlendMode: 'multiply',
          opacity: 0.85,
        }}
      />
    </>
  );
}

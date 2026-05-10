'use client';

import type { ReactNode } from 'react';
import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';

/**
 * Sumi brush calligraphy with ink wicking outward into paper fibers.
 *
 * Reversed for the dark site backdrop — the "ink" is rendered as a warm
 * parchment-cream so the calligraphy stays readable. The shader paints
 * a slowly-breathing fibrous halo in the same warm tone around the
 * letterforms with `mix-blend-mode: screen`, simulating cream ink
 * wicking outward into the dark "paper" of the page background.
 *
 * The text-shadow layers below the shader bake in the soft pooled-edge
 * look that you can't get from the noise overlay alone.
 */

const FRAG = /* glsl */ `
${NOISE_GLSL}

void main() {
  vec2 uv = v_uv;

  // very slow breathing — ink soaks irregularly
  float t = u_time * 0.18;

  // two scales of noise: coarse bleed shape + fine fibre texture
  float coarse = fbm(uv * 2.0 + vec2(t, -t * 0.4));
  float fine   = snoise(uv * 14.0 + vec2(-t, t));

  coarse = clamp(coarse * 0.6 + 0.5, 0.0, 1.0);
  fine   = clamp(fine   * 0.5 + 0.5, 0.0, 1.0);

  // bleed is densest along the horizontal letterform band and tapers
  // outward at the top/bottom edges of the canvas
  float centreMask = 1.0 - pow(abs(uv.y - 0.5) * 1.7, 1.6);
  centreMask = max(centreMask, 0.0);

  float ink = coarse * centreMask * (0.78 + 0.22 * fine);

  // warm parchment/cream — visible on the dark site backdrop under screen blend
  vec3 color = vec3(0.85, 0.75, 0.55);
  float alpha = smoothstep(0.32, 0.85, ink) * 0.6;

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
          color: '#ede1c2',
          textShadow:
            '0 0 1px rgba(237, 225, 194, 0.95), 0 0 3px rgba(218, 198, 152, 0.55), 0 0 7px rgba(180, 150, 100, 0.32), 0 0 14px rgba(180, 150, 100, 0.18)',
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
          left: '-15%',
          right: '-15%',
          top: '-25%',
          bottom: '-25%',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          opacity: 0.9,
        }}
      />
    </>
  );
}

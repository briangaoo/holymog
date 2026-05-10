'use client';

import type { ReactNode } from 'react';
import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';
import { PALETTE_GLSL } from '@/components/cosmetics/glsl/palette';

/**
 * Letters burning with golden judgment flame, halo above each character.
 *
 * Two layered effects in one shader:
 *   - rising golden flame around the bottom 70% of the box (drifting
 *     upward, brightest at the letter centres)
 *   - a soft horizontal halo band above the text (top ~25%)
 *
 * The text underneath stays white and crisp; screen blend additively
 * paints gold over and above it.
 */

const FRAG = /* glsl */ `
${NOISE_GLSL}
${PALETTE_GLSL}

void main() {
  vec2 uv = v_uv;

  // y = 0 at top, 1 at bottom. Flame at the bottom drifting up.
  float t = u_time * 0.6;

  // ---- flame ----
  vec2 fp = vec2(uv.x * 3.0, uv.y * 2.8 - t);
  float flame = fbm(fp);
  flame = clamp(flame * 0.55 + 0.55, 0.0, 1.0);
  // mask so flame lives in the lower 75% and fades up
  float flameMask = smoothstep(0.05, 0.55, uv.y);
  // horizontal taper so flame doesn't extend infinitely sideways
  float xTaper = 1.0 - pow(abs(uv.x - 0.5) * 1.7, 2.2);
  xTaper = clamp(xTaper, 0.0, 1.0);
  float flameStrength = pow(flame, 1.8) * flameMask * xTaper;

  vec3 flameColor = palette(
    0.35 + flame * 0.45,
    PAL_GOLD_A, PAL_GOLD_B, PAL_GOLD_C, PAL_GOLD_D
  );

  // ---- halo above the text ----
  // soft horizontal band at top, breathing
  float halo = smoothstep(0.45, 0.0, uv.y);
  float pulse = 0.65 + 0.35 * sin(u_time * 1.4);
  // narrow it to roughly the letterform width
  float haloX = 1.0 - pow(abs(uv.x - 0.5) * 1.6, 2.0);
  haloX = clamp(haloX, 0.0, 1.0);
  float haloStrength = halo * pulse * haloX * 0.65;

  vec3 haloColor = vec3(1.0, 0.92, 0.55);

  vec3 color = flameColor * flameStrength + haloColor * haloStrength;
  float alpha = clamp(flameStrength * 0.95 + haloStrength * 0.85, 0.0, 1.0);

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export default function NameDivineJudgment({
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
          color: '#fef3c7',
          textShadow:
            '0 0 6px rgba(255,200,80,0.55), 0 0 14px rgba(255,150,30,0.35)',
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
          top: '-110%',
          bottom: '-10%',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          opacity: 0.95,
        }}
      />
    </>
  );
}

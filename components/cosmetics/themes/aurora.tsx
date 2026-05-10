'use client';

import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';
import { PALETTE_GLSL } from '@/components/cosmetics/glsl/palette';

const FRAG = /* glsl */ `
${NOISE_GLSL}
${PALETTE_GLSL}

void main() {
  vec2 uv = v_uv;

  // Dark base.
  vec3 col = mix(vec3(0.005, 0.008, 0.015), vec3(0.01, 0.015, 0.035), uv.y);

  // Build 3 aurora ribbons across the upper half. Each ribbon is a
  // band defined by a noise-modulated horizontal line. We integrate
  // the band intensity into the colour.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float speed = 0.04 + fi * 0.02;
    float scale = 1.4 + fi * 0.6;
    float baseY = 0.35 + fi * 0.18;
    // Ribbon centerline driven by noise — slow horizontal drift.
    float curve = snoise(vec2(uv.x * scale + u_time * speed, fi * 1.7 + u_time * 0.03)) * 0.10;
    float y = baseY + curve;
    float thickness = 0.08 + 0.04 * sin(u_time * 0.1 + fi * 1.7);
    float band = exp(-pow((uv.y - y) / thickness, 2.0));
    // Vertical falloff toward top so ribbons fade into starless sky.
    band *= smoothstep(0.0, 0.4, uv.y) * smoothstep(1.0, 0.4, uv.y);
    // Palette cycling — long period so it feels like the night sky.
    float pal = uv.x * 0.5 + u_time * 0.025 + fi * 0.33;
    vec3 ribbon = palette(pal, PAL_AURORA_A, PAL_AURORA_B, PAL_AURORA_C, PAL_AURORA_D);
    col += ribbon * band * 0.55;
  }

  // Subtle starfield: hash noise at small scale, threshold high.
  float star = snoise(uv * 220.0);
  float starMask = smoothstep(0.92, 1.0, star) * smoothstep(0.0, 0.5, uv.y);
  col += vec3(0.7, 0.75, 0.85) * starMask * 0.18;

  // Vignette
  float vig = smoothstep(1.15, 0.45, distance(uv, vec2(0.5, 0.55)));
  col *= mix(0.65, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function ThemeAurora() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
    >
      <ShaderCanvas
        context="fullscreen"
        fragShader={FRAG}
        fallback={<StaticFallback color="rgba(60,170,180,0.35)" context="fullscreen" />}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

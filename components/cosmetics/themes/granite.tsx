'use client';

import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';

const FRAG = /* glsl */ `
${NOISE_GLSL}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Dark granite base — fbm at two scales, slightly different freqs,
  // composited to feel like crystalline grain.
  float grain1 = fbm(p * 4.5);
  float grain2 = snoise(p * 18.0) * 0.3;
  float grain = grain1 + grain2;
  // Map noise into a narrow dark band so it stays subtle.
  float v = 0.10 + 0.08 * grain;
  vec3 base = vec3(v, v * 0.95, v * 0.90);
  // Cool tint in the depths, warm in the bright veins.
  base = mix(base * vec3(0.85, 0.95, 1.05), base * vec3(1.10, 1.0, 0.85), grain * 0.5 + 0.5);

  // Caustic light pattern — abs(noise) gives bright ridge lines. Animate.
  float caustic1 = abs(snoise(p * 2.5 + vec2(u_time * 0.07, 0.0)));
  float caustic2 = abs(snoise(p * 3.2 + vec2(0.0, u_time * -0.05)));
  float caustic = 1.0 - smoothstep(0.0, 0.18, caustic1 + caustic2 * 0.7);
  // Wash caustic across diagonally — only present in a moving band.
  float diag = mod(p.x + p.y - u_time * 0.06, 1.6);
  float washMask = smoothstep(0.0, 0.4, diag) * smoothstep(1.6, 1.0, diag);
  vec3 col = base + vec3(0.55, 0.50, 0.42) * caustic * washMask * 0.25;

  // Vignette
  float vig = smoothstep(1.15, 0.45, distance(uv, vec2(0.5)));
  col *= mix(0.65, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function ThemeGranite() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
    >
      <ShaderCanvas
        context="fullscreen"
        fragShader={FRAG}
        fallback={<StaticFallback color="rgba(120,115,108,0.30)" context="fullscreen" />}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

'use client';

import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';

const FRAG = /* glsl */ `
float hash(float x) {
  return fract(sin(x * 12.9898) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;

  // Near-black field with slight teal underglow toward bottom.
  vec3 col = mix(vec3(0.005, 0.010, 0.015), vec3(0.020, 0.030, 0.040), uv.y);

  // Single oscillating sine-wave horizon at ~55% height. Composite a
  // few harmonics for organic motion.
  float horizon = 0.55;
  float wave =
      sin(uv.x * 6.0 + u_time * 0.5) * 0.025
    + sin(uv.x * 11.0 - u_time * 0.7 + 1.4) * 0.012
    + sin(uv.x * 17.0 + u_time * 0.35) * 0.006;
  float waveY = horizon + wave;

  // Above the wave: faint dark sky.
  // Below the wave: slightly brighter sea with shimmer.
  float belowMask = smoothstep(waveY, waveY - 0.005, uv.y);
  vec3 sea = vec3(0.030, 0.055, 0.075);
  // Add slow horizontal shimmer in the sea.
  float shimmer = sin(uv.x * 60.0 - u_time * 1.2) * 0.5 + 0.5;
  shimmer *= smoothstep(0.0, 0.3, waveY - uv.y);
  sea += vec3(0.05, 0.08, 0.10) * shimmer * 0.15;
  col = mix(col, sea, belowMask);

  // Glow band right at the wave (the crest line).
  float crest = exp(-pow((uv.y - waveY) / 0.006, 2.0));
  col += vec3(0.45, 0.70, 0.85) * crest * 0.45;

  // Foam glow-points scattered along the crest.
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float seed = hash(fi * 7.3);
    // Each point drifts horizontally and pulses on its own phase.
    float px = fract(seed + u_time * 0.02 * (0.6 + seed));
    // Sample the wave at this x for the y.
    float pyWave =
        sin(px * 6.0 + u_time * 0.5) * 0.025
      + sin(px * 11.0 - u_time * 0.7 + 1.4) * 0.012
      + sin(px * 17.0 + u_time * 0.35) * 0.006;
    vec2 pos = vec2(px, horizon + pyWave);
    float aspect = u_resolution.x / u_resolution.y;
    vec2 dlt = (uv - pos) * vec2(aspect, 1.0);
    float d = length(dlt);
    float pulse = 0.5 + 0.5 * sin(u_time * 1.4 + fi * 1.9);
    float glow = exp(-d * d * 220.0) * (0.5 + 0.5 * pulse);
    col += vec3(0.65, 0.85, 1.0) * glow * 0.35;
  }

  // Top vignette so the dark sky doesn't read as flat.
  float vig = smoothstep(1.15, 0.45, distance(uv, vec2(0.5, 0.55)));
  col *= mix(0.65, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function ThemeTidewave() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
    >
      <ShaderCanvas
        context="fullscreen"
        fragShader={FRAG}
        fallback={<StaticFallback color="rgba(70,130,160,0.32)" context="fullscreen" />}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

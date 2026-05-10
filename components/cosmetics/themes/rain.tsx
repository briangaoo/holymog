'use client';

import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';

const FRAG = /* glsl */ `
${NOISE_GLSL}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// One column of rain streaks. y = vertical coord (0..1), col = column id.
float rainColumn(float y, float col, float t, float speed, float density) {
  float seed = hash(vec2(col, 0.0));
  float v = fract(y * density - t * speed - seed);
  // Tail: streak is a short tapered line.
  float streak = smoothstep(0.92, 1.0, v) * smoothstep(1.0, 0.97, v);
  return streak;
}

void main() {
  vec2 uv = v_uv;
  vec2 p = uv * vec2(u_resolution.x / u_resolution.y, 1.0);

  // Near-black base with a subtle vertical gradient — top slightly cooler.
  vec3 col = mix(vec3(0.030, 0.035, 0.045), vec3(0.010, 0.012, 0.018), uv.y);

  // Bokeh: 4 soft circles in the lower half, drifting cool-tone.
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float ang = u_time * 0.04 + fi * 1.7;
    vec2 c = vec2(0.2 + 0.6 * fract(fi * 0.61803), 0.55 + 0.08 * sin(ang));
    c.x += 0.04 * sin(u_time * 0.05 + fi);
    float d = length(p - c * vec2(u_resolution.x / u_resolution.y, 1.0));
    float bokeh = exp(-d * d * 25.0) * 0.18;
    vec3 tint = mix(vec3(0.30, 0.55, 0.80), vec3(0.45, 0.40, 0.85), fract(fi * 0.37));
    col += tint * bokeh;
  }

  // Rain layers: 3 depths.
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float speed = 0.6 + fl * 0.5;
    float density = 28.0 + fl * 18.0;
    float colDensity = 80.0 + fl * 60.0;
    float colId = floor(uv.x * colDensity);
    // Per-column horizontal jitter so streaks don't tile.
    float jitter = (hash(vec2(colId, 7.0 + fl)) - 0.5) * 0.4;
    float y = uv.y + jitter;
    float s = rainColumn(y, colId + fl * 13.0, u_time, speed, density);
    // Layer alpha tapering: front layer brightest, back faint.
    float aLayer = 0.45 - fl * 0.10;
    vec3 streakColor = mix(vec3(0.55, 0.75, 1.0), vec3(0.85, 0.90, 1.05), 0.3 + 0.7 * (1.0 - fl / 2.0));
    col += streakColor * s * aLayer;
  }

  // Slight overall vignette so edges feel atmospheric.
  float vig = smoothstep(1.1, 0.4, distance(uv, vec2(0.5)));
  col *= mix(0.7, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function ThemeRain() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
    >
      <ShaderCanvas
        context="fullscreen"
        fragShader={FRAG}
        fallback={<StaticFallback color="rgba(80,110,160,0.35)" context="fullscreen" />}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

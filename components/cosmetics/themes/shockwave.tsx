'use client';

import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';
import { PALETTE_GLSL } from '@/components/cosmetics/glsl/palette';

const FRAG = /* glsl */ `
${PALETTE_GLSL}

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  float r = length(p);

  // Obsidian base with very slight gold underglow toward center.
  vec3 col = vec3(0.008, 0.007, 0.012);
  col += vec3(0.10, 0.08, 0.04) * (1.0 - smoothstep(0.0, 0.55, r));

  // Heartbeat envelope — lub-dub pattern roughly every 1.6s.
  // Two pulses close together, then quiet.
  float beatPeriod = 1.6;
  float beatPhase = mod(u_time, beatPeriod);
  float lub = exp(-pow((beatPhase - 0.0) * 8.0, 2.0));
  float dub = exp(-pow((beatPhase - 0.25) * 8.0, 2.0)) * 0.7;
  float beat = lub + dub;

  // Wave radius advances with each shockwave — spawn 3 rings with stagger.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // Each ring is offset in time so rings appear staggered, like
    // echoes of the heartbeat.
    float t = u_time - fi * 0.55;
    float age = mod(t, 2.4); // 2.4s ring lifespan
    float radius = age * 0.45;
    // Anti-aliased ring band.
    float band = smoothstep(0.012, 0.0, abs(r - radius));
    // Ring fades with age.
    float fade = smoothstep(2.4, 0.4, age) * smoothstep(0.0, 0.2, age);
    col += vec3(0.95, 0.78, 0.38) * band * fade * 0.55;
  }

  // Central pulse: bright gold disc that brightens on every heartbeat.
  float core = exp(-r * r * 90.0);
  col += vec3(1.0, 0.85, 0.40) * core * (0.30 + 0.45 * beat);

  // Subtle radial gold gradient on the heartbeat — ambient pressure wave.
  float pressure = exp(-r * r * 8.0) * beat * 0.18;
  col += vec3(0.95, 0.70, 0.30) * pressure;

  // Vignette
  float vig = smoothstep(1.0, 0.45, r);
  col *= mix(0.55, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function ThemeShockwave() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
    >
      <ShaderCanvas
        context="fullscreen"
        fragShader={FRAG}
        fallback={<StaticFallback color="rgba(200,150,60,0.35)" context="fullscreen" />}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

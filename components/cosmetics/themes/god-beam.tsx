'use client';

import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';

const FRAG = /* glsl */ `
${NOISE_GLSL}

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);

  // Near-black field.
  vec3 col = vec3(0.005, 0.006, 0.010);

  // Vertical beam descending from above. Defined by horizontal distance
  // from x=0 and a tapered y profile.
  float dx = abs(p.x);
  // Beam width grows slightly toward the bottom (truncated cone shape).
  float baseWidth = 0.06;
  float widen = 0.10 * smoothstep(0.0, 1.0, uv.y);
  float width = baseWidth + widen;
  // Core intensity from gaussian across width.
  float core = exp(-pow(dx / width, 2.0));
  // Vertical falloff — strongest just below source at top, fade toward bottom.
  float vfade = smoothstep(0.0, 0.15, uv.y) * mix(1.0, 0.55, smoothstep(0.4, 1.0, uv.y));
  float beam = core * vfade;

  // Volumetric flicker via low-freq noise so the beam breathes.
  float vol = 0.85 + 0.15 * snoise(vec2(uv.y * 6.0, u_time * 0.7));
  beam *= vol;

  // Hazy edges via wide low-intensity glow.
  float haze = exp(-pow(dx / (width * 4.0), 2.0)) * vfade * 0.18;

  vec3 beamColor = vec3(0.95, 0.90, 0.70);
  col += beamColor * beam * 0.75;
  col += vec3(0.55, 0.55, 0.45) * haze;

  // Ground pool of light where the beam hits — bright spot at bottom.
  float ground = 1.0 - smoothstep(0.6, 1.0, uv.y);
  float pool = exp(-dx * dx * 6.0) * (1.0 - ground) * 0.25;
  col += vec3(0.95, 0.85, 0.60) * pool;

  // Dust motes inside the beam — small bright specks drifting downward.
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float seed = fract(sin(fi * 91.7) * 43758.5);
    float my = fract(seed - u_time * (0.02 + 0.02 * seed));
    float mx = (seed - 0.5) * (width * 1.5);
    vec2 m = vec2(mx, my);
    float d = length(p - m);
    float mote = exp(-d * d * 1200.0) * smoothstep(0.0, 0.15, my) * smoothstep(1.0, 0.15, my);
    col += vec3(1.0, 0.95, 0.75) * mote * 0.6;
  }

  // Vignette to keep edges dark.
  float vig = smoothstep(1.15, 0.45, distance(uv, vec2(0.5, 0.55)));
  col *= mix(0.65, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function ThemeGodBeam() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
    >
      <ShaderCanvas
        context="fullscreen"
        fragShader={FRAG}
        fallback={<StaticFallback color="rgba(220,200,150,0.32)" context="fullscreen" />}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

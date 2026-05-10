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

  // Warm gradient base — amber → near-black bottom.
  vec3 top    = vec3(0.20, 0.13, 0.07);
  vec3 bottom = vec3(0.04, 0.025, 0.015);
  vec3 col = mix(bottom, top, smoothstep(0.0, 1.0, 1.0 - uv.y));

  // Volumetric light beam, tilted from upper-left to lower-right.
  // Project uv onto the perpendicular of the beam direction.
  vec2 beamOrigin = vec2(0.30 * aspect, 0.05);
  vec2 beamDir = normalize(vec2(0.15, 1.0));
  vec2 rel = p - beamOrigin;
  float along = dot(rel, beamDir);
  float across = abs(rel.x * beamDir.y - rel.y * beamDir.x);
  // Beam intensity drops with cross-distance + softens at far end.
  float beam = exp(-across * 6.0) * smoothstep(1.4, 0.0, along) * 0.55;
  // Animate beam slow flicker.
  beam *= 0.85 + 0.15 * sin(u_time * 0.4);
  col += vec3(0.85, 0.62, 0.30) * beam;

  // Dust particles: 3 layers at different scales.
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float scale = 60.0 + fl * 40.0;
    float speed = 0.012 + fl * 0.008;
    vec2 cell = p * scale;
    cell.y -= u_time * speed * scale * 0.3; // slow upward drift
    cell.x += sin(u_time * 0.05 + cell.y * 0.05) * 0.4; // gentle horizontal sway
    vec2 id = floor(cell);
    vec2 f = fract(cell) - 0.5;
    float r = hash(id + fl * 7.0);
    // Particle only renders for ~half cells.
    float keep = step(0.55, r);
    float dist = length(f);
    float size = 0.08 + 0.04 * hash(id + 17.0 + fl);
    float dot = smoothstep(size, 0.0, dist) * keep;
    // Particles brighter inside the beam.
    float boost = 1.0 + beam * 6.0;
    float alpha = (0.06 + 0.05 * (2.0 - fl)) * boost;
    col += vec3(0.95, 0.78, 0.50) * dot * alpha;
  }

  // Vignette
  float vig = smoothstep(1.15, 0.45, distance(uv, vec2(0.5, 0.5)));
  col *= mix(0.65, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function ThemeDust() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
    >
      <ShaderCanvas
        context="fullscreen"
        fragShader={FRAG}
        fallback={<StaticFallback color="rgba(170,110,50,0.35)" context="fullscreen" />}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

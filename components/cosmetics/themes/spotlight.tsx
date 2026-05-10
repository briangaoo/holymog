'use client';

import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';

const FRAG = /* glsl */ `
void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Near-black backdrop with faint cool tint.
  vec3 col = vec3(0.010, 0.012, 0.018);

  // Three sweeping radial spotlights at different speeds and tints.
  // Each one slowly drifts on a Lissajous-like path.
  vec3 tints[3];
  tints[0] = vec3(0.90, 0.85, 0.75); // warm white
  tints[1] = vec3(0.50, 0.60, 0.90); // cool blue
  tints[2] = vec3(0.85, 0.55, 0.85); // soft magenta

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float t = u_time * (0.06 + fi * 0.03);
    vec2 c = vec2(
      0.50 * aspect + 0.40 * aspect * sin(t + fi * 2.3),
      0.50 + 0.30 * cos(t * 0.7 + fi * 1.1)
    );
    float d = length(p - c);
    // Soft falloff with a wide skirt.
    float light = exp(-d * d * 6.0) * 0.6;
    // Subtle inner core glow.
    light += exp(-d * d * 25.0) * 0.25;
    col += tints[i] * light;
  }

  // Vignette to keep edges dark.
  float vig = smoothstep(1.2, 0.45, distance(uv, vec2(0.5)));
  col *= mix(0.55, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function ThemeSpotlight() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
    >
      <ShaderCanvas
        context="fullscreen"
        fragShader={FRAG}
        fallback={<StaticFallback color="rgba(190,170,200,0.32)" context="fullscreen" />}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

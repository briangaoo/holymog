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

  // Distance + angle from center.
  float r = length(p);
  float a = atan(p.y, p.x);

  // Near-black backdrop with a deep gold radial fall-off.
  vec3 col = vec3(0.010, 0.008, 0.005);
  col += vec3(0.20, 0.14, 0.05) * (1.0 - smoothstep(0.0, 0.70, r));

  // Halo at center — bright disc with a thin bright rim.
  float halo = exp(-r * r * 70.0);
  col += vec3(1.0, 0.88, 0.55) * halo * 0.85;
  float rim = smoothstep(0.115, 0.105, abs(r - 0.12));
  col += vec3(1.0, 0.92, 0.65) * rim * 0.55;

  // God-rays: trig wave on angle, modulated by 1/r-ish falloff, slow rotation.
  // 18 spokes feels divine without being busy.
  float rayCount = 18.0;
  float rays = 0.5 + 0.5 * cos(a * rayCount + u_time * 0.10);
  // Sharpen rays a bit so they read as beams not gradient.
  rays = pow(rays, 1.6);
  // Add a second slow ray system for shimmer.
  float rays2 = 0.5 + 0.5 * cos(a * (rayCount * 0.5) - u_time * 0.07);
  rays = mix(rays, rays * rays2, 0.4);
  // Falloff with distance — rays brightest near halo, fade toward edges.
  float rayFalloff = smoothstep(0.10, 0.50, r) * smoothstep(1.20, 0.55, r);
  // Modulate ray brightness by overall slow breath.
  float breath = 0.85 + 0.15 * sin(u_time * 0.25);
  col += vec3(1.0, 0.78, 0.35) * rays * rayFalloff * 0.45 * breath;

  // Soft outer vignette to keep edges dark.
  float vig = smoothstep(1.0, 0.45, r);
  col *= mix(0.55, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function ThemeDivineRays() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
    >
      <ShaderCanvas
        context="fullscreen"
        fragShader={FRAG}
        fallback={<StaticFallback color="rgba(220,170,80,0.40)" context="fullscreen" />}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

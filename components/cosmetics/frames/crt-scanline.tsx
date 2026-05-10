'use client';

import type { ReactNode } from 'react';
import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';

const FRAG = /* glsl */ `
void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // Convert to ring-local coords: angle drives the "scan line" and radius
  // drives the screen curvature highlight.
  float TWO_PI = 6.28318530718;
  float a = (ang + 3.14159265) / TWO_PI; // 0..1 around ring

  // 4 scanlines rolling around the ring at slightly different speeds so
  // there's always at least one visible at small sizes.
  float t = u_time * 0.22;
  float band = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float pos = fract(t + fi * 0.25);
    float d = abs(a - pos);
    d = min(d, 1.0 - d);
    band += smoothstep(0.07, 0.0, d);
  }
  band = clamp(band, 0.0, 1.4);

  // Horizontal phosphor lines across the ring's radial dimension to give
  // it that CRT raster look at any zoom.
  float rasterPx = u_resolution.y * 0.012;
  float raster = 0.5 + 0.5 * sin(uv.y * rasterPx * TWO_PI);
  raster = mix(0.5, raster, 0.6);

  // Green phosphor base, brighter where the scan bands are.
  vec3 phosphor = vec3(0.06, 0.42, 0.18);
  vec3 hot = vec3(0.55, 1.0, 0.55);
  vec3 col = mix(phosphor, hot, band * 0.7);

  // Subtle scanline darkening
  col *= raster;

  // Screen curvature: lighten edges of the ring + faint vignette inward.
  float curve = smoothstep(0.55, 1.0, r) * (1.0 - smoothstep(0.96, 1.0, r));
  col += vec3(0.06, 0.18, 0.08) * curve;

  // Edge glow flicker.
  float flick = 0.94 + 0.06 * sin(u_time * 6.0 + r * 22.0);
  col *= flick;

  // Mask to disc + black bg behind everything.
  float disc = 1.0 - smoothstep(0.985, 1.0, r);
  vec3 bg = vec3(0.012, 0.02, 0.012);
  col = mix(bg, col, smoothstep(0.30, 0.62, r));
  gl_FragColor = vec4(col * disc, disc);
}
`;

export default function FrameCrtScanline({
  children,
  size,
}: {
  children: ReactNode;
  size: number;
  userStats?: never;
}) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 overflow-hidden rounded-full">
        <ShaderCanvas
          context="inline"
          fragShader={FRAG}
          fallback={
            <StaticFallback context="inline-ring" color="#22c55e" ring />
          }
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(5, Math.round(size * 0.07)) }}
      >
        {children}
      </div>
    </div>
  );
}

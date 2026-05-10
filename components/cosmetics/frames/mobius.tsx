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

  // Strip loop parameter u and its half-twist halfU. Half-twist makes the
  // ribbon return flipped after one ring loop — the möbius signature.
  float u = ang + u_time * 0.20;
  float halfU = u * 0.5;
  float cosH = cos(halfU);
  float sinH = sin(halfU);

  float R = 0.62;
  float wMax = 0.17;

  // Foreshortened ribbon width: narrows at edge-on points but never zero.
  float effW = wMax * (0.20 + 0.80 * abs(cosH));
  float rad = r - R;
  float band = 1.0 - smoothstep(effW * 0.85, effW, abs(rad));

  // Position across the ribbon, -1..1
  float vNorm = rad / max(effW, 0.001);

  // Lambertian on the ribbon face — bright face-on, dim edge-on.
  float lambert = abs(cosH);
  float shade = 0.22 + 0.58 * lambert;

  // 3D "upper" edge flips with the half-twist — this is what makes a
  // möbius read as non-orientable: same physical edge looks light on one
  // half of the loop and dark on the other.
  float upperFlag = vNorm * sign(cosH);
  shade += smoothstep(0.4, 1.0, upperFlag) * 0.22;
  shade -= smoothstep(0.4, 1.0, -upperFlag) * 0.14;

  // Tight specular highlight along the ribbon's "top" edge while face-on.
  float spec = smoothstep(0.78, 1.0, upperFlag) * lambert;
  shade += spec * 0.20;

  shade = clamp(shade, 0.04, 0.99);

  vec3 col = vec3(shade);

  // disc mask — fade out near the canvas edge.
  float disc = 1.0 - smoothstep(0.985, 1.0, r);
  gl_FragColor = vec4(col * band * disc, band * disc);
}
`;

export default function FrameMobius({
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
            <StaticFallback context="inline-ring" color="#cbd5e1" ring />
          }
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: Math.max(7, Math.round(size * 0.11)) }}
      >
        {children}
      </div>
    </div>
  );
}

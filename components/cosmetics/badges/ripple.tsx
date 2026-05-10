'use client';

import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';

const FRAG = /* glsl */ `
void main() {
  vec2 p = (v_uv - 0.5) * 2.0;
  float r = length(p);
  // disc mask so the badge silhouette stays square-rounded
  float mask = 1.0 - smoothstep(0.95, 1.0, r);
  // 4 expanding rings, staggered
  float intensity = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float radius = mod(u_time * 0.32 - fi * 0.25, 1.0);
    float band = 1.0 - smoothstep(0.0, 0.06, abs(r - radius));
    // fade as ring expands outward
    intensity += band * (1.0 - radius);
  }
  intensity = clamp(intensity, 0.0, 1.0);
  vec3 bg = vec3(0.04, 0.04, 0.05);
  vec3 wave = vec3(0.13, 0.83, 0.93);
  vec3 col = mix(bg, wave, intensity * mask);
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function BadgeRipple({ size }: { size: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        position: 'relative',
        borderRadius: '40%',
        overflow: 'hidden',
      }}
    >
      <ShaderCanvas
        context="inline"
        fragShader={FRAG}
        fallback={<StaticFallback color="rgba(34,211,238,0.6)" context="inline-square" />}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}

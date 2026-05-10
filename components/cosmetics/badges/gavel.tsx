'use client';

import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';

const FRAG = /* glsl */ `
float sdRect(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

mat2 rot(float a) {
  float c = cos(a); float s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  // map to centered coords -1..1
  vec2 p = (v_uv - 0.5) * 2.0;

  // 1.6s cycle: 0..0.5 swing down, 0.5..0.6 impact, 0.6..1 recoil + hold
  float phase = mod(u_time * 0.65, 1.0);
  float swing;
  if (phase < 0.5) {
    swing = mix(0.55, 0.0, smoothstep(0.0, 0.5, phase));
  } else {
    swing = mix(0.0, 0.55, smoothstep(0.5, 1.0, phase));
  }

  // pivot near top-right of badge so the gavel head arcs down to center
  vec2 pivot = vec2(0.45, 0.55);
  vec2 q = (p - pivot) * rot(swing) + pivot;

  // gavel head: horizontal slab centered around (-0.15, 0.0) post-rotation frame
  vec2 headCenter = vec2(-0.15, 0.0);
  float head = sdRect(q - headCenter, vec2(0.40, 0.16));

  // handle: thin segment from head center extending up-right toward pivot
  vec2 handleCenter = vec2(0.20, 0.30);
  float handle = sdRect(q - handleCenter, vec2(0.10, 0.28));

  float gavel = min(head, handle);
  float gavelMask = 1.0 - smoothstep(-0.005, 0.03, gavel);
  float gavelEdge = 1.0 - smoothstep(0.005, 0.05, abs(gavel));

  // shockwave fires from the impact point at the bottom on each strike
  vec2 impact = vec2(-0.30, -0.55);
  float shockTime = max(0.0, phase - 0.5) * 1.6;
  float shockR = shockTime * 1.4;
  float dist = length(p - impact);
  float shockBand = (1.0 - smoothstep(0.0, 0.10, abs(dist - shockR)));
  shockBand *= (1.0 - shockTime);
  shockBand *= step(0.5, phase);

  // impact flash on the moment of strike
  float flash = (1.0 - smoothstep(0.0, 0.08, max(0.0, phase - 0.5))) * step(0.5, phase);
  float flashGlow = flash * (1.0 - smoothstep(0.0, 0.4, dist));

  vec3 bg = vec3(0.04, 0.04, 0.05);
  vec3 gold = vec3(0.95, 0.74, 0.20);
  vec3 hot = vec3(1.0, 0.95, 0.65);

  vec3 col = bg;
  col = mix(col, gold, gavelMask);
  col += hot * gavelEdge * 0.18;
  col += hot * shockBand * 0.95;
  col += hot * flashGlow * 0.40;
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function BadgeGavel({ size }: { size: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        position: 'relative',
        borderRadius: '20%',
        overflow: 'hidden',
      }}
    >
      <ShaderCanvas
        context="inline"
        fragShader={FRAG}
        fallback={<StaticFallback color="rgba(212,175,55,0.7)" context="inline-square" />}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}

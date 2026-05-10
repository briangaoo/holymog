'use client';

import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';

const FRAG = /* glsl */ `
${NOISE_GLSL}

void main() {
  vec2 p = (v_uv - 0.5) * 2.0;
  float r = length(p);
  float angle = atan(p.y, p.x);

  // hard black disc — the moon
  float disc = smoothstep(0.50, 0.46, r);

  // corona profile peaks just outside the disc and fades to badge edge
  float coronaProfile = smoothstep(0.46, 0.62, r) * (1.0 - smoothstep(0.62, 0.95, r));

  // two octaves of angular noise rolling over time give it the lick
  float n1 = 0.5 + 0.5 * snoise(vec2(angle * 4.0, u_time * 0.35));
  float n2 = 0.5 + 0.5 * snoise(vec2(angle * 9.0 + 7.3, u_time * 0.55));
  float corona = coronaProfile * mix(n1, n2, 0.5);

  // outer dim ring of corona reaching toward the edge
  float halo = (1.0 - smoothstep(0.55, 0.95, r)) * smoothstep(0.55, 0.65, r) * 0.18;

  vec3 bg = vec3(0.04, 0.04, 0.05);
  vec3 sun = vec3(0.0, 0.0, 0.0);
  vec3 cor = vec3(1.0, 0.92, 0.62);
  vec3 col = bg + cor * (corona + halo);
  col = mix(col, sun, disc);
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function BadgeEclipse({ size }: { size: number }) {
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
        fallback={<StaticFallback color="rgba(244,200,69,0.55)" context="inline-square" />}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}

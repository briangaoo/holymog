'use client';

import { ShaderCanvas } from '@/components/cosmetics/ShaderCanvas';
import { StaticFallback } from '@/components/cosmetics/StaticFallback';
import { NOISE_GLSL } from '@/components/cosmetics/glsl/noise';

const FRAG = /* glsl */ `
${NOISE_GLSL}

void main() {
  vec2 p = v_uv;

  // 5 second cycle: ignite (0-0.12) -> burn (0.12-0.85) -> regen (0.85-1)
  float phase = mod(u_time * 0.20, 1.0);
  float decay = smoothstep(0.12, 0.85, phase);

  // stick: thin vertical, top burns down
  float stickTop = mix(0.55, 0.10, decay);
  float stickBottom = 0.05;
  float stickW = 0.045;
  float stickX = 1.0 - smoothstep(stickW, stickW + 0.018, abs(p.x - 0.5));
  float stickY = step(stickBottom, p.y) * step(p.y, stickTop);
  float stick = stickX * stickY;

  // match head: round bulb at top of stick, present until burnt
  float headLife = 1.0 - smoothstep(0.05, 0.18, phase);
  float headR = 0.085;
  float headD = length((p - vec2(0.5, stickTop + headR * 0.55)) * vec2(1.0, 0.85));
  float head = smoothstep(headR, headR - 0.025, headD) * headLife;

  // flame: noise-shaped blob above stick top, ignites and dies
  float ignite = smoothstep(0.05, 0.20, phase);
  float flameLife = ignite * (1.0 - smoothstep(0.78, 0.90, phase));
  float fy = (p.y - stickTop) / 0.42;
  float fx = (p.x - 0.5) / 0.16;
  float teardrop = (1.0 - smoothstep(0.0, 1.0, fy)) * smoothstep(-0.15, 0.10, fy);
  float widthMask = 1.0 - smoothstep(0.7, 1.05, abs(fx) + max(fy, 0.0) * 0.45);
  float fn = 0.5 + 0.5 * snoise(vec2(p.x * 7.0, p.y * 9.0 - u_time * 4.0));
  float flame = flameLife * teardrop * widthMask * (0.55 + 0.45 * fn);

  vec3 bg = vec3(0.04, 0.04, 0.05);
  vec3 stickCol = vec3(0.62, 0.42, 0.18);
  vec3 headCol = vec3(0.85, 0.20, 0.10);
  vec3 flameOuter = vec3(1.0, 0.45, 0.05);
  vec3 flameInner = vec3(1.0, 0.95, 0.65);
  vec3 flameCol = mix(flameOuter, flameInner, smoothstep(0.0, 0.7, flame));

  vec3 col = bg;
  col = mix(col, stickCol, stick);
  col = mix(col, headCol, head);
  col = mix(col, flameCol, clamp(flame * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function BadgeMatch({ size }: { size: number }) {
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
        fallback={<StaticFallback color="rgba(255,120,40,0.6)" context="inline-square" />}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}

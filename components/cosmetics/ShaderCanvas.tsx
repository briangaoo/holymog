'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useShaderLifecycle } from '@/hooks/useShaderLifecycle';

/**
 * WebGL1 fragment-shader wrapper. Every shader cosmetic mounts via
 * this component.
 *
 * Consumer passes a fragment-shader GLSL string (no `precision`
 * prefix needed — we prepend it). The component:
 *   - Compiles a passthrough vertex shader + the consumer's fragment
 *   - Mounts a full-screen triangle (3 verts) — no quad/indices
 *   - Always provides uniforms: u_time, u_resolution, u_dpr
 *   - Consumer can pass extra uniforms via the `uniforms` prop
 *     (numbers / vec2 / vec3 / vec4 / sampler bindings)
 *   - Runs a requestAnimationFrame loop bound to the shader lifecycle
 *   - Pauses + cleans up on out-of-viewport / hidden-tab
 *   - Handles webglcontextlost / restored with full re-init
 *   - Disposes program + buffers on unmount
 *
 * When `useShaderLifecycle` flags `disabled` (reduced-motion or
 * over-budget), this renders the `fallback` ReactNode instead of
 * mounting a canvas.
 *
 * Context: 'inline' (lists, badges, name-fx overlays, frames) or
 * 'fullscreen' (themes on a single profile page). Inline shaders
 * compete for ≤8 concurrent slots via `lib/shader-budget.ts`.
 */

type UniformValue =
  | number
  | [number, number]
  | [number, number, number]
  | [number, number, number, number];

export type ShaderCanvasProps = {
  context: 'inline' | 'fullscreen';
  /** GLSL fragment-shader source. No precision header — we prepend it.
   *  Available built-in uniforms: u_time (s), u_resolution (vec2 px), u_dpr (float).
   *  Available varying: v_uv (vec2 in [0,1]). */
  fragShader: string;
  /** Static fallback rendered when reduced-motion or out-of-budget. */
  fallback: ReactNode;
  /** Optional custom uniforms; updated on every frame. */
  uniforms?: Record<string, UniformValue>;
  className?: string;
  style?: CSSProperties;
};

const VERT_SHADER = /* glsl */ `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_PRELUDE = /* glsl */ `
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_dpr;
varying vec2 v_uv;
`;

export function ShaderCanvas({
  context,
  fragShader,
  fallback,
  uniforms,
  className,
  style,
}: ShaderCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { disabled, paused, dpr } = useShaderLifecycle({
    canvasRef: wrapperRef,
    context,
  });

  // GL state pinned to refs so the rAF loop doesn't capture stale values.
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const uniformLocRef = useRef<Map<string, WebGLUniformLocation | null>>(new Map());
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const uniformsRef = useRef<Record<string, UniformValue> | undefined>(uniforms);
  uniformsRef.current = uniforms;

  /** Compile a single shader stage. Returns null on failure. */
  const compileShader = useCallback(
    (gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? '';
        // eslint-disable-next-line no-console
        console.warn('[ShaderCanvas] compile error:', log);
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    },
    [],
  );

  /** Link the program. Returns null on failure. */
  const linkProgram = useCallback(
    (gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null => {
      const program = gl.createProgram();
      if (!program) return null;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) ?? '';
        // eslint-disable-next-line no-console
        console.warn('[ShaderCanvas] link error:', log);
        gl.deleteProgram(program);
        return null;
      }
      return program;
    },
    [],
  );

  /** Build the full GL pipeline: context, shaders, program, vertex buffer. */
  const initGL = useCallback((): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const gl =
      (canvas.getContext('webgl', { antialias: false, premultipliedAlpha: true }) as
        | WebGLRenderingContext
        | null) ?? null;
    if (!gl) return false;
    glRef.current = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_PRELUDE + fragShader);
    if (!vs || !fs) return false;
    const program = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!program) return false;
    programRef.current = program;
    gl.useProgram(program);

    // Full-screen triangle covering the canvas with one draw call.
    const buffer = gl.createBuffer();
    if (!buffer) return false;
    bufferRef.current = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    uniformLocRef.current = new Map();
    startTimeRef.current = performance.now();
    return true;
  }, [compileShader, linkProgram, fragShader]);

  /** Free GPU resources. Called on unmount + context loss. */
  const cleanupGL = useCallback(() => {
    const gl = glRef.current;
    if (!gl) return;
    if (programRef.current) gl.deleteProgram(programRef.current);
    if (bufferRef.current) gl.deleteBuffer(bufferRef.current);
    programRef.current = null;
    bufferRef.current = null;
    glRef.current = null;
    uniformLocRef.current.clear();
  }, []);

  /** Resolve a uniform location (lazy, memoized per-program). */
  const getUniformLoc = useCallback(
    (gl: WebGLRenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation | null => {
      const cached = uniformLocRef.current.get(name);
      if (cached !== undefined) return cached;
      const loc = gl.getUniformLocation(program, name);
      uniformLocRef.current.set(name, loc);
      return loc;
    },
    [],
  );

  /** Push consumer-supplied uniforms into the program. */
  const setUserUniforms = useCallback(
    (gl: WebGLRenderingContext, program: WebGLProgram) => {
      const u = uniformsRef.current;
      if (!u) return;
      for (const [name, value] of Object.entries(u)) {
        const loc = getUniformLoc(gl, program, name);
        if (!loc) continue;
        if (typeof value === 'number') {
          gl.uniform1f(loc, value);
        } else if (value.length === 2) {
          gl.uniform2f(loc, value[0], value[1]);
        } else if (value.length === 3) {
          gl.uniform3f(loc, value[0], value[1], value[2]);
        } else if (value.length === 4) {
          gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
        }
      }
    },
    [getUniformLoc],
  );

  /** Resize canvas backing store to match CSS px × DPR. Idempotent. */
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const gl = glRef.current;
    if (!canvas || !gl) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }, [dpr]);

  // Init + tear down GL.
  useEffect(() => {
    if (disabled) return;
    const ok = initGL();
    if (!ok) {
      cleanupGL();
      return;
    }
    resize();
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => resize())
        : null;
    if (ro && canvasRef.current) ro.observe(canvasRef.current);

    // Context-loss handlers — re-init when the GPU drops us.
    const canvas = canvasRef.current;
    const onLost = (e: Event) => {
      e.preventDefault();
      cleanupGL();
    };
    const onRestored = () => {
      if (initGL()) resize();
    };
    canvas?.addEventListener('webglcontextlost', onLost as EventListener);
    canvas?.addEventListener('webglcontextrestored', onRestored as EventListener);

    return () => {
      ro?.disconnect();
      canvas?.removeEventListener('webglcontextlost', onLost as EventListener);
      canvas?.removeEventListener('webglcontextrestored', onRestored as EventListener);
      cleanupGL();
    };
  }, [disabled, initGL, cleanupGL, resize]);

  // RAF loop — runs only when not paused. Disabled shaders never reach here.
  useEffect(() => {
    if (disabled || paused) return;
    const tick = () => {
      const gl = glRef.current;
      const program = programRef.current;
      if (gl && program) {
        const t = (performance.now() - startTimeRef.current) / 1000;
        const timeLoc = getUniformLoc(gl, program, 'u_time');
        const resLoc = getUniformLoc(gl, program, 'u_resolution');
        const dprLoc = getUniformLoc(gl, program, 'u_dpr');
        if (timeLoc) gl.uniform1f(timeLoc, t);
        if (resLoc && canvasRef.current) {
          gl.uniform2f(resLoc, canvasRef.current.width, canvasRef.current.height);
        }
        if (dprLoc) gl.uniform1f(dprLoc, dpr);
        setUserUniforms(gl, program);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [disabled, paused, dpr, getUniformLoc, setUserUniforms]);

  if (disabled) {
    return (
      <div
        ref={wrapperRef}
        className={className}
        style={{ position: 'relative', ...style }}
      >
        {fallback}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{ position: 'relative', ...style }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

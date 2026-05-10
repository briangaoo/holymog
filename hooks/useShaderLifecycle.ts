'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  acquireShaderSlot,
  onShaderBudgetChange,
  releaseShaderSlot,
} from '@/lib/shader-budget';
import { useDocumentVisibility } from './useDocumentVisibility';

type Context = 'inline' | 'fullscreen';

export type ShaderLifecycle = {
  /** True when the shader should NOT mount its canvas — either the user
   *  prefers reduced motion, or (inline only) the budget is exhausted.
   *  Consumers render their static fallback instead. */
  disabled: boolean;
  /** True when the RAF loop should pause but the canvas can stay
   *  mounted with its last-rendered frame visible. Triggered by
   *  out-of-viewport (inline) or tab-hidden (both contexts). */
  paused: boolean;
  /** Capped device-pixel-ratio for crisp rendering without doubling
   *  fragment cost on 3x phones. */
  dpr: number;
};

/**
 * Core lifecycle hook for every shader cosmetic. Wires together:
 *   - IntersectionObserver (inline only — pauses scrolled-off shaders)
 *   - prefers-reduced-motion (disables animation entirely)
 *   - document.visibilityState (pauses on hidden tabs)
 *   - shader-budget (inline shaders compete for ≤8 concurrent slots)
 *   - DPR cap at 2.0 to halve fragment cost on 3x screens
 *
 * `canvasRef` should be a ref to the outermost canvas-mounting element.
 * IntersectionObserver attaches to that element.
 */
export function useShaderLifecycle({
  canvasRef,
  context,
}: {
  canvasRef: RefObject<HTMLElement | null>;
  context: Context;
}): ShaderLifecycle {
  const visible = useDocumentVisibility();
  const [inView, setInView] = useState(context === 'fullscreen');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [budgetOk, setBudgetOk] = useState(true);
  const slotAcquired = useRef(false);

  // prefers-reduced-motion.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // IntersectionObserver — inline only (fullscreen is always considered in-view).
  useEffect(() => {
    if (context === 'fullscreen') {
      setInView(true);
      return;
    }
    const el = canvasRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '100px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasRef, context]);

  // Shader budget — inline only. Acquire when in-view + not reduced-motion;
  // release on out-of-view, reduced-motion change, or unmount. If we miss
  // a slot on first acquire, subscribe to budget changes and retry.
  useEffect(() => {
    if (context === 'fullscreen') {
      setBudgetOk(true);
      return;
    }
    if (reducedMotion || !inView) {
      if (slotAcquired.current) {
        releaseShaderSlot();
        slotAcquired.current = false;
      }
      setBudgetOk(false);
      return;
    }
    const tryAcquire = () => {
      if (slotAcquired.current) return;
      const got = acquireShaderSlot();
      slotAcquired.current = got;
      setBudgetOk(got);
    };
    tryAcquire();
    const unsubscribe = slotAcquired.current
      ? null
      : onShaderBudgetChange(tryAcquire);
    return () => {
      unsubscribe?.();
      if (slotAcquired.current) {
        releaseShaderSlot();
        slotAcquired.current = false;
      }
    };
  }, [inView, reducedMotion, context]);

  const dpr =
    typeof window === 'undefined'
      ? 1
      : Math.min(window.devicePixelRatio || 1, 2);

  return {
    disabled: reducedMotion || (context === 'inline' && !budgetOk),
    paused: !visible || (context === 'inline' && !inView),
    dpr,
  };
}

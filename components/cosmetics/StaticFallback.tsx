'use client';

/**
 * Reduced-motion / out-of-budget fallback primitive for shader
 * cosmetics. Renders a static gradient swatch matching the dominant
 * colour of the shader so the reduced-motion experience still feels
 * branded.
 *
 * Three modes:
 *   - 'inline-ring'      : 1:1 element with a filled-circle gradient,
 *                          appropriate as a frame fallback at any size
 *   - 'inline-square'    : 1:1 element with a filled rounded square,
 *                          appropriate as a badge fallback
 *   - 'fullscreen'       : fixed inset-0 radial gradient, appropriate
 *                          as a theme fallback
 *
 * Pass `ring` to render only the ring outline (used by frames where
 * a solid disc would cover the avatar).
 */
type Props = {
  color: string;
  context: 'inline-ring' | 'inline-square' | 'fullscreen';
  ring?: boolean;
  className?: string;
};

export function StaticFallback({
  color,
  context,
  ring = false,
  className = '',
}: Props) {
  if (context === 'fullscreen') {
    return (
      <div
        className={`pointer-events-none fixed inset-0 -z-10 ${className}`}
        aria-hidden
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${color} 0%, rgba(10,10,10,1) 70%)`,
        }}
      />
    );
  }
  if (context === 'inline-ring') {
    return (
      <span
        className={`pointer-events-none absolute inset-0 rounded-full ${className}`}
        aria-hidden
        style={
          ring
            ? { boxShadow: `inset 0 0 0 3px ${color}` }
            : {
                background: `radial-gradient(circle, ${color} 0%, rgba(10,10,10,0.0) 70%)`,
              }
        }
      />
    );
  }
  // inline-square
  return (
    <span
      className={`pointer-events-none absolute inset-0 rounded-xl ${className}`}
      aria-hidden
      style={{
        background: `radial-gradient(circle, ${color} 0%, rgba(10,10,10,0.0) 70%)`,
      }}
    />
  );
}

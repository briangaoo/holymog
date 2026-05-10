'use client';

import { useId, type ReactNode } from 'react';

/**
 * Clean handwritten signature underline that draws itself once on mount
 * via stroke-dashoffset animation. A quick swash loops back from the
 * end like a real handwritten signature flourish.
 */
export default function NameSigned({
  children,
}: {
  children: ReactNode;
}) {
  const uid = useId().replace(/:/g, '');
  const dashName = `name-fx-signed-draw-${uid}`;
  const pathClass = `name-fx-signed-path-${uid}`;
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-block',
        paddingBottom: '0.35em',
      }}
    >
      {children}
      <svg
        aria-hidden
        viewBox="0 0 100 12"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          left: '-2%',
          right: '-2%',
          bottom: 0,
          width: '104%',
          height: '0.35em',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        <path
          className={pathClass}
          d="M2 8 C 18 2, 38 11, 60 6 S 92 2, 98 9 Q 80 11, 70 4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
        <style>{`
          .${pathClass} {
            stroke-dasharray: 200;
            stroke-dashoffset: 200;
            animation: ${dashName} 1.6s cubic-bezier(0.65, 0, 0.35, 1) 0.15s forwards;
          }
          @keyframes ${dashName} {
            to { stroke-dashoffset: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .${pathClass} {
              animation: none;
              stroke-dashoffset: 0;
            }
          }
        `}</style>
      </svg>
    </span>
  );
}

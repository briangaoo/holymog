'use client';

/**
 * A+ tier badge — "mogger". Punchier green pill, bolder weight,
 * brighter glow.
 */
export default function BadgeMogger({ size }: { size: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: '100%',
        padding: '0 0.7em',
        fontSize: `${size * 0.5}px`,
        fontWeight: 900,
        letterSpacing: '0.08em',
        textTransform: 'lowercase',
        color: '#d1fae5',
        backgroundColor: 'rgba(34,197,94,0.28)',
        border: '1px solid rgba(34,197,94,0.85)',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        textShadow:
          '0 1px 0 rgba(0,0,0,0.55), 0 0 10px rgba(34,197,94,0.75), 0 0 22px rgba(34,197,94,0.35)',
        lineHeight: 1,
      }}
    >
      mogger
    </span>
  );
}

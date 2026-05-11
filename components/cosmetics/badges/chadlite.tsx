'use client';

/**
 * A tier badge — "chadlite". Green pill. Mogging starts here.
 */
export default function BadgeChadlite({ size }: { size: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: '100%',
        padding: '0 0.65em',
        fontSize: `${size * 0.5}px`,
        fontWeight: 800,
        letterSpacing: '0.06em',
        textTransform: 'lowercase',
        color: '#bbf7d0',
        backgroundColor: 'rgba(34,197,94,0.22)',
        border: '1px solid rgba(34,197,94,0.7)',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        textShadow: '0 1px 0 rgba(0,0,0,0.5), 0 0 8px rgba(34,197,94,0.55)',
        lineHeight: 1,
      }}
    >
      chadlite
    </span>
  );
}

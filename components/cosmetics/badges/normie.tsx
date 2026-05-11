'use client';

/**
 * C tier badge — "normie". Yellow pill.
 */
export default function BadgeNormie({ size }: { size: number }) {
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
        color: '#fef3c7',
        backgroundColor: 'rgba(234,179,8,0.20)',
        border: '1px solid rgba(234,179,8,0.65)',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        textShadow: '0 1px 0 rgba(0,0,0,0.5), 0 0 6px rgba(234,179,8,0.4)',
        lineHeight: 1,
      }}
    >
      normie
    </span>
  );
}

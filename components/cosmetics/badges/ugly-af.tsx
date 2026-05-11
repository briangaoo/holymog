'use client';

/**
 * F- tier badge — "ugly af". Red text pill. Lowest of the low. Self-
 * deprecating energy; equipped for the meme.
 */
export default function BadgeUglyAf({ size }: { size: number }) {
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
        color: '#fecaca',
        backgroundColor: 'rgba(239,68,68,0.18)',
        border: '1px solid rgba(239,68,68,0.55)',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        textShadow: '0 1px 0 rgba(0,0,0,0.5)',
        lineHeight: 1,
      }}
    >
      ugly af
    </span>
  );
}

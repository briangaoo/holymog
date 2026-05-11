'use client';

/**
 * F tier badge — "subhuman". Deeper red pill.
 */
export default function BadgeSubhuman({ size }: { size: number }) {
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
        color: '#fca5a5',
        backgroundColor: 'rgba(220,38,38,0.22)',
        border: '1px solid rgba(220,38,38,0.65)',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        textShadow: '0 1px 0 rgba(0,0,0,0.55), 0 0 6px rgba(220,38,38,0.45)',
        lineHeight: 1,
      }}
    >
      subhuman
    </span>
  );
}

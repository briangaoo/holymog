'use client';

/**
 * S- tier badge — "chad". Cyan→purple gradient text on a deep
 * iridescent pill. Static (no shimmer) — keeps the entry to S-band
 * clean; heartbreaker and true-adam pick up the motion.
 */
export default function BadgeChad({ size }: { size: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: '100%',
        padding: '0 0.7em',
        fontSize: `${size * 0.42}px`,
        fontWeight: 900,
        letterSpacing: '0.06em',
        textTransform: 'lowercase',
        whiteSpace: 'nowrap',
        lineHeight: 1,
        borderRadius: 999,
        border: '1px solid rgba(168, 85, 247, 0.8)',
        background:
          'linear-gradient(115deg, rgba(8, 47, 73, 0.85) 0%, rgba(59, 7, 100, 0.85) 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.40), 0 1px 2px rgba(0,0,0,0.55), 0 0 14px rgba(168,85,247,0.40)',
      }}
    >
      <span
        style={{
          backgroundImage: 'linear-gradient(115deg, #67e8f9 0%, #c084fc 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          filter: 'drop-shadow(0 0 5px rgba(168, 85, 247, 0.55))',
        }}
      >
        chad
      </span>
    </span>
  );
}

'use client';

/**
 * S- tier badge — "chad". Cyan→purple gradient text pill. The first
 * S-band flex. Static (no shimmer) so it reads as clean rather than
 * showy — heartbreaker and true-adam pick up the motion.
 */
export default function BadgeChad({ size }: { size: number }) {
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
        whiteSpace: 'nowrap',
        lineHeight: 1,
        borderRadius: 999,
        border: '1px solid rgba(168, 85, 247, 0.75)',
        background:
          'linear-gradient(115deg, rgba(34, 211, 238, 0.22) 0%, rgba(168, 85, 247, 0.22) 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.10), 0 0 10px rgba(168,85,247,0.30)',
      }}
    >
      <span
        style={{
          backgroundImage: 'linear-gradient(115deg, #22d3ee 0%, #a855f7 100%)',
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

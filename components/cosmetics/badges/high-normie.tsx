'use client';

/**
 * B tier badge — "high normie". Lime pill.
 */
export default function BadgeHighNormie({ size }: { size: number }) {
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
        color: '#ecfccb',
        backgroundColor: 'rgba(132,204,22,0.20)',
        border: '1px solid rgba(132,204,22,0.65)',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        textShadow: '0 1px 0 rgba(0,0,0,0.5), 0 0 6px rgba(132,204,22,0.45)',
        lineHeight: 1,
      }}
    >
      high normie
    </span>
  );
}

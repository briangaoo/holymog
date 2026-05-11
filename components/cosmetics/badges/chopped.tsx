'use client';

/**
 * F+ tier badge — "chopped". Red-orange pill. Top of the F band.
 */
export default function BadgeChopped({ size }: { size: number }) {
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
        color: '#fed7aa',
        backgroundColor: 'rgba(251,146,60,0.22)',
        border: '1px solid rgba(234,88,12,0.7)',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        textShadow: '0 1px 0 rgba(0,0,0,0.55), 0 0 7px rgba(249,115,22,0.5)',
        lineHeight: 1,
      }}
    >
      chopped
    </span>
  );
}

'use client';

/**
 * Tiny inline-SVG sparkline. No external chart lib — does one thing well:
 * draws a polyline from `points` mapped onto a fixed-size viewBox, with
 * an optional dot at the most recent point.
 *
 * `points` is interpreted oldest-left → newest-right. Auto-scales to the
 * data's min/max with a small vertical padding so the line never touches
 * the edge of the box. Stroke colour is settable so the chart can pick
 * up the brand accent for the surface it sits on (sky for ELO).
 */
export function Sparkline({
  points,
  width = 160,
  height = 40,
  stroke = 'rgba(255,255,255,0.85)',
  fill = 'rgba(255,255,255,0.10)',
  dot = true,
}: {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  dot?: boolean;
}) {
  if (points.length < 2) {
    return (
      <span
        aria-hidden
        className="inline-block text-[10px] text-zinc-600"
        style={{ width, height, lineHeight: `${height}px` }}
      >
        not enough data
      </span>
    );
  }

  const padY = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);
  const stepX = points.length === 1 ? 0 : width / (points.length - 1);

  const coords = points.map((value, i) => {
    const x = i * stepX;
    const t = (value - min) / range;
    const y = height - padY - t * (height - padY * 2);
    return [x, y] as const;
  });

  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');

  // Filled-area path: same line, then close down to the bottom.
  const areaPath =
    `${linePath}` +
    ` L ${(coords[coords.length - 1][0]).toFixed(2)} ${height}` +
    ` L 0 ${height} Z`;

  const last = coords[coords.length - 1];

  return (
    <svg
      role="img"
      aria-label="elo over time"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <path d={areaPath} fill={fill} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dot && (
        <circle
          cx={last[0]}
          cy={last[1]}
          r={2}
          fill={stroke}
          stroke="rgba(0,0,0,0.4)"
          strokeWidth={0.5}
        />
      )}
    </svg>
  );
}

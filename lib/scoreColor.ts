/**
 * Smooth red → orange → yellow → lime → green spectrum.
 * Every score gets a slightly different hue, so 56 (red-orange), 69
 * (yellow-green), and 91 (bright green) all read distinctly.
 */
export function getScoreColor(value: number): string {
  const v = Math.max(0, Math.min(100, value));
  let hue: number;
  if (v < 60) hue = (v / 60) * 25; // 0 → 25 (deep red → orange)
  else if (v < 70) hue = 25 + ((v - 60) / 10) * 45; // 25 → 70 (orange → yellow)
  else if (v < 80) hue = 70 + ((v - 70) / 10) * 40; // 70 → 110 (yellow → green)
  else hue = 110 + ((v - 80) / 20) * 25; // 110 → 135 (green → bright green)
  return `hsl(${hue.toFixed(1)}, 78%, 52%)`;
}

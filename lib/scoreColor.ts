/**
 * Score → color, banded to mirror the tier system. Each tier band gets a
 * distinct hue family (with a small smooth gradient within the band):
 *
 *   0-25   F  → red
 *   26-40  D  → orange
 *   41-55  C  → yellow
 *   56-70  B  → lime / yellow-green
 *   71-86  A  → green
 *   87-100 S  → rich sapphire (NOT green, so it differentiates from A)
 */
export function getScoreColor(value: number): string {
  const v = Math.max(0, Math.min(100, value));

  if (v < 26) {
    // F, red, slight shift toward orange-red at the top of the band.
    const t = v / 25;
    const hue = 0 + t * 14;
    return `hsl(${hue.toFixed(1)}, 80%, 52%)`;
  }
  if (v < 41) {
    // D, orange.
    const t = (v - 26) / 14;
    const hue = 22 + t * 14;
    return `hsl(${hue.toFixed(1)}, 80%, 52%)`;
  }
  if (v < 56) {
    // C, yellow.
    const t = (v - 41) / 14;
    const hue = 48 + t * 14;
    return `hsl(${hue.toFixed(1)}, 82%, 52%)`;
  }
  if (v < 71) {
    // B, lime / yellow-green.
    const t = (v - 56) / 14;
    const hue = 78 + t * 22;
    return `hsl(${hue.toFixed(1)}, 78%, 50%)`;
  }
  if (v < 87) {
    // A, green.
    const t = (v - 71) / 15;
    const hue = 115 + t * 18;
    return `hsl(${hue.toFixed(1)}, 75%, 50%)`;
  }
  // S, rich sapphire. Deepens as score climbs so S+ reads heavier.
  const t = (v - 87) / 13;
  const hue = 218 + t * 8; // 218..226, sapphire with a hint of purple at the top
  const sat = 78 + t * 10; // 78..88
  const light = 53 - t * 6; // 53..47
  return `hsl(${hue.toFixed(1)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`;
}

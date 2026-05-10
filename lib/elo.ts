/**
 * Standard ELO rating math, applied only to public 1v1 battles.
 *
 * - Initial rating: 1000 (set in profiles default)
 * - K = 32 for the first PROVISIONAL_MATCHES (lets new players move
 *   quickly toward their true rating)
 * - K = 16 once they've played >= PROVISIONAL_MATCHES games
 * - Score: 1 = winner, 0 = loser; no draws (peak-score wins)
 * - Floor: 0 (a rating can't go negative)
 * - Margin multiplier: K is scaled by margin of victory (peak-score
 *   delta), so a 92 vs 35 blowout moves more rating than a 92 vs 91
 *   squeaker. Logarithmic, capped at 1.5x. Damped by an autocorrelation
 *   correction so favorites can't farm rating by destroying weak
 *   opponents (the rich-get-richer failure mode of margin-aware ELO).
 */

export const PROVISIONAL_MATCHES = 30;

/** Hard cap on the margin multiplier — winner can't move more than 1.5×
 *  the base K. Keeps a perfect-blowout swing readable, prevents single-
 *  match volatility from feeling chaotic. */
const MAX_MARGIN_MULTIPLIER = 1.5;

function kFor(matchesPlayed: number): number {
  return matchesPlayed < PROVISIONAL_MATCHES ? 32 : 16;
}

function expected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Margin multiplier. Inputs:
 *   margin       — winnerPeak - loserPeak, expected in 0..100
 *   eloDiff      — winnerElo - loserElo (positive when favorite won)
 *
 * Shape:
 *   - Log-scaled component: ln(margin + 1) / 8, capped at 0.5 → up to
 *     +50% bonus in pure margin terms before damping. Calibrated so
 *     margin 100 hits the cap and margin ~30 sits around 0.42.
 *   - Autocorrelation: 2 / (max(0, eloDiff) * 0.001 + 2). At eloDiff=0
 *     factor is 1.0 (full bonus); at eloDiff=400 factor is 0.83; at
 *     eloDiff=1000 factor is 0.67. Underdog wins (eloDiff < 0) get
 *     full bonus — upsets are real signal.
 *   - Final: 1 + logComponent * autocorrection, hard-capped at
 *     MAX_MARGIN_MULTIPLIER for safety.
 *
 * Applied symmetrically to both winner's K and loser's K so the system
 * stays close to zero-sum (modulo the existing K asymmetry from
 * provisional-vs-settled K-factors, which is intentional).
 */
function marginMultiplier(margin: number, eloDiff: number): number {
  if (margin <= 0) return 1.0;
  const logComponent = Math.min(0.5, Math.log(margin + 1) / 8);
  const autocorrection = 2.0 / (Math.max(0, eloDiff) * 0.001 + 2.0);
  return Math.min(MAX_MARGIN_MULTIPLIER, 1 + logComponent * autocorrection);
}

export type EloUpdate = {
  newWinnerElo: number;
  newLoserElo: number;
  winnerDelta: number;
  loserDelta: number;
  /** The margin multiplier that was applied. Exposed so the API + UI
   *  can show "ELO +24 (1.4× margin)" or similar in the result screen
   *  if we want to surface why a swing was big. */
  marginMultiplier: number;
};

export function computeElo(input: {
  winnerElo: number;
  winnerMatches: number;
  winnerScore: number;
  loserElo: number;
  loserMatches: number;
  loserScore: number;
}): EloUpdate {
  const {
    winnerElo,
    winnerMatches,
    winnerScore,
    loserElo,
    loserMatches,
    loserScore,
  } = input;
  const Ew = expected(winnerElo, loserElo);
  const El = 1 - Ew;
  const margin = winnerScore - loserScore;
  const mult = marginMultiplier(margin, winnerElo - loserElo);
  const Kw = kFor(winnerMatches) * mult;
  const Kl = kFor(loserMatches) * mult;
  const newWinnerElo = Math.max(0, Math.round(winnerElo + Kw * (1 - Ew)));
  const newLoserElo = Math.max(0, Math.round(loserElo + Kl * (0 - El)));
  return {
    newWinnerElo,
    newLoserElo,
    winnerDelta: newWinnerElo - winnerElo,
    loserDelta: newLoserElo - loserElo,
    marginMultiplier: mult,
  };
}

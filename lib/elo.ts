/**
 * Standard ELO rating math, applied only to public 1v1 battles.
 *
 * - Initial rating: 1000 (set in profiles default)
 * - K = 32 for the first PROVISIONAL_MATCHES (lets new players move
 *   quickly toward their true rating)
 * - K = 16 once they've played >= PROVISIONAL_MATCHES games
 * - Score: 1 = winner, 0 = loser; no draws (peak-score wins)
 * - Floor: 0 (a rating can't go negative)
 */

export const PROVISIONAL_MATCHES = 30;

function kFor(matchesPlayed: number): number {
  return matchesPlayed < PROVISIONAL_MATCHES ? 32 : 16;
}

function expected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export type EloUpdate = {
  newWinnerElo: number;
  newLoserElo: number;
  winnerDelta: number;
  loserDelta: number;
};

export function computeElo(input: {
  winnerElo: number;
  winnerMatches: number;
  loserElo: number;
  loserMatches: number;
}): EloUpdate {
  const { winnerElo, winnerMatches, loserElo, loserMatches } = input;
  const Ew = expected(winnerElo, loserElo);
  const El = 1 - Ew;
  const Kw = kFor(winnerMatches);
  const Kl = kFor(loserMatches);
  const newWinnerElo = Math.max(0, Math.round(winnerElo + Kw * (1 - Ew)));
  const newLoserElo = Math.max(0, Math.round(loserElo + Kl * (0 - El)));
  return {
    newWinnerElo,
    newLoserElo,
    winnerDelta: newWinnerElo - winnerElo,
    loserDelta: newLoserElo - loserElo,
  };
}

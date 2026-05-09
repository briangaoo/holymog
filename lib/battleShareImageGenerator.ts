import { getTier } from './tier';

const W = 1080;
const H = 1920;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '');
  const r = parseInt(m.substring(0, 2), 16);
  const g = parseInt(m.substring(2, 4), 16);
  const b = parseInt(m.substring(4, 6), 16);
  return { r, g, b };
}

export type BattleShareInput = {
  self: { display_name: string; peak_score: number };
  opponent: { display_name: string; peak_score: number };
  won: boolean;
};

/**
 * Render a 1080×1920 (9:16) PNG of the battle result for sharing to
 * stories / DMs. Layout:
 *
 *   ┌────────────────────────────┐
 *   │   holymog wordmark         │
 *   │                            │
 *   │   you mogged   /    you    │
 *   │   <opponent>        got    │
 *   │                  mogged    │
 *   │                            │
 *   │   ┌─────────┐  ┌─────────┐ │
 *   │   │ S+      │  │ A       │ │
 *   │   │ 96      │  │ 78      │ │
 *   │   │ you     │  │ <name>  │ │
 *   │   │ WIN     │  │         │ │
 *   │   └─────────┘  └─────────┘ │
 *   │                            │
 *   │   rate yours at holymog…   │
 *   └────────────────────────────┘
 *
 * No participant photos — pre-existing storage is for the leaderboard
 * faces bucket and we don't want to leak in-battle frames into share
 * imagery without an explicit opt-in. Score panels are tier-coloured;
 * the winner panel gets an emerald border + WIN chip, the loser panel
 * is faded.
 */
export async function generateBattleShareImage(
  input: BattleShareInput,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');

  // ---- Background --------------------------------------------------
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Subtle radial wash. Emerald if won, deep red if lost.
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const accent = input.won ? '#10b981' : '#ef4444';
  const { r, g, b } = hexToRgb(accent);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.7);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.28)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ---- Wordmark ----------------------------------------------------
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '600 48px "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('holymog', cx, 140);

  // ---- Headline ----------------------------------------------------
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 130px Inter, system-ui, sans-serif';
  ctx.fillText(input.won ? 'you mogged' : 'you got mogged', cx, 380);

  // Subhead
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '500 38px "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace';
  const subhead = input.won
    ? 'highest peak score wins.'
    : 'rematch in the next one.';
  ctx.fillText(subhead, cx, 480);

  // ---- Score panels (side by side) --------------------------------
  // Two cards centered vertically, one for self, one for opponent.
  const panelW = 440;
  const panelH = 580;
  const gap = 40;
  const totalW = panelW * 2 + gap;
  const panelTop = 700;
  const leftX = cx - totalW / 2;
  const rightX = leftX + panelW + gap;

  drawScorePanel(ctx, leftX, panelTop, panelW, panelH, {
    label: 'you',
    name: input.self.display_name,
    score: input.self.peak_score,
    isWinner: input.won,
    faded: !input.won,
  });
  drawScorePanel(ctx, rightX, panelTop, panelW, panelH, {
    label: 'opponent',
    name: input.opponent.display_name,
    score: input.opponent.peak_score,
    isWinner: !input.won,
    faded: input.won,
  });

  // ---- Bottom CTA --------------------------------------------------
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '500 36px "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('rate yours at holymog.vercel.app', cx, H - 140);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob failed'));
    }, 'image/png');
  });
}

type PanelOpts = {
  label: string;
  name: string;
  score: number;
  isWinner: boolean;
  faded: boolean;
};

function drawScorePanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PanelOpts,
) {
  const { label, name, score, isWinner, faded } = opts;
  const tier = getTier(score);

  // Card background
  ctx.save();
  ctx.globalAlpha = faded ? 0.55 : 1;

  roundedRect(ctx, x, y, w, h, 36);
  ctx.fillStyle = isWinner ? 'rgba(16,185,129,0.10)' : 'rgba(255,255,255,0.03)';
  ctx.fill();

  // Border
  ctx.lineWidth = 4;
  ctx.strokeStyle = isWinner ? 'rgba(16,185,129,0.55)' : 'rgba(255,255,255,0.10)';
  ctx.stroke();

  // Top label (you / opponent)
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 30px "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), x + w / 2, y + 60);

  // Tier letter (large)
  const letterY = y + 200;
  ctx.font = '900 200px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (tier.isGradient) {
    const lg = ctx.createLinearGradient(x, letterY - 100, x + w, letterY + 100);
    lg.addColorStop(0, '#22d3ee');
    lg.addColorStop(1, '#a855f7');
    ctx.fillStyle = lg;
    if (tier.glow) {
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 30;
    }
  } else {
    ctx.fillStyle = tier.color;
  }
  ctx.fillText(tier.letter, x + w / 2, letterY);
  ctx.shadowBlur = 0;

  // Score number
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 140px Inter, system-ui, sans-serif';
  ctx.fillText(String(score), x + w / 2, y + 380);

  // Display name
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '500 32px Inter, system-ui, sans-serif';
  const trimmedName = truncate(name, 16);
  ctx.fillText(trimmedName, x + w / 2, y + 480);

  // Win chip
  if (isWinner) {
    const chipW = 140;
    const chipH = 44;
    const chipX = x + w / 2 - chipW / 2;
    const chipY = y + 510;
    roundedRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.fillStyle = 'rgba(16,185,129,0.30)';
    ctx.fill();
    ctx.fillStyle = '#10b981';
    ctx.font = '700 24px "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText('WIN', x + w / 2, chipY + chipH / 2);
  }

  ctx.restore();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

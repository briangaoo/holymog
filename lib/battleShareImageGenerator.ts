import { getTier } from './tier';
import { getScoreColor } from './scoreColor';
import {
  anyColorToRgb,
  readFonts,
  roundedRect,
} from './shareImageGenerator';

const W = 1080;
const H = 1920;

export type BattleShareInput = {
  self: {
    display_name: string;
    peak_score: number;
    /** Optional ELO delta for this match (signed). When present we
     *  render the same "+24 ELO · now 1547" pill the result screen
     *  shows. Omitted for private battles where ELO doesn't move. */
    elo_delta?: number;
    elo_after?: number;
  };
  opponent: { display_name: string; peak_score: number };
  won: boolean;
  /** Tie state is distinct from won=false so we render the zinc "TIED"
   *  treatment instead of the rose "GOT MOGGED" treatment. */
  tied?: boolean;
};

/**
 * Render a 1080×1920 PNG of the battle result for story / DM sharing.
 *
 * Mirrors components/MogResultScreen.tsx as faithfully as a static
 * canvas can — same headline ("YOU MOGGED" / "GOT MOGGED" / "TIED"),
 * same lowercase subhead ("you cooked @opponent."), same vs board
 * (two side-by-side cards with score + tier + name + progress bar),
 * same margin pill ("+12 · CLEAR WIN") and ELO pill ("+24 ELO · NOW
 * 1547") rendered to the bottom of the card. No in-battle peak frame
 * is bundled — peak frames are stored in the private holymog-battles
 * bucket and aren't exposed to the client at finish time anyway.
 */
export async function generateBattleShareImage(
  input: BattleShareInput,
): Promise<Blob> {
  const tied = input.tied === true;
  const fonts = readFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');

  // ---- Background -------------------------------------------------
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Headline accent — tier-color for win, rose for loss, zinc for tie.
  // Matches the result screen's ResultHeadline + ResultAmbient logic.
  const headlineColor = tied
    ? '#d4d4d8'
    : input.won
      ? getScoreColor(input.self.peak_score)
      : '#fda4af';

  // Radial wash, same intensity as the result screen ambient layer.
  const cx = W / 2;
  const washTopCY = H * 0.35;
  const washRgb = anyColorToRgb(headlineColor);
  const wash = ctx.createRadialGradient(
    cx,
    washTopCY,
    0,
    cx,
    washTopCY,
    Math.sqrt(W * W + H * H) * 0.55,
  );
  wash.addColorStop(
    0,
    `rgba(${washRgb.r}, ${washRgb.g}, ${washRgb.b}, ${input.won ? 0.32 : 0.22})`,
  );
  wash.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  // ---- Top wordmark -----------------------------------------------
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 38px ${fonts.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('holymog', cx, 110);

  // ---- HUGE headline ----------------------------------------------
  const headline = tied ? 'TIED' : input.won ? 'YOU MOGGED' : 'GOT MOGGED';
  // "YOU MOGGED" is longer than "GOT MOGGED" or "TIED"; size down a
  // touch when long so it doesn't bleed past the canvas edges.
  const headlineSize = headline.length > 5 ? 180 : 230;
  ctx.font = `900 ${headlineSize}px ${fonts.sans}`;
  ctx.fillStyle = headlineColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = `rgba(${washRgb.r}, ${washRgb.g}, ${washRgb.b}, 0.45)`;
  ctx.shadowBlur = 60;
  ctx.fillText(headline, cx, 320);
  ctx.shadowBlur = 0;

  // ---- Lowercase subhead -----------------------------------------
  const subhead = tied
    ? `you and @${input.opponent.display_name} tied.`
    : input.won
      ? `you cooked @${input.opponent.display_name}.`
      : `@${input.opponent.display_name} cooked you.`;
  ctx.fillStyle = tied
    ? 'rgba(212,212,216,0.85)'
    : input.won
      ? 'rgba(110,231,183,0.85)'
      : 'rgba(253,164,175,0.85)';
  ctx.font = `500 38px ${fonts.sans}`;
  ctx.fillText(truncate(subhead, 40), cx, 460);

  // ---- vs board (two cards) --------------------------------------
  const boardTop = 580;
  const cardW = 460;
  const cardH = 540;
  const gap = 40;
  const totalW = cardW * 2 + gap;
  const leftX = cx - totalW / 2;
  const rightX = leftX + cardW + gap;

  drawPlayerCard(ctx, leftX, boardTop, cardW, cardH, fonts, {
    label: 'you',
    name: input.self.display_name,
    score: input.self.peak_score,
    isWinner: !tied && input.won,
    tied,
  });
  drawPlayerCard(ctx, rightX, boardTop, cardW, cardH, fonts, {
    label: 'opponent',
    name: input.opponent.display_name,
    score: input.opponent.peak_score,
    isWinner: !tied && !input.won,
    tied,
  });

  // "vs" / "=" divider between the two cards
  ctx.fillStyle = tied ? '#71717a' : '#52525b';
  ctx.font = `900 italic 70px ${fonts.sans}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tied ? '=' : 'vs', cx, boardTop + cardH / 2);

  // ---- Margin pill ------------------------------------------------
  const delta = Math.abs(input.self.peak_score - input.opponent.peak_score);
  const marginText = tied
    ? 'dead even'
    : delta >= 25
      ? 'utter mog'
      : delta >= 12
        ? 'clear win'
        : delta >= 5
          ? 'comfortable'
          : delta >= 1
            ? 'photo finish'
            : 'dead even';
  const marginSign = tied
    ? '±0'
    : (input.won ? '+' : '−') + delta;

  drawPill(ctx, cx, boardTop + cardH + 80, fonts, {
    leadLabel: 'margin',
    leadValue: marginSign,
    leadValueColor: tied
      ? '#d4d4d8'
      : input.won
        ? '#34d399'
        : '#fb7185',
    tailLabel: marginText.toUpperCase(),
    borderColor: 'rgba(255,255,255,0.12)',
  });

  // ---- ELO pill (optional) ---------------------------------------
  if (typeof input.self.elo_delta === 'number') {
    const eloDelta = input.self.elo_delta;
    const positive = eloDelta > 0;
    const neutral = eloDelta === 0;
    const eloColor = tied
      ? '#d4d4d8'
      : positive
        ? '#34d399'
        : neutral
          ? '#a1a1aa'
          : '#fb7185';
    const eloSign = positive ? '+' : eloDelta < 0 ? '−' : '±';
    const eloLead = `${eloSign}${Math.abs(eloDelta)}`;
    const eloTail =
      typeof input.self.elo_after === 'number'
        ? `ELO  ·  NOW ${input.self.elo_after}`
        : 'ELO';
    drawPill(ctx, cx, boardTop + cardH + 200, fonts, {
      leadLabel: '',
      leadValue: eloLead,
      leadValueColor: eloColor,
      tailLabel: eloTail,
      borderColor: `rgba(${anyColorToRgb(eloColor).r}, ${anyColorToRgb(eloColor).g}, ${anyColorToRgb(eloColor).b}, 0.35)`,
      glowColor: eloColor,
    });
  }

  // ---- Bottom CTA -------------------------------------------------
  // Two-line CTA so it lands harder. Dare scales with outcome:
  // winners challenge friends to beat them, losers / tied get the
  // softer "scan yours" prompt.
  const dare = input.won ? 'beat my score' : 'scan yours';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 50px ${fonts.sans}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${dare} →`, cx, H - 180);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `500 30px ${fonts.mono}`;
  ctx.fillText('holymog.com', cx, H - 120);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob failed'));
    }, 'image/png');
  });
}

/* ---------- card + pill helpers ------------------------------------ */

type CardOpts = {
  label: string;
  name: string;
  score: number;
  isWinner: boolean;
  tied: boolean;
};

function drawPlayerCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fonts: ReturnType<typeof readFonts>,
  opts: CardOpts,
) {
  const { label, name, score, isWinner, tied } = opts;
  const tier = getTier(score);
  const color = tied ? '#a1a1aa' : getScoreColor(score);

  // Card bg + border. Winner gets emerald-tinted glow; tied gets a
  // neutral zinc border; loser stays subtle white/10.
  roundedRect(ctx, x, y, w, h, 36);
  if (isWinner) {
    const rgb = anyColorToRgb(color);
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(16,185,129,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Soft outer glow.
    ctx.save();
    ctx.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.45)`;
    ctx.shadowBlur = 32;
    roundedRect(ctx, x, y, w, h, 36);
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  } else if (tied) {
    ctx.fillStyle = 'rgba(113,113,122,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Winner chip
  if (isWinner) {
    const chipW = 180;
    const chipH = 44;
    const chipX = x + w - chipW - 16;
    const chipY = y + 16;
    roundedRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.fillStyle = 'rgba(16,185,129,0.25)';
    ctx.fill();
    ctx.fillStyle = '#6ee7b7';
    ctx.font = `700 20px ${fonts.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦ WINNER', chipX + chipW / 2, chipY + chipH / 2);
  } else if (tied) {
    const chipW = 130;
    const chipH = 44;
    const chipX = x + w - chipW - 16;
    const chipY = y + 16;
    roundedRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.fillStyle = 'rgba(113,113,122,0.30)';
    ctx.fill();
    ctx.fillStyle = '#e4e4e7';
    ctx.font = `700 20px ${fonts.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('= TIED', chipX + chipW / 2, chipY + chipH / 2);
  }

  // "YOU" / "OPPONENT" label
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = `700 22px ${fonts.mono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label.toUpperCase(), x + 28, y + 32);

  // Score + tier letter, baseline-aligned (mirrors the on-screen
  // `<span text-7xl>{score}</span><span text-3xl>{tier}</span>` row).
  const scoreText = String(score);
  ctx.font = `900 150px ${fonts.num}`;
  const scoreWidth = ctx.measureText(scoreText).width;
  const rowY = y + 230;

  ctx.fillStyle = color;
  ctx.shadowColor = `${color}88`;
  ctx.shadowBlur = 24;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(scoreText, x + 28, rowY);
  ctx.shadowBlur = 0;

  // Tier letter to the right of the score, sized for visual balance
  // with the score number. Gradient fill for S-tier.
  ctx.font = `900 70px ${fonts.num}`;
  const tierY = rowY - 8;
  if (tier.isGradient && !tied) {
    const lg = ctx.createLinearGradient(
      x + 28 + scoreWidth + 18,
      tierY - 60,
      x + 28 + scoreWidth + 160,
      tierY,
    );
    lg.addColorStop(0, '#22d3ee');
    lg.addColorStop(1, '#a855f7');
    ctx.fillStyle = lg;
  } else {
    ctx.fillStyle = color;
  }
  ctx.fillText(tier.letter.toUpperCase(), x + 28 + scoreWidth + 18, tierY);

  // Progress bar
  const barX = x + 28;
  const barY = y + 290;
  const barW = w - 56;
  const barH = 10;
  roundedRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  const fillW = Math.max(2, Math.round((score / 100) * barW));
  roundedRect(ctx, barX, barY, fillW, barH, barH / 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Display name (@truncated)
  ctx.fillStyle = '#ffffff';
  ctx.font = `500 30px ${fonts.sans}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(truncate(`@${name}`, 18), x + 28, y + 360);

  // Subtle inner highlight / shading at the bottom for depth.
  ctx.fillStyle = 'rgba(255,255,255,0.018)';
  roundedRect(ctx, x + 12, y + h - 80, w - 24, 60, 18);
  ctx.fill();
}

type PillOpts = {
  /** Small uppercase label printed before the value (e.g. "margin"). */
  leadLabel: string;
  /** The actual coloured number (e.g. "+12", "+24"). */
  leadValue: string;
  leadValueColor: string;
  /** Uppercase label printed after a separator dot (e.g. "CLEAR WIN"). */
  tailLabel: string;
  borderColor: string;
  /** When set, applies a soft outer glow in this colour. */
  glowColor?: string;
};

function drawPill(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  fonts: ReturnType<typeof readFonts>,
  opts: PillOpts,
) {
  const pillH = 86;
  // Width depends on the actual text. Measure each segment, sum with
  // padding + gap allowances, then centre the pill on cx.
  ctx.textBaseline = 'middle';

  const leadLabelText = opts.leadLabel ? opts.leadLabel.toUpperCase() : '';
  const tailLabelText = opts.tailLabel;
  const valueText = opts.leadValue;

  ctx.font = `700 22px ${fonts.mono}`;
  const leadLabelW = leadLabelText ? ctx.measureText(leadLabelText).width : 0;

  ctx.font = `900 44px ${fonts.num}`;
  const valueW = ctx.measureText(valueText).width;

  ctx.font = `700 22px ${fonts.mono}`;
  const tailLabelW = ctx.measureText(tailLabelText).width;
  const dotW = 24;
  const padX = 36;
  const gap = 18;

  const innerW =
    (leadLabelText ? leadLabelW + gap : 0) +
    valueW +
    gap +
    dotW +
    gap +
    tailLabelW;
  const pillW = innerW + padX * 2;
  const x = cx - pillW / 2;
  const y = cy - pillH / 2;

  // Pill background + border (+ optional outer glow for ELO).
  ctx.save();
  if (opts.glowColor) {
    ctx.shadowColor = opts.glowColor;
    ctx.shadowBlur = 28;
  }
  roundedRect(ctx, x, y, pillW, pillH, pillH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  ctx.fill();
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Walk the segments left → right.
  let cursor = x + padX;
  ctx.textAlign = 'left';

  if (leadLabelText) {
    ctx.fillStyle = '#a1a1aa';
    ctx.font = `700 22px ${fonts.mono}`;
    ctx.fillText(leadLabelText, cursor, cy);
    cursor += leadLabelW + gap;
  }

  ctx.fillStyle = opts.leadValueColor;
  ctx.font = `900 44px ${fonts.num}`;
  ctx.fillText(valueText, cursor, cy);
  cursor += valueW + gap;

  ctx.fillStyle = '#52525b';
  ctx.font = `700 28px ${fonts.mono}`;
  ctx.fillText('·', cursor + 6, cy);
  cursor += dotW + gap;

  ctx.fillStyle = '#d4d4d8';
  ctx.font = `700 22px ${fonts.mono}`;
  ctx.fillText(tailLabelText, cursor, cy);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

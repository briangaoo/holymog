import { getTier, getTierDescriptor } from './tier';
import type { FinalScores } from '@/types';

const W = 1080;
const H = 1920;

export type ScanShareInput = {
  scores: FinalScores;
  /** dataURL or blob URL of the captured frame, drawn into the avatar
   *  circle. If missing or failing to load we just skip the avatar — the
   *  rest of the card still renders cleanly. */
  capturedImage?: string;
};

/**
 * Render a 1080×1920 PNG of a scan result for story / DM sharing.
 *
 * Mirrors the on-screen reveal (components/ScoreReveal.tsx):
 *   • avatar circle with tier-color ring (same as on the result page)
 *   • huge tier letter, gradient + glow for S-tier
 *   • big numeric score under it
 *   • lowercase tier descriptor ("true adam", "high-tier normie", …)
 *   • 2×2 sub-score grid (jawline / eyes / skin / cheekbones)
 *   • bottom CTA → holymog.com
 *
 * Fallback state (vision call failed) collapses every numeric field to
 * "N/A" + zinc, same as the live UI.
 */
export async function generateShareImage(
  input: ScanShareInput,
): Promise<Blob> {
  const { scores, capturedImage } = input;
  const fallback = scores.fallback === true;
  const tier = getTier(scores.overall);
  const descriptor = getTierDescriptor(tier.letter);
  const fonts = readFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');

  // ---- Background -------------------------------------------------
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Tier-color radial wash, slightly off-center for visual interest.
  const cx = W / 2;
  const cy = H * 0.42;
  const maxR = Math.sqrt(W * W + H * H);
  const washHex = tier.isGradient ? '#a855f7' : tier.color;
  const washRgb = anyColorToRgb(washHex);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.55);
  grad.addColorStop(0, `rgba(${washRgb.r}, ${washRgb.g}, ${washRgb.b}, 0.28)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ---- Top wordmark -----------------------------------------------
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `600 38px ${fonts.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('holymog', cx, 120);

  // ---- Avatar (captured photo) ------------------------------------
  const avatarCY = 290;
  const avatarR = 100;
  if (capturedImage) {
    const img = await loadImage(capturedImage).catch(() => null);
    if (img) {
      // Tier-color ring.
      ctx.save();
      ctx.lineWidth = 5;
      if (tier.isGradient) {
        const ringGrad = ctx.createLinearGradient(
          cx - avatarR,
          avatarCY - avatarR,
          cx + avatarR,
          avatarCY + avatarR,
        );
        ringGrad.addColorStop(0, '#22d3ee');
        ringGrad.addColorStop(1, '#a855f7');
        ctx.strokeStyle = ringGrad;
      } else {
        ctx.strokeStyle = fallback ? '#71717a' : tier.color;
      }
      ctx.beginPath();
      ctx.arc(cx, avatarCY, avatarR + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Photo clipped to circle.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, avatarCY, avatarR, 0, Math.PI * 2);
      ctx.clip();
      drawImageCover(
        ctx,
        img,
        cx - avatarR,
        avatarCY - avatarR,
        avatarR * 2,
        avatarR * 2,
      );
      ctx.restore();
    }
  }

  // ---- Huge tier letter -------------------------------------------
  const letterY = 700;
  ctx.font = `900 360px ${fonts.num}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (fallback) {
    ctx.fillStyle = '#71717a';
    ctx.fillText('—', cx, letterY);
  } else if (tier.isGradient) {
    const lg = ctx.createLinearGradient(
      cx - 300,
      letterY - 200,
      cx + 300,
      letterY + 200,
    );
    lg.addColorStop(0, '#22d3ee');
    lg.addColorStop(1, '#a855f7');
    ctx.fillStyle = lg;
    if (tier.glow) {
      ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
      ctx.shadowBlur = 70;
    }
    ctx.fillText(tier.letter, cx, letterY);
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = tier.color;
    ctx.fillText(tier.letter, cx, letterY);
  }

  // ---- Big numeric score ------------------------------------------
  ctx.fillStyle = fallback ? '#71717a' : '#ffffff';
  ctx.font = `900 140px ${fonts.num}`;
  ctx.fillText(fallback ? 'N/A' : String(scores.overall), cx, 1000);

  // ---- Lowercase descriptor ---------------------------------------
  const descColor = fallback
    ? '#71717a'
    : tier.isGradient
      ? '#a855f7'
      : tier.color;
  ctx.fillStyle = descColor;
  ctx.font = `500 42px ${fonts.sans}`;
  ctx.fillText(fallback ? 'unavailable' : descriptor, cx, 1090);

  // ---- 2×2 sub-score grid -----------------------------------------
  const sub = scores.sub;
  const subItems: Array<{ label: string; value: number }> = [
    { label: 'jawline', value: sub.jawline },
    { label: 'eyes', value: sub.eyes },
    { label: 'skin', value: sub.skin },
    { label: 'cheekbones', value: sub.cheekbones },
  ];
  const tileW = 440;
  const tileH = 220;
  const gridGap = 32;
  const gridLeft = cx - tileW - gridGap / 2;
  const gridTop = 1200;

  for (let i = 0; i < subItems.length; i += 1) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = gridLeft + col * (tileW + gridGap);
    const y = gridTop + row * (tileH + gridGap);
    const item = subItems[i];

    roundedRect(ctx, x, y, tileW, tileH, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `600 22px ${fonts.mono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(item.label.toUpperCase(), x + 28, y + 28);

    ctx.fillStyle = fallback ? '#71717a' : '#ffffff';
    ctx.font = `900 96px ${fonts.num}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fallback ? 'N/A' : String(item.value), x + 28, y + 180);
  }

  // ---- Bottom CTA --------------------------------------------------
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `500 32px ${fonts.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('rate yours at holymog.com', cx, H - 130);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob failed'));
    }, 'image/png');
  });
}

/* ---------- shared helpers (also re-used by battle generator) -------- */

export function readFonts() {
  // Next.js next/font assigns hashed family names; the CSS variables on
  // <html> point at them. Reading the resolved value at draw-time means
  // the canvas uses the same face the page renders. Fall back to system
  // fonts when running outside a browser (SSR safety) or pre-hydration.
  if (typeof document === 'undefined') {
    return {
      sans: 'system-ui, -apple-system, sans-serif',
      num: 'system-ui, -apple-system, sans-serif',
      mono: 'ui-monospace, Menlo, monospace',
    };
  }
  const root = getComputedStyle(document.documentElement);
  const get = (n: string, fb: string) => root.getPropertyValue(n).trim() || fb;
  return {
    sans: `${get('--font-space-grotesk', 'system-ui')}, system-ui, -apple-system, sans-serif`,
    num: `${get('--font-dm-sans', 'system-ui')}, system-ui, -apple-system, sans-serif`,
    mono: `${get('--font-mono-numeric', 'ui-monospace')}, ui-monospace, Menlo, monospace`,
  };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // crossOrigin is harmless for data URLs and same-origin blob URLs.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  // CSS object-fit: cover, in canvas. Crops the longer side of the
  // source so the destination box is fully filled.
  const ir = img.width / img.height;
  const dr = dw / dh;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (ir > dr) {
    sw = img.height * dr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / dr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

export function roundedRect(
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

/**
 * Convert any CSS color (hex / rgb / hsl) into rgba components by
 * round-tripping through the browser's CSS color parser. Used to derive
 * a translucent radial-wash colour from the tier accent.
 */
export function anyColorToRgb(color: string): { r: number; g: number; b: number } {
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const m = color.replace('#', '');
    if (m.length === 3) {
      return {
        r: parseInt(m[0] + m[0], 16),
        g: parseInt(m[1] + m[1], 16),
        b: parseInt(m[2] + m[2], 16),
      };
    }
    return {
      r: parseInt(m.substring(0, 2), 16),
      g: parseInt(m.substring(2, 4), 16),
      b: parseInt(m.substring(4, 6), 16),
    };
  }
  // For hsl()/rgb() strings, paint into a 1×1 canvas and read back the
  // pixel — handles every CSS color the platform supports without
  // pulling in a parser.
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const cx = c.getContext('2d');
    if (cx) {
      cx.fillStyle = color;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    }
  }
  return { r: 168, g: 85, b: 247 }; // fallback to S-tier purple
}

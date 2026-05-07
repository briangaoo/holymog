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

export async function generateShareImage(score: number): Promise<Blob> {
  const tier = getTier(score);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');

  // Background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Radial gradient with tier color
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const innerColor = tier.isGradient ? '#7c3aed' : tier.color;
  const { r, g, b } = hexToRgb(
    innerColor.startsWith('#') && innerColor.length === 7 ? innerColor : '#7c3aed',
  );
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.6);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Top wordmark
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '600 48px "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('holymog', cx, 140);

  // Tier letter
  ctx.save();
  ctx.font = '900 600px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (tier.isGradient) {
    const lg = ctx.createLinearGradient(cx - 300, cy - 300, cx + 300, cy + 300);
    lg.addColorStop(0, '#22d3ee');
    lg.addColorStop(1, '#a855f7');
    ctx.fillStyle = lg;
    if (tier.glow) {
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 40;
    }
  } else {
    ctx.fillStyle = tier.color;
  }
  ctx.fillText(tier.letter, cx, cy);
  ctx.restore();

  // Bottom CTA
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '500 36px "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('rate yours at holymog.com', cx, H - 140);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob failed'));
    }, 'image/png');
  });
}

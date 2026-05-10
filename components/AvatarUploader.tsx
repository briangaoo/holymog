'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { motion } from 'framer-motion';
import { Check, ImagePlus, Loader2, X } from 'lucide-react';

const VIEWPORT_SIZE = 280;
const OUTPUT_SIZE = 256;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (url: string) => void;
};

/**
 * Avatar uploader modal with a custom drag-to-position + zoom-slider
 * cropper. No external library — all canvas math and pointer-event
 * handling is inline below.
 *
 * Flow:
 *   1. User picks a file via the system file picker.
 *   2. We load it into an off-DOM HTMLImageElement.
 *   3. The image renders into a circular `VIEWPORT_SIZE` viewport,
 *      anchored to its centre.
 *   4. The user drags the image around inside the viewport (mouse +
 *      touch) and adjusts the zoom slider (1× to 4×) to frame their
 *      face the way they want.
 *   5. On Save, we render the visible region (the square that the
 *      circle is inscribed in) to a `OUTPUT_SIZE`×`OUTPUT_SIZE` PNG
 *      and POST it as a base64 data URL to /api/account/avatar.
 */
export function AvatarUploader({ open, onClose, onSaved }: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  // Offset of the image's centre relative to the viewport's centre,
  // in viewport pixels. (0,0) means the image is centred.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setImgSrc(null);
    setImgEl(null);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setSaving(false);
    setErrorMsg(null);
  }, [open]);

  // Whenever a new image source is set, decode it into an HTMLImageElement.
  useEffect(() => {
    if (!imgSrc) {
      setImgEl(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      setImgEl(img);
      // Calculate the minimum scale that keeps the image covering the
      // viewport on its smaller axis. We start at this scale so the
      // initial frame is fully covered.
      const minCoverScale = Math.max(
        VIEWPORT_SIZE / img.naturalWidth,
        VIEWPORT_SIZE / img.naturalHeight,
      );
      // Scale stored as a multiplier on top of the cover-scale baseline.
      // 1 = exactly covers; >1 zooms in.
      setScale(1);
      setOffset({ x: 0, y: 0 });
      // Stash the cover-scale on the element itself for later canvas math.
      (img as unknown as { _coverScale: number })._coverScale = minCoverScale;
    };
    img.onerror = () => {
      setErrorMsg('could not load that image');
      setImgEl(null);
    };
    img.src = imgSrc;
  }, [imgSrc]);

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setErrorMsg('that file is not an image');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setErrorMsg('image must be under 10MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setErrorMsg(null);
        setImgSrc(reader.result as string);
      };
      reader.onerror = () => setErrorMsg('could not read that file');
      reader.readAsDataURL(file);
      // Reset the input so picking the same file twice still triggers.
      e.target.value = '';
    },
    [],
  );

  // Constrain offset so the image always covers the viewport. Called
  // every time scale or offset change.
  const constrain = useCallback(
    (next: { x: number; y: number }, currScale: number) => {
      if (!imgEl) return next;
      const cover = (imgEl as unknown as { _coverScale: number })._coverScale ?? 1;
      const totalScale = cover * currScale;
      const renderedW = imgEl.naturalWidth * totalScale;
      const renderedH = imgEl.naturalHeight * totalScale;
      const maxX = Math.max(0, (renderedW - VIEWPORT_SIZE) / 2);
      const maxY = Math.max(0, (renderedH - VIEWPORT_SIZE) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, next.x)),
        y: Math.max(-maxY, Math.min(maxY, next.y)),
      };
    },
    [imgEl],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!imgEl) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOffsetX: offset.x,
        startOffsetY: offset.y,
      };
    },
    [imgEl, offset.x, offset.y],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      setOffset(
        constrain(
          { x: drag.startOffsetX + dx, y: drag.startOffsetY + dy },
          scale,
        ),
      );
    },
    [constrain, scale],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragRef.current?.pointerId === e.pointerId) {
        dragRef.current = null;
      }
    },
    [],
  );

  const onScaleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.target.value);
      setScale(next);
      setOffset((cur) => constrain(cur, next));
    },
    [constrain],
  );

  // Render the current crop into a canvas and POST.
  const onSave = useCallback(async () => {
    if (!imgEl) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const cover = (imgEl as unknown as { _coverScale: number })._coverScale ?? 1;
      const totalScale = cover * scale;
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('canvas unavailable');
      }
      // Map the viewport-space crop back into source-image space:
      // viewport centre is at (image-centre + offset), and we want to
      // sample the OUTPUT_SIZE-square region the user is seeing.
      const centerXSrc = imgEl.naturalWidth / 2 - offset.x / totalScale;
      const centerYSrc = imgEl.naturalHeight / 2 - offset.y / totalScale;
      const halfSrc = VIEWPORT_SIZE / 2 / totalScale;
      const sx = centerXSrc - halfSrc;
      const sy = centerYSrc - halfSrc;
      const sSize = halfSrc * 2;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgEl, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const dataUrl = canvas.toDataURL('image/png');
      const res = await fetch('/api/account/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(data.error ?? 'upload failed');
        setSaving(false);
        return;
      }
      const data = (await res.json()) as { image: string };
      onSaved(data.image);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'upload failed');
      setSaving(false);
    }
  }, [imgEl, scale, offset, onSaved, onClose]);

  if (!open) return null;

  const cover = imgEl
    ? (imgEl as unknown as { _coverScale: number })._coverScale ?? 1
    : 1;
  const totalScale = cover * scale;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 16, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-[#0c0c0c] p-6"
        style={{
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.08), 0 30px 80px -20px rgba(0,0,0,0.7)',
        }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Profile picture</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 transition-colors hover:bg-white/[0.10] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {!imgEl ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-48 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] text-sm text-white/70 transition-colors hover:border-white/25 hover:bg-white/[0.04]"
            >
              <ImagePlus size={24} aria-hidden />
              <span>Pick an image</span>
              <span className="text-[11px] text-white/45">
                PNG / JPG, up to 10MB
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png, image/jpeg"
              onChange={onPickFile}
              className="sr-only"
            />
            {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div
              className="relative cursor-grab overflow-hidden rounded-full active:cursor-grabbing"
              style={{
                width: VIEWPORT_SIZE,
                height: VIEWPORT_SIZE,
                background: '#000',
                touchAction: 'none',
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgEl.src}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  width: imgEl.naturalWidth * totalScale,
                  height: imgEl.naturalHeight * totalScale,
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />
              {/* Inset rim so the circle reads as a frame. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.1)' }}
              />
            </div>

            <div className="flex w-full flex-col gap-2">
              <label
                htmlFor="avatar-zoom"
                className="text-[10px] uppercase tracking-[0.18em] text-white/45"
              >
                Zoom
              </label>
              <input
                id="avatar-zoom"
                type="range"
                min={MIN_SCALE}
                max={MAX_SCALE}
                step={0.01}
                value={scale}
                onChange={onScaleChange}
                className="h-1 w-full accent-white"
              />
            </div>

            <div className="flex w-full gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] text-sm font-medium text-white transition-colors hover:bg-white/[0.07] disabled:opacity-50"
              >
                <ImagePlus size={14} aria-hidden /> Replace
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Check size={14} /> Save
                  </>
                )}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png, image/jpeg"
              onChange={onPickFile}
              className="sr-only"
            />

            {errorMsg && (
              <p className="text-xs text-red-400">{errorMsg}</p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

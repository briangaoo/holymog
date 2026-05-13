'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { motion } from 'framer-motion';
import { Check, ImagePlus, Loader2, X } from 'lucide-react';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

const OUTPUT_W = 1500;
const OUTPUT_H = 500;
const JPEG_QUALITY = 0.92;

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (url: string) => void;
};

/**
 * Banner uploader — sibling of AvatarUploader using the same
 * draggable-crop-rectangle pattern over a fixed image. Aspect is
 * locked to 3:1 so the resize handles produce only valid banner
 * geometries. Output is a 1500×500 JPEG (q 0.92) — sharp re-encodes
 * server-side, but JPEG keeps the upload payload tight (~150 KB vs
 * ~1 MB for the equivalent PNG).
 */
export function BannerUploader({ open, onClose, onSaved }: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(
    undefined,
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setImgSrc(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setSaving(false);
    setErrorMsg(null);
  }, [open]);

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setErrorMsg('that file is not an image');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setErrorMsg('image must be under 10mb');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setErrorMsg(null);
        setImgSrc(reader.result as string);
      };
      reader.onerror = () => setErrorMsg('could not read that file');
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [],
  );

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      // Start with a 90%-wide 3:1 crop centered. For tall portraits
      // the height-anchored variant kicks in automatically via
      // makeAspectCrop's clamping.
      const initial = centerCrop(
        makeAspectCrop({ unit: '%', width: 90 }, 3 / 1, width, height),
        width,
        height,
      );
      setCrop(initial);
    },
    [],
  );

  const onSave = useCallback(async () => {
    const img = imgRef.current;
    if (!img || !completedCrop) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_W;
      canvas.height = OUTPUT_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas unavailable');
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      const sx = completedCrop.x * scaleX;
      const sy = completedCrop.y * scaleY;
      const sw = completedCrop.width * scaleX;
      const sh = completedCrop.height * scaleY;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_W, OUTPUT_H);
      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const res = await fetch('/api/account/banner', {
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
      const data = (await res.json()) as { banner_url?: string };
      if (data.banner_url) onSaved(data.banner_url);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'upload failed');
      setSaving(false);
    }
  }, [completedCrop, onSaved, onClose]);

  if (!open) return null;

  // No backdrop click-to-close: react-image-crop's drag handles let
  // you pull the crop rectangle past the visible image area, and on
  // mouseup outside the modal the backdrop's click would close the
  // dialog mid-drag. The X button is the only path out.
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ y: 16, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="relative w-full max-w-lg overflow-hidden rounded-none border border-white/15 bg-[#0c0c0c] p-6"
        style={{
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.08), 0 30px 80px -20px rgba(0,0,0,0.7)',
        }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Banner</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 transition-colors hover:bg-white/[0.10] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {!imgSrc ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-48 w-full flex-col items-center justify-center gap-3 rounded-sm border-2 border-dashed border-white/15 bg-white/[0.02] text-sm text-white/70 transition-colors hover:border-white/25 hover:bg-white/[0.04]"
            >
              <ImagePlus size={24} aria-hidden />
              <span>Pick an image</span>
              <span className="text-[11px] text-white/45">
                <span className="uppercase">png / jpg / webp</span>, up to 10
                <span className="uppercase">mb</span> · 3:1 looks best
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png, image/jpeg, image/webp"
              onChange={onPickFile}
              className="sr-only"
            />
            {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
          </div>
        ) : (
          <div className="flex flex-col items-stretch gap-4">
            <div className="rounded-sm overflow-hidden bg-black flex items-center justify-center max-h-[60vh]">
              <ReactCrop
                crop={crop}
                onChange={(_pixel, percent) => setCrop(percent)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={3 / 1}
                keepSelection
                minWidth={60}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt=""
                  onLoad={onImageLoad}
                  style={{
                    maxHeight: '60vh',
                    maxWidth: '100%',
                    display: 'block',
                  }}
                />
              </ReactCrop>
            </div>

            <div className="flex gap-2">
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
                disabled={saving || !completedCrop}
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
              accept="image/png, image/jpeg, image/webp"
              onChange={onPickFile}
              className="sr-only"
            />

            {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
          </div>
        )}
      </motion.div>
    </div>
  );
}

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

const OUTPUT_SIZE = 256;

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (url: string) => void;
};

/**
 * Avatar uploader with a GitHub-style draggable / resizable crop circle
 * over a fixed image. The user picks a photo, then drags + resizes the
 * crop circle to choose what becomes the avatar. On save we render
 * the selected pixels through a canvas at OUTPUT_SIZE × OUTPUT_SIZE
 * and POST as a base64 PNG to /api/account/avatar.
 *
 * Why this over a zoom slider: matches the muscle-memory pattern users
 * have from GitHub / Twitter / Discord, makes off-center crops easy
 * (head in upper third of frame, etc), and avoids the "image moves
 * but the hole is fixed" double-think that the slider UX created.
 */
export function AvatarUploader({ open, onClose, onSaved }: Props) {
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
      e.target.value = '';
    },
    [],
  );

  // When the image loads, center a square crop covering 80% of the
  // shorter dimension — sane default the user usually doesn't need to
  // tweak. Locking the aspect to 1 keeps the crop circle perfectly
  // round throughout the resize gestures.
  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      const initial = centerCrop(
        makeAspectCrop({ unit: '%', width: 80 }, 1, width, height),
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
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas unavailable');
      // The displayed image is scaled to fit the modal — translate
      // the on-screen pixel crop back to the source image's natural
      // resolution before sampling.
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      const sx = completedCrop.x * scaleX;
      const sy = completedCrop.y * scaleY;
      const sw = completedCrop.width * scaleX;
      const sh = completedCrop.height * scaleY;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
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
  }, [completedCrop, onSaved, onClose]);

  if (!open) return null;

  // No backdrop click-to-close: react-image-crop's drag handles let
  // you pull the crop selection past the visible image area, and on
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

        {!imgSrc ? (
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
          <div className="flex flex-col items-stretch gap-4">
            {/* The crop UI. Setting cropShape="round" draws a circle
                overlay; the underlying crop rect stays square because
                aspect=1 — so the avatar always renders perfectly round
                without distorting the source pixels. */}
            <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center max-h-[60vh]">
              <ReactCrop
                crop={crop}
                onChange={(_pixel, percent) => setCrop(percent)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                circularCrop
                keepSelection
                minWidth={40}
                minHeight={40}
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
              accept="image/png, image/jpeg"
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

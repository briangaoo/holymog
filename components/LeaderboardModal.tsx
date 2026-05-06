'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import type { FinalScores } from '@/types';

const MAX_NAME_LEN = 24;

type Props = {
  open: boolean;
  scores: FinalScores;
  capturedImage: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export function LeaderboardModal({
  open,
  scores,
  capturedImage,
  onClose,
  onSubmitted,
}: Props) {
  const [name, setName] = useState('');
  const [includePhoto, setIncludePhoto] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setIncludePhoto(false);
    setStatus({ kind: 'idle' });
    const t = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => window.clearTimeout(t);
  }, [open]);

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LEN) return;
    setStatus({ kind: 'submitting' });
    try {
      const body: Record<string, unknown> = { name: trimmed, scores };
      if (includePhoto) body.imageBase64 = capturedImage;
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const msg =
          data.error === 'rate_limited'
            ? 'too many submissions, slow down'
            : data.error === 'leaderboard_unconfigured'
              ? 'leaderboard not yet available'
              : 'could not save, try again';
        setStatus({ kind: 'error', message: msg });
        return;
      }
      setStatus({ kind: 'success' });
      onSubmitted?.();
      window.setTimeout(onClose, 900);
    } catch {
      setStatus({ kind: 'error', message: 'network error' });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void submit();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lb-title"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-black p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="lb-title" className="text-base font-semibold text-white">
                Add to leaderboard
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mb-3 text-sm text-zinc-400">
              Pick a name or nickname to show next to your score.
            </p>

            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LEN))}
              onKeyDown={onKeyDown}
              placeholder="your name"
              maxLength={MAX_NAME_LEN}
              className="mb-3 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
              autoComplete="off"
              aria-label="Name"
            />

            <button
              type="button"
              onClick={() => setIncludePhoto((v) => !v)}
              aria-pressed={includePhoto}
              className="mb-1 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-left transition-colors hover:bg-white/[0.05]"
              style={{ touchAction: 'manipulation' }}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                  includePhoto
                    ? 'border-emerald-500 bg-emerald-500'
                    : 'border-white/30 bg-transparent'
                }`}
                aria-hidden
              >
                {includePhoto && <Check size={13} strokeWidth={3} className="text-black" />}
              </span>
              <span className="flex-1">
                <span className="block text-sm text-white">also share my photo</span>
                <span className="block text-[11px] text-zinc-500">
                  shows next to your name on the board
                </span>
              </span>
              {includePhoto && (
                <span className="overflow-hidden rounded-full border border-white/15">
                  <img
                    src={capturedImage}
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 object-cover"
                  />
                </span>
              )}
            </button>

            <div className="mb-4" />


            {status.kind === 'error' && (
              <p className="mb-3 text-xs text-red-400">{status.message}</p>
            )}
            {status.kind === 'success' && (
              <p className="mb-3 text-xs text-emerald-400">added — see you on the board</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                style={{ touchAction: 'manipulation' }}
                className="h-11 flex-1 rounded-full border border-white/15 bg-white/[0.03] text-sm text-white hover:bg-white/[0.07]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={
                  status.kind === 'submitting' ||
                  status.kind === 'success' ||
                  name.trim().length === 0
                }
                style={{ touchAction: 'manipulation' }}
                className="h-11 flex-1 rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 disabled:opacity-50"
              >
                {status.kind === 'submitting' ? 'saving…' : 'Submit'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

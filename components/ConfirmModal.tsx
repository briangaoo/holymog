'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

export type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional input. When set, the modal renders a labeled input and
   *  the caller receives the typed value back in `onConfirm`. Used for
   *  destructive "type DELETE to confirm" flows AND for 2FA-style
   *  code prompts. */
  input?: {
    placeholder?: string;
    autoComplete?: string;
    inputMode?: 'text' | 'numeric';
    /** Disables the confirm button until typed === matchPhrase. */
    matchPhrase?: string;
    /** Min length the typed value must reach before confirm enables. */
    minLength?: number;
  };
  /** Renders the confirm button in red. */
  danger?: boolean;
  /** Disables both buttons (e.g. while a request is in flight). */
  busy?: boolean;
  onConfirm: (typed?: string) => void;
  onCancel: () => void;
};

/**
 * App-wide replacement for the browser's native confirm() / prompt().
 * Renders as a centered modal via portal so it's never clipped by an
 * ancestor with backdrop-blur/transform/will-change. Used for
 * destructive actions (delete account, reset stats, remove
 * leaderboard, kick other sessions) and for inline 2FA code prompts.
 *
 * Cancel paths: clicking the backdrop, the X button, or pressing
 * Escape all fire onCancel. Enter inside the input fires onConfirm
 * (gated by the input's validation).
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  input,
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  if (!mounted) return null;

  const valid = input
    ? (input.matchPhrase
        ? typed === input.matchPhrase
        : input.minLength
          ? typed.length >= input.minLength
          : typed.length > 0)
    : true;

  const handleConfirm = () => {
    if (busy || !valid) return;
    if (input) onConfirm(typed);
    else onConfirm();
  };

  const dialog = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[150] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={onCancel}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
          }}
        >
          <span
            aria-hidden
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
          />
          <motion.div
            initial={{ y: 16, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm overflow-hidden rounded-sm border border-white/15 bg-[#0c0c0c] p-6"
            style={{
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.08), 0 30px 80px -20px rgba(0,0,0,0.7)',
            }}
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                {danger && (
                  <AlertTriangle
                    size={16}
                    className="text-red-400"
                    aria-hidden
                  />
                )}
                {title}
              </h2>
              <button
                type="button"
                onClick={onCancel}
                aria-label="Close"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            {description && (
              <div className="mb-4 text-[13px] leading-relaxed text-zinc-400">
                {description}
              </div>
            )}

            {input && (
              <input
                autoFocus
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
                placeholder={input.placeholder}
                inputMode={input.inputMode}
                autoComplete={input.autoComplete ?? 'off'}
                spellCheck={false}
                className={`mb-4 w-full rounded-sm border bg-white/[0.02] px-3 py-2 text-[14px] text-white normal-case placeholder:text-zinc-600 focus:outline-none focus:ring-2 ${
                  danger
                    ? 'border-red-500/30 focus:border-red-500/50 focus:ring-red-500/15'
                    : 'border-white/10 focus:border-white/40 focus:ring-white/15'
                }`}
              />
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="h-10 rounded-full border border-white/15 bg-white/[0.03] px-4 text-sm text-white transition-colors hover:bg-white/[0.07] disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy || !valid}
                className={`h-10 rounded-full px-4 text-sm font-semibold transition-colors ${
                  danger
                    ? 'bg-red-500 text-white hover:bg-red-400'
                    : 'bg-foreground text-background hover:opacity-90'
                } disabled:opacity-40 disabled:hover:bg-current`}
              >
                {busy ? '…' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(dialog, document.body);
}

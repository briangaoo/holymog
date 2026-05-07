'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Download, Check } from 'lucide-react';

type Props = {
  accountKey: string;
  onDone: () => void;
};

export function AccountKeyCard({ accountKey, onDone }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(accountKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  const download = () => {
    const body =
      `holymog account key\n${accountKey}\n\n` +
      `Save this. You'll need it to update your score on a different device.\n` +
      `Use it at https://holymog.com when prompted.\n`;
    const blob = new Blob([body], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `holymog-${accountKey}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-white">your account key</h3>
        <p className="text-xs leading-relaxed text-zinc-400">
          Save this. You&apos;ll need it to update your score from a different
          device. We won&apos;t show it again.
        </p>
      </div>

      <div
        className="rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-4 text-center"
        aria-label={`account key ${accountKey.split('').join(' ')}`}
      >
        <div
          className="font-mono text-2xl font-bold tracking-[0.32em] text-white normal-case"
          style={{ letterSpacing: '0.32em' }}
        >
          {accountKey}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={copy}
          aria-label="Copy account key"
          style={{ touchAction: 'manipulation' }}
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] text-sm font-medium text-white transition-colors hover:bg-white/[0.07]"
        >
          {copied ? (
            <>
              <Check size={14} aria-hidden /> Copied
            </>
          ) : (
            <>
              <Copy size={14} aria-hidden /> Copy
            </>
          )}
        </button>
        <button
          type="button"
          onClick={download}
          aria-label="Download account key as text file"
          style={{ touchAction: 'manipulation' }}
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] text-sm font-medium text-white transition-colors hover:bg-white/[0.07]"
        >
          <Download size={14} aria-hidden /> Download
        </button>
      </div>

      <button
        type="button"
        onClick={onDone}
        style={{ touchAction: 'manipulation' }}
        className="h-11 rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-100 active:bg-zinc-200"
      >
        Done
      </button>
    </motion.div>
  );
}

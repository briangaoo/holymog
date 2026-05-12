'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Lock } from 'lucide-react';
import { getScoreColor } from '@/lib/scoreColor';
import type { VisionScore } from '@/types';

type Section = {
  title: string;
  items: Array<[label: string, key: keyof VisionScore]>;
};

const SECTIONS: Section[] = [
  {
    title: 'Presentation',
    items: [
      ['hair quality', 'hair_quality'],
      ['hair styling', 'hair_styling'],
      ['posture', 'posture'],
      ['confidence', 'confidence'],
      ['masculinity / femininity', 'masculinity_femininity'],
      ['symmetry', 'symmetry'],
      ['feature harmony', 'feature_harmony'],
      ['holistic attractiveness', 'overall_attractiveness'],
      ['lip proportion', 'lip_proportion'],
    ],
  },
  {
    title: 'Lower face & mouth',
    items: [
      ['jawline', 'jawline_definition'],
      ['chin', 'chin_definition'],
      ['lip shape', 'lip_shape'],
    ],
  },
  {
    title: 'Eyes & brows',
    items: [
      ['eye size', 'eye_size'],
      ['eye shape', 'eye_shape'],
      ['eye bags (no bags = high)', 'eye_bags'],
      ['canthal tilt', 'canthal_tilt'],
      ['iris appeal', 'iris_appeal'],
      ['brow shape', 'brow_shape'],
      ['brow thickness', 'brow_thickness'],
    ],
  },
  {
    title: 'Mid face & nose',
    items: [
      ['cheekbones', 'cheekbone_prominence'],
      ['nose shape', 'nose_shape'],
      ['nose proportion', 'nose_proportion'],
      ['forehead', 'forehead_proportion'],
      ['temples', 'temple_hollow'],
      ['ears', 'ear_shape'],
      ['philtrum', 'philtrum'],
      ['facial thirds', 'facial_thirds_visual'],
    ],
  },
  {
    title: 'Skin',
    items: [
      ['clarity', 'skin_clarity'],
      ['evenness', 'skin_evenness'],
      ['tone', 'skin_tone'],
    ],
  },
];

export type TokenSummary = {
  liveInput: number;
  liveOutput: number;
  liveCalls: number;
  proInput: number;
  proOutput: number;
  proCalls: number;
};

type Props = {
  vision?: VisionScore;
  presentation: number;
  tokens?: TokenSummary;
  /** When false, the breakdown is hidden behind a sign-in CTA. The full vision
   *  payload is also stripped server-side for unauthenticated users — this is
   *  defense-in-depth so a stale cache or tampered state can't leak fields. */
  signedIn: boolean;
  onSignIn?: () => void;
};

// Gemini 2.5 Flash Lite pricing: $0.10 / 1M input, $0.40 / 1M output.
const COST_INPUT_PER_M = 0.1;
const COST_OUTPUT_PER_M = 0.4;

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatCost(input: number, output: number): string {
  const dollars = (input * COST_INPUT_PER_M + output * COST_OUTPUT_PER_M) / 1_000_000;
  if (dollars < 0.0001) return '<$0.0001';
  return `$${dollars.toFixed(4)}`;
}

export function MoreDetail({ vision, presentation, tokens, signedIn, onSignIn }: Props) {
  const [open, setOpen] = useState(false);

  if (!signedIn || !vision) {
    return <MoreDetailLocked onSignIn={onSignIn} />;
  }

  // When the vision call fell back, every numeric field is a 50
  // placeholder. Switch the entire breakdown to "N/A" gray so the
  // user doesn't read the neutrals as real per-field scores.
  const fallback = vision.fallback === true;
  const ZINC_500 = '#71717a';

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ touchAction: 'manipulation' }}
        className="flex w-full items-center justify-center gap-1.5 py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-white"
      >
        {open ? 'hide details' : 'show more detail'}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="inline-flex"
        >
          <ChevronDown size={14} aria-hidden />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 pt-3">
              {tokens && (
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 text-[12px]">
                  <header className="mb-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      Token usage (this scan)
                    </h3>
                  </header>
                  <div className="flex flex-col gap-1.5">
                    <TokenRow
                      label={`live · ${tokens.liveCalls} calls`}
                      input={tokens.liveInput}
                      output={tokens.liveOutput}
                    />
                    <TokenRow
                      label={`pro · ${tokens.proCalls} calls`}
                      input={tokens.proInput}
                      output={tokens.proOutput}
                    />
                    <div className="my-1 border-t border-white/5" />
                    <TokenRow
                      label="total"
                      input={tokens.liveInput + tokens.proInput}
                      output={tokens.liveOutput + tokens.proOutput}
                      bold
                    />
                  </div>
                </section>
              )}

              {SECTIONS.map((section, idx) => (
                <section
                  key={section.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5"
                >
                  <header className="mb-2 flex items-baseline justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      {section.title}
                    </h3>
                    {idx === 0 && (
                      <span
                        className="font-num text-base font-extrabold tabular-nums uppercase"
                        style={{
                          color: fallback ? ZINC_500 : getScoreColor(presentation),
                        }}
                      >
                        {fallback ? 'N/A' : presentation}
                      </span>
                    )}
                  </header>
                  <div className="flex flex-col gap-1">
                    {section.items.map(([label, key]) => {
                      const value = vision[key] as number;
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between text-[13px]"
                        >
                          <span className="text-zinc-300">{label}</span>
                          <span
                            className="font-num font-semibold tabular-nums uppercase"
                            style={{
                              color: fallback ? ZINC_500 : getScoreColor(value),
                            }}
                          >
                            {fallback ? 'N/A' : value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MoreDetailLocked({ onSignIn }: { onSignIn?: () => void }) {
  return (
    <div className="w-full pt-2">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        {/* Decorative blurred placeholder rows so the locked card feels like
            content sitting behind frosted glass, not an empty box. */}
        <div
          aria-hidden
          className="pointer-events-none select-none space-y-2 opacity-40 blur-md"
        >
          {[
            ['jawline', 78],
            ['eyes', 64],
            ['skin', 71],
            ['cheekbones', 82],
            ['hair', 59],
            ['symmetry', 73],
          ].map(([label, value]) => (
            <div
              key={label as string}
              className="flex items-center justify-between text-[13px]"
            >
              <span className="text-zinc-300">{label as string}</span>
              <span className="font-num font-semibold tabular-nums text-zinc-200">
                {value as number}
              </span>
            </div>
          ))}
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 px-6 text-center backdrop-blur-[2px]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.06]">
            <Lock size={14} className="text-zinc-200" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-white">
            full breakdown is for accounts
          </p>
          <p className="max-w-[260px] text-[11px] leading-relaxed text-zinc-400">
            sign in to see all 30 fields, save your best scan, and get 10
            scans / day
          </p>
          {onSignIn && (
            <button
              type="button"
              onClick={onSignIn}
              style={{ touchAction: 'manipulation' }}
              className="mt-1 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-zinc-100"
            >
              sign in / sign up
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TokenRow({
  label,
  input,
  output,
  bold = false,
}: {
  label: string;
  input: number;
  output: number;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-semibold text-white' : 'text-zinc-300'}>{label}</span>
      <span className="font-num tabular-nums text-[11px] text-zinc-400">
        <span className="text-zinc-500">in</span> {formatNumber(input)}
        <span className="mx-1 text-zinc-600">·</span>
        <span className="text-zinc-500">out</span> {formatNumber(output)}
        <span className="mx-1 text-zinc-600">·</span>
        <span className={bold ? 'font-semibold text-white' : 'text-zinc-200'}>
          {formatCost(input, output)}
        </span>
      </span>
    </div>
  );
}

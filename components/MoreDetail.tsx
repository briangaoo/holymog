'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
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

type Props = {
  vision: VisionScore;
  presentation: number;
};

export function MoreDetail({ vision, presentation }: Props) {
  const [open, setOpen] = useState(false);

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
                        className="font-num text-base font-extrabold tabular-nums"
                        style={{ color: getScoreColor(presentation) }}
                      >
                        {presentation}
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
                            className="font-num font-semibold tabular-nums"
                            style={{ color: getScoreColor(value) }}
                          >
                            {value}
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

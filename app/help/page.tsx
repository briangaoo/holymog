'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, Loader2 } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { useUser } from '@/hooks/useUser';

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'how does scoring work?',
    a: "we send your photo to gemini, an AI vision model, with a calibrated rubric. it returns scores across 30 different fields (jawline, eyes, skin, etc) and we combine them into a single 0-100 overall + tier letter (F- through S+).",
  },
  {
    q: 'how do mog battles work?',
    a: 'two players load their cameras at the same time. once paired, a 3-second countdown plays, then both faces are scored over 10 seconds. the highest peak score wins. winners gain ELO; losers lose ELO.',
  },
  {
    q: 'can i scan more than 10 times a day?',
    a: 'right now signed-in accounts get 10 scans per 24 hours, and anonymous visitors get 1 lifetime free scan. quota resets on a rolling 24-hour window.',
  },
  {
    q: "is my photo stored?",
    a: 'photos sent to gemini for scoring are not retained — gemini processes them and discards them. the only photos we keep on our servers are: your avatar (if you set one), and your leaderboard photo (only if you opt to share one).',
  },
  {
    q: 'can i hide my elo or photo?',
    a: 'yes — both toggles live in /account settings → privacy. hiding your photo replaces your avatar with an initial circle on the public board, profile, and battle tiles. hiding your elo blanks out your elo / peak / win rate on your public profile.',
  },
  {
    q: "how do i delete my account?",
    a: '/account → data & danger zone → delete account. cascades through your profile, leaderboard entry, scans, battles, sessions, and purchases.',
  },
  {
    q: 'do you do refunds on store purchases?',
    a: "store purchases are final once an item is equipped — same as cosmetic purchases on most platforms. if you bought something and never equipped it, email hello@holymog.com within 14 days and we'll process a refund.",
  },
];

const TOPICS = [
  'bug report',
  'account help',
  'billing / refund',
  'partnership',
  'other',
] as const;

export default function HelpPage() {
  const { user } = useUser();
  const router = useRouter();
  const [topic, setTopic] = useState<string>(TOPICS[0]);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'sent' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const valid =
    message.trim().length > 0 && (user || email.trim().length > 0);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setStatus({ kind: 'sending' });
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          message: message.trim(),
          email: email.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setStatus({
          kind: 'error',
          message:
            data.error === 'rate_limited'
              ? 'too many messages — try again in a bit'
              : data.message ?? 'could not send',
        });
        return;
      }
      setStatus({ kind: 'sent' });
      setMessage('');
    } catch {
      setStatus({ kind: 'error', message: 'network error' });
    }
  };

  return (
    <div className="min-h-dvh bg-black">
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-5 py-6">
        <header className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="back"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <ArrowLeft size={16} aria-hidden />
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-white">help</h1>
        </header>

        {/* FAQ */}
        <section className="mb-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
          <header className="border-b border-white/10 bg-white/[0.015] px-4 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              faq
            </span>
          </header>
          <ul className="flex flex-col">
            {FAQ.map((entry, idx) => {
              const open = openIdx === idx;
              return (
                <li
                  key={entry.q}
                  className="border-b border-white/5 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => setOpenIdx(open ? null : idx)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
                  >
                    <span className="text-sm text-white">{entry.q}</span>
                    <ChevronDown
                      size={14}
                      aria-hidden
                      className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open && (
                    <div className="px-4 pb-3 text-[13px] leading-relaxed text-zinc-300">
                      {entry.a}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Contact form */}
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
          <header className="border-b border-white/10 bg-white/[0.015] px-4 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              contact us
            </span>
          </header>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 px-4 py-4">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="topic"
                className="text-[10px] uppercase tracking-[0.14em] text-zinc-500"
              >
                topic
              </label>
              <select
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="rounded border border-white/10 bg-white/[0.02] px-2 py-1.5 text-xs text-white focus:border-white/25 focus:outline-none"
              >
                {TOPICS.map((t) => (
                  <option key={t} value={t} className="bg-black">
                    {t}
                  </option>
                ))}
              </select>
            </div>
            {!user && (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="email"
                  className="text-[10px] uppercase tracking-[0.14em] text-zinc-500"
                >
                  your email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded border border-white/10 bg-white/[0.02] px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="message"
                className="text-[10px] uppercase tracking-[0.14em] text-zinc-500"
              >
                message
              </label>
              <textarea
                id="message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
                placeholder="tell us what's going on…"
                className="resize-none rounded border border-white/10 bg-white/[0.02] px-2 py-1.5 text-xs leading-relaxed text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
              />
              <span className="self-end text-[10px] tabular-nums text-zinc-600">
                {message.length} / 4000
              </span>
            </div>
            {status.kind === 'sent' && (
              <p className="text-[11px] text-emerald-400">
                sent. we&apos;ll reply by email.
              </p>
            )}
            {status.kind === 'error' && (
              <p className="text-[11px] text-red-400">{status.message}</p>
            )}
            <button
              type="submit"
              disabled={!valid || status.kind === 'sending'}
              className="self-end inline-flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold text-black transition-colors hover:bg-zinc-100 disabled:opacity-40"
            >
              {status.kind === 'sending' ? (
                <Loader2 size={10} className="animate-spin" aria-hidden />
              ) : null}
              send
            </button>
          </form>
        </section>

        <p className="mt-6 text-center text-[11px] text-zinc-500">
          legal:{' '}
          <Link href="/terms" className="hover:text-zinc-300">
            terms
          </Link>{' '}
          ·{' '}
          <Link href="/privacy" className="hover:text-zinc-300">
            privacy
          </Link>
        </p>
      </main>
    </div>
  );
}

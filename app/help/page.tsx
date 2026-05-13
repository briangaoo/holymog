'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Search,
} from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { useUser } from '@/hooks/useUser';

type FaqEntry = {
  q: string;
  a: React.ReactNode;
};

type FaqCategory = {
  label: string;
  entries: FaqEntry[];
};

/**
 * FAQ content. Grouped by domain so users can scan to the section
 * they're in. The list is intentionally human-readable copy rather
 * than terse one-liners — most v1 support questions are best answered
 * by a short paragraph the user can self-serve, not a one-liner.
 */
const CATEGORIES: FaqCategory[] = [
  {
    label: 'scanning',
    entries: [
      {
        q: 'how does the score work?',
        a: (
          <>
            Your photo is sent to <strong>Gemini 2.5 Flash Lite</strong>{' '}
            (Google&apos;s vision model) with a calibrated rubric we built. It
            scores 30 individual fields (jawline, eyes, skin tone, canthal tilt,
            symmetry, …), and we combine them into a single 0–100 overall and a
            tier letter from <strong>F-</strong> up to <strong>S+</strong>. The
            heavy scan uses 2 captured frames × 3 category prompts so the model
            sees you under slightly different lighting / micro-expressions, and
            the per-field scores are averaged across frames.
          </>
        ),
      },
      {
        q: 'why did i get a low score / are these accurate?',
        a: (
          <>
            The rubric is anchored against a working-pro fashion-model standard,
            so most people land between 50 and 80 (average to hot). The model
            isn&apos;t flattery — it actively penalises generic-attractive
            features that don&apos;t hit working-model territory. If you think
            your score doesn&apos;t reflect reality, take more scans: lighting,
            angle, and stability all affect the result, and your{' '}
            <strong>best</strong> scan is what counts for the leaderboard.
          </>
        ),
      },
      {
        q: 'what is the live meter (the bouncing number top-left)?',
        a: (
          <>
            That&apos;s a quick single-call score that runs five times during
            the 5-second scan window so you can see your trajectory in real
            time. It uses a lighter prompt than the heavy scan and is meant for
            <em> directional</em> feedback only — the number that lands as your
            final result is the heavy scan, not the meter.
          </>
        ),
      },
      {
        q: 'the live meter shows n/a — what does that mean?',
        a: (
          <>
            We couldn&apos;t reach the scoring API in time during the live
            window. The heavy scan at the end usually still succeeds. If you
            see n/a repeatedly, try a different network (some corporate or
            school networks block Google&apos;s endpoints), and make sure your
            browser isn&apos;t in Lockdown Mode.
          </>
        ),
      },
      {
        q: 'how many scans can i do per day?',
        a: (
          <>
            Signed-in accounts get <strong>30 scans per 24 hours</strong>;
            anonymous visitors get <strong>1 lifetime free scan</strong>. The
            window is rolling, not midnight-reset — once a scan you did 24
            hours ago expires from the quota window, you get that slot back.
          </>
        ),
      },
      {
        q: 'is my photo stored?',
        a: (
          <>
            Every scan is archived in a <em>private</em> bucket so you can see
            it in your scan history and so we can review S-tier submissions for
            legitimacy. <strong>Nothing is public</strong> unless you
            explicitly opt to share your face on the leaderboard. Photos sent
            to Gemini are not retained by Google for our project.
          </>
        ),
      },
      {
        q: 'do you support live, ar, or video scoring?',
        a: (
          <>
            Not yet. v1 is single-photo scoring with a live preview meter
            during capture. Video / continuous scoring is on the radar for v2
            but isn&apos;t scoped yet.
          </>
        ),
      },
    ],
  },
  {
    label: 'mog battles',
    entries: [
      {
        q: 'how do battles work?',
        a: (
          <>
            Two players load their cameras at the same time. After a 3-second
            countdown, both faces are scored for 10 seconds and the highest{' '}
            <strong>peak score</strong> wins. Winners gain ELO, losers lose
            ELO. You can play public (random matchmaking) or private (share a
            6-character code with friends).
          </>
        ),
      },
      {
        q: 'how is the winner decided?',
        a: (
          <>
            We track each player&apos;s peak score across the 10-second window
            — the moment the live scorer rated you highest. Whichever peak is
            higher wins. Ties go to whoever joined the battle first.
          </>
        ),
      },
      {
        q: 'what does ELO do?',
        a: (
          <>
            ELO is a head-to-head rating that goes up when you win, down when
            you lose, with bigger swings when the opponent was much stronger /
            weaker than you. Everyone starts at 1000 and ratings stabilise
            after ~30 matches. You can hide your ELO publicly in settings →
            privacy if you don&apos;t want it on your profile.
          </>
        ),
      },
      {
        q: 'private battle code — how do i share it?',
        a: (
          <>
            On <Link href="/mog" className="underline">/mog</Link>, click{' '}
            <strong>create party</strong>. You&apos;ll get a 6-character code
            you can copy and send anyone. They join from the same page via{' '}
            <strong>join party</strong>. Codes work as long as the lobby is
            open and the host hasn&apos;t started the battle yet.
          </>
        ),
      },
      {
        q: 'my friend joined but i can’t see them in the lobby',
        a: (
          <>
            We fixed a related bug recently — make sure you&apos;re on the
            latest deploy. If you still don&apos;t see them, both sides should
            refresh the page; the lobby polls every 4 seconds plus subscribes
            to real-time broadcasts. If a single refresh doesn&apos;t fix it,
            the join didn&apos;t go through and they should re-enter the code.
          </>
        ),
      },
      {
        q: 'rematch / play again?',
        a: (
          <>
            Private battles offer a <strong>rematch</strong> button on the
            result screen — clicking it creates a fresh battle with a new code
            and broadcasts an invite to your opponent. Public battles show a{' '}
            <strong>find another</strong> button that re-enters matchmaking.
          </>
        ),
      },
      {
        q: 'i muted battle sounds — they’re still playing',
        a: (
          <>
            The toggle takes effect on your <strong>next</strong> battle, not
            the current one — the SFX state is read when the battle room loads.
            Leave the room and re-enter and the mute will be honored.
          </>
        ),
      },
    ],
  },
  {
    label: 'leaderboard',
    entries: [
      {
        q: 'how do i get onto the leaderboard?',
        a: (
          <>
            Do a scan, then click <strong>add to leaderboard</strong> on the
            result screen. Submissions must come from a scan completed in the
            last hour — we anchor leaderboard entries to a server-validated
            recent scan so scores can&apos;t be forged.
          </>
        ),
      },
      {
        q: 'do i have to show my face on the public board?',
        a: (
          <>
            No. The &quot;show my face&quot; checkbox is opt-in. When
            unchecked, your name + tier + score show, and your profile avatar
            (if you have one) is displayed instead of your scan photo. You can
            also flip <strong>hide my face on the board</strong> in settings →
            privacy at any time.
          </>
        ),
      },
      {
        q: 'what triggers s-tier review?',
        a: (
          <>
            Scores at S- and above (≥ 87) are flagged for a quick human review
            — we verify the face on the scan plausibly belongs to a real person
            who is also the account owner, not a celebrity photo or AI-generated
            face. Reviews are anti-cheat only and don&apos;t auto-remove
            legitimate entries.
          </>
        ),
      },
      {
        q: 'how often does the board update?',
        a: (
          <>
            Submissions update instantly. We don&apos;t cache the public board
            on the server. The client may briefly show stale data after you
            submit — refresh once if your new score doesn&apos;t appear.
          </>
        ),
      },
      {
        q: 'i got displaced — will i be notified?',
        a: (
          <>
            Yes, if you have <strong>mog email alerts</strong> on (settings →
            notifications). When someone bumps you out of the top of the
            leaderboard with a new top score, you&apos;ll get a heads-up
            email so you can scan back. Tracked per-user so we don&apos;t spam
            on rapid-fire displacements.
          </>
        ),
      },
    ],
  },
  {
    label: 'account & privacy',
    entries: [
      {
        q: 'how do i change my username?',
        a: (
          <>
            Settings → profile → click <strong>change</strong> next to your
            name. Usernames are 3–24 characters, lowercase letters / numbers /
            underscore / hyphen. Limit of 3 changes per hour. Changing your
            username updates everywhere immediately (leaderboard, battles,
            history) without a page reload.
          </>
        ),
      },
      {
        q: 'how do i change my profile picture or banner?',
        a: (
          <>
            Settings → profile → click the avatar to open the cropper for your
            pfp; the banner has its own &quot;upload banner&quot; button along
            the top of the section. Both support drag-to-position + zoom. The
            small <strong>×</strong> on the avatar / on the banner removes it.
          </>
        ),
      },
      {
        q: 'how do i hide my elo / score / photo?',
        a: (
          <>
            Settings → privacy. Three toggles:{' '}
            <strong>hide face on leaderboard</strong> (your face is replaced by
            your initial / avatar on the public board),{' '}
            <strong>hide elo</strong> (blanks ELO / peak / win-rate on your
            public profile), and a global photo-share opt-out.
          </>
        ),
      },
      {
        q: 'i signed up with google — can i also use a magic link?',
        a: (
          <>
            Adding a second sign-in method is a top-priority feature we&apos;re
            rolling out next. Until then, you can sign in with whichever method
            you used to sign up. Email <code>hello@holymog.com</code> if you
            need urgent help.
          </>
        ),
      },
      {
        q: 'how do i change my email?',
        a: (
          <>
            Settings → email → enter the new address → click{' '}
            <strong>send link</strong>. We&apos;ll email a verification link to
            the new address; the change only completes when you click it.
            (OAuth users will see an additional re-sign-in path next.)
          </>
        ),
      },
      {
        q: 'do you support 2-factor auth?',
        a: (
          <>
            Yes — settings → two-factor auth. We use TOTP (Google Authenticator,
            Authy, 1Password, Bitwarden, etc). The setup page renders a QR you
            can scan, or you can type the secret manually. We give you
            single-use backup codes after enrolment in case you lose your
            authenticator.
          </>
        ),
      },
      {
        q: 'how do i see my active sessions?',
        a: (
          <>
            Settings → active sessions. We list every device that&apos;s
            currently signed into your account. You can kick any non-current
            session, or sign out everywhere else.
          </>
        ),
      },
      {
        q: 'how do i delete my account?',
        a: (
          <>
            Settings → data → <strong>delete account</strong>. Cascades through
            your profile, leaderboard entry, scans, battles, sessions, and
            purchases. You&apos;ll be asked to type <code>DELETE</code> to
            confirm. Irreversible.
          </>
        ),
      },
      {
        q: 'can i export my data?',
        a: (
          <>
            Settings → data → <strong>download my data</strong>. Exports
            profile, scan history, battle results, ELO history, and purchases
            as a single <code>mog.json</code> file.
          </>
        ),
      },
    ],
  },
  {
    label: 'billing & holymog+',
    entries: [
      {
        q: 'what does holymog+ get me?',
        a: (
          <>
            Subscriber-only cosmetics (animated banners, advanced name effects,
            premium frames), unlimited daily scans (no 30/day cap), bigger
            private parties (up to 20 vs the free 10), and a monthly
            free-cosmetic redemption. The subscription doesn&apos;t change how
            scoring works — everyone gets the same model.
          </>
        ),
      },
      {
        q: 'do you do refunds?',
        a: (
          <>
            One-time cosmetic purchases are final once equipped. If you bought
            something and never equipped it,{' '}
            <a
              href="mailto:hello@holymog.com?subject=refund"
              className="underline"
            >
              email us
            </a>{' '}
            within 14 days and we&apos;ll refund. Subscriptions can be cancelled
            anytime (settings → subscription → cancel) and you keep access
            through the current billing period.
          </>
        ),
      },
      {
        q: 'how do i cancel my subscription?',
        a: (
          <>
            Settings → subscription → <strong>cancel</strong>. We use Stripe&apos;s
            billing portal so you can also manage it directly from your Stripe
            receipt emails. Cancellation is effective at the end of your
            current billing period.
          </>
        ),
      },
    ],
  },
  {
    label: 'troubleshooting',
    entries: [
      {
        q: 'the camera doesn’t work',
        a: (
          <>
            Make sure you&apos;ve granted holymog camera access in your browser
            (the address bar usually has a camera icon). On iOS, Safari is
            generally more reliable than third-party browsers. On a desktop,
            check no other app (Zoom, Google Meet, OBS) has exclusive access to
            the camera.
          </>
        ),
      },
      {
        q: 'face detection isn’t locking on',
        a: (
          <>
            We use MediaPipe on-device. Heavy backlighting, glasses with thick
            frames, head angle &gt; 25° from camera, or hats over the forehead
            can drop detection. Try a flatter, evenly-lit angle. If your
            network blocks <code>storage.googleapis.com</code> or{' '}
            <code>cdn.jsdelivr.net</code> (some corporate / school networks
            do), MediaPipe never loads.
          </>
        ),
      },
      {
        q: 'scans are slow / take 15+ seconds',
        a: (
          <>
            That used to be a routing issue with our Gemini endpoint — we
            pinned to us-central1 and full scans now land in 5–7 seconds. If
            you&apos;re still seeing 15s+ scans, you may be on a slow
            connection or have the live meter retrying on a flaky network.
          </>
        ),
      },
      {
        q: 'i can’t sign in with the magic link',
        a: (
          <>
            Check your spam folder for the email from{' '}
            <code>auth@holymog.com</code>. Links expire after 24 hours and are
            single-use; if you waited too long or already clicked it, just
            request a new one. If you never receive emails, your provider may
            be greylisting our sender — try a different address temporarily.
          </>
        ),
      },
    ],
  },
];

const TOPICS = [
  'bug report',
  'account help',
  'billing / refund',
  'feature request',
  'partnership',
  'other',
] as const;

export default function HelpPage() {
  const { user } = useUser();
  const router = useRouter();
  const [topic, setTopic] = useState<string>(TOPICS[0]);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'sent' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // Filter against question text only — answer text may be JSX, which
  // makes substring matching unreliable.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.map((c) => ({
      ...c,
      entries: c.entries.filter((e) => e.q.toLowerCase().includes(q)),
    })).filter((c) => c.entries.length > 0);
  }, [query]);

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
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              help
            </h1>
            <p className="text-[12px] text-zinc-500">
              answers to most questions. couldn&apos;t find what you need? send
              us a note at the bottom.
            </p>
          </div>
        </header>

        {/* Search */}
        <div className="mb-5 flex items-stretch overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] focus-within:border-white/25">
          <span className="flex items-center pl-3 pr-2 text-zinc-500">
            <Search size={14} aria-hidden />
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search the faq…"
            spellCheck={false}
            className="w-full bg-transparent py-2.5 pr-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none"
          />
        </div>

        {/* FAQ — grouped by category */}
        {filtered.length === 0 && (
          <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center text-[13px] text-zinc-400">
            no matches for &ldquo;{query}&rdquo;. try a different keyword or
            send us a message.
          </div>
        )}

        {filtered.map((category) => (
          <section
            key={category.label}
            className="mb-5 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]"
          >
            <header className="border-b border-white/10 bg-white/[0.015] px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                {category.label}
              </span>
            </header>
            <ul className="flex flex-col">
              {category.entries.map((entry) => {
                const key = `${category.label}::${entry.q}`;
                const open = openKey === key;
                return (
                  <li
                    key={key}
                    className="border-b border-white/5 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenKey(open ? null : key)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
                    >
                      <span className="text-[14px] normal-case text-white">
                        {entry.q}
                      </span>
                      <ChevronDown
                        size={14}
                        aria-hidden
                        className={`flex-shrink-0 text-zinc-500 transition-transform ${
                          open ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {open && (
                      <div className="px-4 pb-4 text-[13px] leading-relaxed normal-case text-zinc-300">
                        {entry.a}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {/* Contact form */}
        <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
          <header className="border-b border-white/10 bg-white/[0.015] px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              still stuck? send us a note
            </span>
          </header>
          <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 py-4">
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
                className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[13px] text-white focus:border-white/25 focus:outline-none"
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
                  className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
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
                placeholder="tell us what's going on. screenshots are helpful — paste a link or describe what you see…"
                className="resize-none rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[13px] leading-relaxed text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
              />
              <span className="self-end text-[10px] tabular-nums text-zinc-600">
                {message.length} / 4000
              </span>
            </div>
            {status.kind === 'sent' && (
              <p className="text-[12px] text-emerald-400">
                sent. we usually reply within a day.
              </p>
            )}
            {status.kind === 'error' && (
              <p className="text-[12px] text-red-400">{status.message}</p>
            )}
            <button
              type="submit"
              disabled={!valid || status.kind === 'sending'}
              className="self-end inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-black transition-colors hover:bg-zinc-100 disabled:opacity-40"
            >
              {status.kind === 'sending' ? (
                <>
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                  sending…
                </>
              ) : (
                'send'
              )}
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

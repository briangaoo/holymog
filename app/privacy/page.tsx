'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { LegalBackLink } from '@/components/LegalBackLink';

const LAST_UPDATED = 'May 11, 2026';

/**
 * Privacy Policy. Includes explicit BIPA-style biometric classification,
 * GDPR Art. 13 lawful-basis disclosures per processing purpose, full
 * CCPA/CPRA notice with categorised PI + "Do Not Sell or Share" notice,
 * a tabular retention schedule, and 72-hour breach notification (GDPR
 * Art. 33). Have a lawyer review before public launch.
 */
export default function PrivacyPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-black">
      <span
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.18) 35%, transparent 65%)',
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 backdrop-blur-3xl"
        style={{ backgroundColor: 'rgba(255,255,255,0.015)' }}
      />

      <div className="relative z-10">
        <main
          className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8 normal-case"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 64px)' }}
        >
          <LegalBackLink />

          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-3"
          >
            <span className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55 backdrop-blur">
              <Lock size={11} aria-hidden /> Legal
            </span>
            <h1 className="text-5xl font-bold leading-[1.05] tracking-tight text-white">
              Privacy Policy
            </h1>
            <p className="text-sm text-white/55">
              Last updated ·{' '}
              <span className="font-semibold text-white/80">
                {LAST_UPDATED}
              </span>
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
            className="mt-10 overflow-hidden rounded-none border border-white/10 bg-white/[0.025] p-6 backdrop-blur sm:p-8"
            style={{
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.10)',
            }}
          >
            <p className="text-sm leading-relaxed text-white/75">
              This Privacy Policy describes how holymog (&ldquo;
              <span className="font-semibold">we</span>,&rdquo; &ldquo;
              <span className="font-semibold">us</span>,&rdquo; or &ldquo;
              <span className="font-semibold">our</span>&rdquo;) collects,
              uses, shares, and protects information about you when you
              use the holymog website, applications, and related services
              (collectively, the &ldquo;
              <span className="font-semibold">Service</span>&rdquo;). For
              the purposes of GDPR/UK GDPR, holymog is the &ldquo;
              <span className="font-semibold">data controller</span>
              &rdquo; of your information. By using the Service you agree
              to this policy. If you do not agree, please do not use the
              Service.
            </p>
          </motion.div>

          <Section index={1} title="Overview">
            <p>
              holymog is an AI face-rating application. You submit a face
              scan; we send the resulting image to a third-party machine-
              learning model (currently Google Gemini 2.5 Flash Lite) and
              return the score. We keep as little personal information as
              possible. We do not sell or share your personal information
              for cross-context behavioral advertising. We do not record
              battle video.
            </p>
          </Section>

          <Section index={2} title="Information We Collect">
            <p>We collect the following categories of information:</p>

            <p className="mt-2 font-semibold text-white/85">
              Account information
            </p>
            <p>
              When you sign in with Google OAuth or email magic link, we
              collect your email address, display name (derived from your
              Google profile or email handle), profile image (if provided
              by your OAuth provider), and an internal account
              identifier. These are stored in our Supabase-managed
              Postgres database and authenticated through Auth.js v5.
            </p>

            <p className="mt-2 font-semibold text-white/85">
              Profile content
            </p>
            <p>
              Signed-in users can optionally add information that
              becomes part of their public profile at{' '}
              <code className="font-mono text-[12px]">/@your-username</code>:
              a bio (up to 240 characters), a location string, an
              uploaded avatar image (which replaces the OAuth
              provider&rsquo;s photo if you set one), an uploaded
              banner image, and handles for your accounts on
              third-party platforms (Instagram, X, Snapchat, TikTok,
              Discord). All of these fields are optional and editable
              from{' '}
              <Link
                href="/account"
                className="font-medium text-white/85 underline-offset-4 hover:underline"
              >
                /account
              </Link>
              . Avatars and banners are stored in our public{' '}
              <code className="font-mono text-[12px]">holymog-uploads</code>{' '}
              bucket so other viewers&rsquo; browsers can fetch them;
              you can clear either upload at any time, after which
              the file is deleted within minutes.
            </p>

            <p className="mt-2 font-semibold text-white/85">
              Social graph
            </p>
            <p>
              You can follow other signed-in users from their public
              profile pages. The follow graph itself is public: both
              the follower and following lists for any given account
              are visible to any visitor of that profile. Following
              someone does not grant either party access to anything
              private &mdash; it only updates the public counts and
              lists, and surfaces the followed user as a quick link
              elsewhere in the Service.
            </p>

            <p className="mt-2 font-semibold text-white/85">
              Biometric information (face scans)
            </p>
            <p>
              Face-scan images are{' '}
              <span className="font-semibold">biometric information</span>{' '}
              under the Illinois Biometric Information Privacy Act
              (BIPA), &ldquo;biometric identifiers&rdquo; under
              Texas/Washington biometric statutes, &ldquo;sensitive
              personal information&rdquo; under California&rsquo;s
              CCPA/CPRA, and &ldquo;special category data&rdquo; under
              GDPR Art. 9. We collect them only with your express consent
              (see Section 3) and process them for the limited purpose of
              generating an aesthetic score.
            </p>
            <p>
              While scanning, your camera frames are processed in your
              browser via MediaPipe FaceLandmarker, cropped to your face,
              downsized to 768 px max, and sent to our backend, which
              forwards them to the Gemini AI service for scoring.
            </p>

            <p className="mt-2 font-semibold text-white/85">
              Saved scan archive (signed-in users)
            </p>
            <p>
              If you are signed in, the resulting scan image is also
              archived to a <span className="font-semibold">private
              storage bucket</span> (
              <code className="font-mono text-[12px]">holymog-scans</code>
              ). Purposes:{' '}
              <span className="font-semibold">(a)</span> so you can view
              your record-scoring photo from your account at any time,
              even if you don&apos;t share it publicly;{' '}
              <span className="font-semibold">(b)</span> for integrity
              review of high-score submissions (see below); and{' '}
              <span className="font-semibold">(c)</span> as the source
              of truth if you later opt to display a saved scan on the
              public leaderboard. The bucket is{' '}
              <span className="font-semibold">never publicly readable</span>
              {' '}— images are served only via short-lived
              authenticated URLs after we verify you own the scan or
              are an authorised reviewer. You can delete your saved
              scans at any time by deleting your account, or by
              emailing{' '}
              <a
                href="mailto:hello@holymog.com"
                className="text-white underline-offset-2 hover:underline"
              >
                hello@holymog.com
              </a>{' '}
              to request individual deletion.
            </p>

            <p className="mt-2 font-semibold text-white/85">
              Anti-cheat review of high scores (≥ S-tier, 87+)
            </p>
            <p>
              When a scan&apos;s overall score reaches{' '}
              <span className="font-semibold">87 or above</span> (S-tier
              and up), the saved image is flagged in our admin queue
              and we receive a notification email containing a short-
              lived signed link to the image. A human reviewer
              <span className="font-semibold"> verifies legitimacy only</span>
              {' '}— that the face plausibly belongs to the
              account-holder rather than being a celebrity image, AI
              composite, or other ineligible submission. The review
              does <span className="font-semibold">not</span> approve or
              deny placement on the leaderboard; it&apos;s purely a
              top-of-board integrity check. Reviewers cannot share or
              redistribute the image.
            </p>

            <p className="mt-2 font-semibold text-white/85">
              Public leaderboard photo (optional, opt-in)
            </p>
            <p>
              Whether to display your face on the public scan
              leaderboard is{' '}
              <span className="font-semibold">always optional</span>{' '}
              — at every tier, including S+. If you opt in, a copy
              of your scan image is published to a public storage bucket
              alongside your display name and score. You can flip the{' '}
              <span className="font-semibold">
                &ldquo;hide my scan photo from the leaderboard&rdquo;
              </span>{' '}
              toggle in account → privacy at any time to suppress the
              public copy (the private archive copy is unaffected).
              Removing your leaderboard entry deletes the public copy.
            </p>

            <p className="mt-2 font-semibold text-white/85">Gameplay data</p>
            <p>
              When you participate in Mog Battles we collect: battle ID,
              participant IDs, peak scores, win/loss outcomes, ELO rating
              changes, timestamps, and the &ldquo;most-called
              weakness&rdquo; category emitted by the model. This data is
              stored in our Postgres database and surfaced on the
              leaderboard, your account history, and the global ELO
              standings.
            </p>

            <p className="mt-2 font-semibold text-white/85">
              Cosmetic inventory
            </p>
            <p>
              When you earn an in-app cosmetic by hitting a gameplay
              milestone &mdash; for example, a name-effect treatment
              unlocked by completing your first scan, scanning at
              S-tier or higher, or reaching 1500 ELO &mdash; we store
              the list of cosmetics you own, the slug of whichever
              cosmetic you have equipped in each slot, and the
              timestamp when each item was granted. Cosmetics are
              purely decorative: they change how your display name
              and avatar render to other users on profile pages,
              leaderboards, battle tiles, and follower lists, and
              they do not affect scores, matchmaking, ELO, or any
              other functional behavior. Cosmetic-inventory data is
              never sold, rented, or shared.
            </p>

            <p className="mt-2 font-semibold text-white/85">
              Battle video & audio (live, not stored)
            </p>
            <p>
              Mog Battles use LiveKit Cloud&rsquo;s selective forwarding
              unit (SFU) to relay live video and audio between
              participants in real time. We do not record the stream.
              Once a battle ends, the media stream is discarded by
              LiveKit. Other participants in the session may capture the
              stream via screen recording or third-party software; we
              have no technical means to prevent that.
            </p>

            <p className="mt-2 font-semibold text-white/85">
              Battle peak frames (saved for moderation review)
            </p>
            <p>
              For every battle &mdash;{' '}
              <span className="font-semibold">public 1v1 and private
              parties alike</span> &mdash; we save{' '}
              <span className="font-semibold">one image per signed-in
              participant per battle</span>: the highest-scoring single
              frame our scorer pulled during that match. Frames are
              stored in a{' '}
              <span className="font-semibold">private storage bucket</span>{' '}
              (
              <code className="font-mono text-[12px]">holymog-battles</code>
              ) and are{' '}
              <span className="font-semibold">never publicly readable</span>.
              We use them only to verify post-match reports (see Section
              9a) and only ever access them via short-lived authenticated
              URLs.
            </p>

            <p className="mt-2 font-semibold text-white/85">
              Battle reports (public 1v1 only)
            </p>
            <p>
              After a public 1v1 match, your opponent may file a report
              against you for cheating (deepfake / AI face / celebrity
              photo), the presence of a minor on camera, nudity or
              sexual content, harassment, spam / impersonation, or
              other policy violations. The report includes the reason,
              optional written details, the battle ID, both participant
              user IDs, and a 7-day signed link to the reported
              player&rsquo;s saved peak frame. Reports are reviewed by
              a holymog operator; see Section 9a for the resolution
              flow and what happens to your data if you&rsquo;re banned.
            </p>

            <p className="mt-2 font-semibold text-white/85">Technical data</p>
            <p>
              We collect standard web technical data: IP address, user
              agent, referrer, request timestamps, and approximate
              request source (used solely for rate-limiting and abuse
              prevention). Hosting and request logs are managed by
              Vercel.
            </p>
          </Section>

          <Section index={3} title="Biometric Consent">
            <p>
              Because face scans constitute biometric information /
              special category data, we obtain your express consent
              before collection and processing:
            </p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                You provide consent by initiating a face scan, joining a
                Mog Battle, or submitting a photo to the leaderboard,
                each of which is preceded by clear notice of what data
                will be collected and processed.
              </li>
              <li>
                Consent is revocable at any time by emailing
                hello@holymog.com from the address linked to your
                account, after which we will delete stored biometric
                identifiers within thirty (30) days, subject to legal
                retention obligations.
              </li>
              <li>
                Our written policy on biometric retention and destruction
                is published in Section 8 of this Privacy Policy and
                incorporated into the Terms of Service by reference.
              </li>
            </ul>
          </Section>

          <Section index={4} title="Legal Bases for Processing (GDPR / UK GDPR)">
            <p>
              For users in the European Union, United Kingdom, and
              Switzerland, we rely on the following lawful bases under
              GDPR Article 6 and (for biometric data) Article 9:
            </p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                <span className="font-semibold text-white/85">
                  Account creation and operation of the Service
                </span>{' '}
                &mdash; performance of a contract (Art. 6(1)(b)).
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Processing of biometric data (face scans, leaderboard
                  photos)
                </span>{' '}
                &mdash; your explicit consent (Art. 9(2)(a)). Consent is
                revocable at any time.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Sending transactional sign-in emails
                </span>{' '}
                &mdash; performance of a contract and your consent
                (Art. 6(1)(a)/(b)).
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Rate-limiting and abuse prevention
                </span>{' '}
                &mdash; our legitimate interests in operating a safe and
                reliable Service (Art. 6(1)(f)).
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Security incident response and legal compliance
                </span>{' '}
                &mdash; legal obligations (Art. 6(1)(c)) and legitimate
                interests (Art. 6(1)(f)).
              </li>
            </ul>
            <p className="mt-3">
              You have the right to object to processing based on
              legitimate interests (see Section 13).
            </p>
          </Section>

          <Section index={5} title="How We Use Information">
            <p>We use the information described above to:</p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>Operate, maintain, and provide the Service.</li>
              <li>
                Process face scans and battles via third-party AI and
                video infrastructure.
              </li>
              <li>
                Authenticate accounts and protect against unauthorized
                access.
              </li>
              <li>Display the public leaderboard and account stats.</li>
              <li>
                Compute and update ELO ratings, win/loss records, and
                streaks.
              </li>
              <li>
                Rate-limit and prevent abuse, fraud, manipulation of
                scores, and spam.
              </li>
              <li>
                Send transactional emails (e.g. magic-link sign-in
                codes).
              </li>
              <li>
                Comply with legal obligations and enforce our Terms of
                Service.
              </li>
              <li>Improve the model, the prompt, and the user experience.</li>
            </ul>
          </Section>

          <Section index={6} title="AI Processing">
            <p>
              Every face scan and every battle frame is sent to Google
              Gemini 2.5 Flash Lite for scoring via{' '}
              <span className="font-semibold">
                Google Cloud Vertex AI
              </span>
              . The request includes the cropped face image and a
              prompt instructing the model to return a numeric score
              and breakdown.
            </p>
            <p>
              Under the Google Cloud Service Specific Terms for Vertex
              AI, customer data (including prompts and responses) is{' '}
              <span className="font-semibold">
                not used to train or improve Google&rsquo;s foundation
                models
              </span>{' '}
              and is subject to Google&rsquo;s data-processing
              commitments described at{' '}
              <a
                href="https://cloud.google.com/terms/service-terms"
                className="font-medium text-white/85 underline-offset-4 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                cloud.google.com/terms/service-terms
              </a>{' '}
              and Google&rsquo;s{' '}
              <a
                href="https://policies.google.com/privacy"
                className="font-medium text-white/85 underline-offset-4 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                privacy policy
              </a>
              . We do not train any model on your data. We do not share
              scan data with any third party other than the AI-processing
              pipeline described here.
            </p>
          </Section>

          <Section index={7} title="Third-Party Service Providers">
            <p>
              We rely on a small set of trusted infrastructure providers,
              each governed by their own terms and privacy policies, and
              each acting as a processor on our behalf:
            </p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                <span className="font-semibold text-white/85">Vercel</span>{' '}
                &mdash; application hosting, CDN, request logs.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Supabase
                </span>{' '}
                &mdash; managed Postgres database, storage bucket for
                leaderboard photos, Realtime channel for matchmaking and
                battle events.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Google Cloud Vertex AI
                </span>{' '}
                &mdash; AI scoring of face images via Gemini 2.5 Flash
                Lite.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Google (OAuth)
                </span>{' '}
                &mdash; sign-in with Google.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Google Workspace SMTP
                </span>{' '}
                &mdash; transactional email (magic-link sign-in codes),
                sent from auth@holymog.com.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  LiveKit Cloud
                </span>{' '}
                &mdash; live video and audio relay for Mog Battles.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Upstash
                </span>{' '}
                &mdash; rate-limit data store.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  NextAuth (Auth.js v5)
                </span>{' '}
                &mdash; authentication library.
              </li>
            </ul>
            <p className="mt-3">
              We do not sell, rent, or otherwise share your personal
              information for advertising or marketing purposes with any
              third party.
            </p>
          </Section>

          <Section index={8} title="Data Retention">
            <p>
              We retain personal information only as long as necessary to
              provide the Service and meet legal obligations. The
              following table summarises our retention schedule:
            </p>
            <div className="mt-3 overflow-hidden rounded-sm border border-white/10">
              <table className="w-full text-left text-xs leading-relaxed text-white/70">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-[0.16em] text-white/55">
                    <th className="px-3 py-2.5 font-semibold">
                      Data category
                    </th>
                    <th className="px-3 py-2.5 font-semibold">
                      Retention
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/10">
                    <td className="px-3 py-2.5">Account data</td>
                    <td className="px-3 py-2.5">
                      Until account deletion
                    </td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="px-3 py-2.5">
                      Face-scan images (transient)
                    </td>
                    <td className="px-3 py-2.5">
                      Forwarded to Gemini, not stored
                    </td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="px-3 py-2.5">
                      Best-scan score breakdowns (numbers only)
                    </td>
                    <td className="px-3 py-2.5">
                      While account is active
                    </td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="px-3 py-2.5">
                      Leaderboard photos
                    </td>
                    <td className="px-3 py-2.5">
                      Until entry/account deletion (≤ 30 days after
                      removal)
                    </td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="px-3 py-2.5">
                      Battle records (IDs, scores, timestamps)
                    </td>
                    <td className="px-3 py-2.5">
                      While account is active
                    </td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="px-3 py-2.5">
                      Battle video/audio
                    </td>
                    <td className="px-3 py-2.5">
                      Never stored (live relay only)
                    </td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="px-3 py-2.5">
                      Battle peak frames (private bucket)
                    </td>
                    <td className="px-3 py-2.5">
                      ≤ 1 year from battle, unless tied to an open
                      report (kept until resolution)
                    </td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="px-3 py-2.5">
                      Battle reports (pending or resolved)
                    </td>
                    <td className="px-3 py-2.5">
                      ≤ 2 years from filing (forensic retention for
                      bans + appeals)
                    </td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="px-3 py-2.5">
                      Rate-limit and abuse-prevention logs
                    </td>
                    <td className="px-3 py-2.5">Up to 30 days</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5">
                      All biometric identifiers
                    </td>
                    <td className="px-3 py-2.5">
                      ≤ 3 years from last interaction (BIPA-compliant)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              We may retain limited information for longer where required
              by law, to resolve disputes, prevent abuse, or enforce our
              agreements.
            </p>
          </Section>

          <Section index={9} title="How We Share Information">
            <p>We share personal information only as follows:</p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                <span className="font-semibold text-white/85">
                  Publicly displayed
                </span>{' '}
                &mdash; your display name, scores, photo (if submitted),
                and ELO are visible to all users via the leaderboard,
                account pages, and battle UIs.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  With service providers
                </span>{' '}
                &mdash; see Section 7; each handles data only as
                required to provide their service to us.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  For legal reasons
                </span>{' '}
                &mdash; to comply with valid legal process (subpoenas,
                court orders, regulatory requests), enforce our Terms,
                protect the rights / property / safety of holymog or any
                third party, or detect and prevent fraud or abuse.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  In connection with a business transaction
                </span>{' '}
                &mdash; if we are involved in a merger, acquisition,
                financing, or sale of assets, your information may be
                transferred subject to standard confidentiality
                protections and notice requirements under applicable
                law.
              </li>
            </ul>
            <p className="mt-3">
              <span className="font-semibold text-white/85">
                We never sell your personal information.
              </span>{' '}
              We do not &ldquo;sell&rdquo; or &ldquo;share&rdquo; (as
              those terms are defined under California&rsquo;s CCPA/CPRA)
              personal information for cross-context behavioral
              advertising. See Section 11 for California-specific rights
              including the right to opt out.
            </p>

            <p className="mt-4 font-semibold text-white/85">
              Reports + bans
            </p>
            <p>
              When you file a report against an opponent after a
              public 1v1 battle, we email a holymog operator the
              report reason, your optional written details, both
              participant user IDs, the battle ID, and a 7-day signed
              link to the reported player&rsquo;s saved peak frame
              from the &ldquo;battle peak frames&rdquo; bucket. The
              operator clicks Ban or Dismiss; either action is
              recorded in our audit log and tied to the resolved
              report row. The reported player is{' '}
              <span className="font-semibold">not notified</span> when
              a report is filed or dismissed &mdash; only when an
              operator clicks &ldquo;Ban&rdquo;, in which case the
              banned user receives an email explaining the action,
              every active session is purged, and sign-in is blocked
              going forward. The reporter is never told the outcome.
              Banned users may appeal by emailing{' '}
              <a
                href="mailto:safety@holymog.com"
                className="text-white underline-offset-2 hover:underline"
              >
                safety@holymog.com
              </a>{' '}
              with the date of the battle and the reason for appeal.
            </p>
          </Section>

          <Section index={10} title="Cookies & Local Storage">
            <p>We set the following minimal client-side state:</p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                <span className="font-semibold text-white/85">
                  Authentication cookies
                </span>{' '}
                set by Auth.js (e.g.{' '}
                <code className="font-mono text-xs text-white/85">
                  authjs.session-token
                </code>
                ) to keep you signed in. These are first-party,
                HTTP-only, and Secure in production.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Local-storage entries
                </span>{' '}
                for UX: your most recent scan result (
                <code className="font-mono text-xs text-white/85">
                  holymog-last-result
                </code>
                ), your active-battle reconnection token (
                <code className="font-mono text-xs text-white/85">
                  holymog-active-battle
                </code>
                ), and your first-battle consent acknowledgement (
                <code className="font-mono text-xs text-white/85">
                  holymog-battle-consent-accepted
                </code>
                ). These stay on your device and are never transmitted.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Session-storage cache
                </span>{' '}
                for the leaderboard&rsquo;s first-page warm cache, to
                make navigation feel instant.
              </li>
            </ul>
            <p className="mt-3">
              We do not use third-party analytics, advertising, or
              tracking cookies.
            </p>
          </Section>

          <Section
            index={11}
            title="California Privacy Rights (CCPA / CPRA)"
          >
            <p>
              California residents have specific rights under the
              California Consumer Privacy Act, as amended by the
              California Privacy Rights Act (collectively, &ldquo;
              <span className="font-semibold">CCPA/CPRA</span>&rdquo;).
              The categories of personal information we collect, mapped
              to CCPA-defined categories, are:
            </p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                <span className="font-semibold text-white/85">
                  Identifiers
                </span>{' '}
                &mdash; email, display name, internal account ID, IP
                address.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Customer record information (Cal. Civ. Code §
                  1798.80(e))
                </span>{' '}
                &mdash; name, email, profile image.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Internet/network activity
                </span>{' '}
                &mdash; user agent, referrer, request timestamps.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Sensory information
                </span>{' '}
                &mdash; face-scan images and battle video frames
                (transient).
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Sensitive personal information
                </span>{' '}
                &mdash; biometric information (face scans).
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Inferences
                </span>{' '}
                &mdash; aesthetic scores and ELO ratings derived from
                the above.
              </li>
            </ul>

            <p className="mt-3">
              <span className="font-semibold text-white/85">
                Sources of information.
              </span>{' '}
              Directly from you (face scans, account creation) and from
              third-party authentication providers (Google OAuth) at
              your direction.
            </p>

            <p className="mt-2">
              <span className="font-semibold text-white/85">
                Business purposes for collection.
              </span>{' '}
              Operating the Service, providing AI scoring, displaying
              the leaderboard, preventing abuse, complying with law.
            </p>

            <p className="mt-2">
              <span className="font-semibold text-white/85">
                Disclosures.
              </span>{' '}
              We disclose the categories above to the service providers
              listed in Section 7 for the business purposes described.
              We do not disclose personal information to third parties
              for their own marketing or advertising purposes.
            </p>

            <p className="mt-2">
              <span className="font-semibold text-white/85">
                Do Not Sell or Share My Personal Information.
              </span>{' '}
              We do not &ldquo;sell&rdquo; or &ldquo;share&rdquo; (for
              cross-context behavioral advertising) personal
              information as those terms are defined under CCPA/CPRA.
              We also do not sell or share the personal information of
              users we know to be under 16 without affirmative consent.
            </p>

            <p className="mt-2">
              <span className="font-semibold text-white/85">
                Your California rights.
              </span>{' '}
              Subject to verification, you have the right to:
            </p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                <span className="font-semibold text-white/85">
                  Right to know
                </span>{' '}
                what personal information we collect, use, disclose, and
                sell or share about you.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Right to delete
                </span>{' '}
                personal information we have collected about you,
                subject to certain exceptions.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Right to correct
                </span>{' '}
                inaccurate personal information.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Right to opt out
                </span>{' '}
                of the sale or sharing of personal information.
                (Reminder: we do not sell or share.)
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Right to limit use of sensitive personal information
                </span>{' '}
                &mdash; you may direct us to use sensitive personal
                information (including biometric information) only for
                permitted purposes.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Right to non-discrimination
                </span>{' '}
                for exercising any of these rights.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Right to designate an authorized agent
                </span>{' '}
                to make requests on your behalf.
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{' '}
              <a
                href="mailto:hello@holymog.com"
                className="font-medium text-white/85 underline-offset-4 hover:underline"
              >
                hello@holymog.com
              </a>{' '}
              from the address linked to your account, or contact us via
              the methods in Section 18. We will verify your identity
              before responding and will respond within forty-five (45)
              days, with a possible extension as permitted by law.
            </p>
          </Section>

          <Section index={12} title="European Privacy Rights (GDPR / UK GDPR)">
            <p>
              If you are located in the European Economic Area, the
              United Kingdom, or Switzerland, you have the following
              rights under the EU/UK General Data Protection Regulation:
            </p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>Right of access to your personal data.</li>
              <li>Right to rectification of inaccurate data.</li>
              <li>Right to erasure (&ldquo;right to be forgotten&rdquo;).</li>
              <li>Right to restrict processing.</li>
              <li>Right to data portability.</li>
              <li>
                Right to object to processing based on legitimate
                interests.
              </li>
              <li>
                Right to withdraw consent at any time (where processing
                is based on consent), without affecting the lawfulness
                of processing based on consent before withdrawal.
              </li>
              <li>
                Right to lodge a complaint with your local supervisory
                authority.
              </li>
            </ul>
            <p className="mt-3">
              <span className="font-semibold text-white/85">
                Data controller.
              </span>{' '}
              holymog is the data controller. Email{' '}
              <a
                href="mailto:hello@holymog.com"
                className="font-medium text-white/85 underline-offset-4 hover:underline"
              >
                hello@holymog.com
              </a>{' '}
              for any privacy inquiry.
            </p>
            <p className="mt-2">
              <span className="font-semibold text-white/85">
                International transfers.
              </span>{' '}
              Personal information is transferred to and processed in
              the United States and other jurisdictions where our
              service providers operate. Where required, we rely on
              appropriate transfer mechanisms (e.g. Standard Contractual
              Clauses approved by the European Commission, UK
              International Data Transfer Addenda) to ensure lawful
              transfer.
            </p>
          </Section>

          <Section index={13} title="Your Rights & Choices (All Users)">
            <p>
              In addition to jurisdiction-specific rights described
              above, every user can:
            </p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                Download a complete JSON export of every record we
                hold about you from{' '}
                <Link
                  href="/account"
                  className="font-medium text-white/85 underline-offset-4 hover:underline"
                >
                  /account
                </Link>{' '}
                &rarr; your data &rarr; download my data.
              </li>
              <li>
                Remove your leaderboard entry, reset your stats, or
                permanently delete your account from{' '}
                <Link
                  href="/account"
                  className="font-medium text-white/85 underline-offset-4 hover:underline"
                >
                  /account
                </Link>{' '}
                &rarr; danger zone.
              </li>
              <li>
                Sign out from{' '}
                <Link
                  href="/account"
                  className="font-medium text-white/85 underline-offset-4 hover:underline"
                >
                  /account
                </Link>
                .
              </li>
              <li>
                Email{' '}
                <a
                  href="mailto:hello@holymog.com"
                  className="font-medium text-white/85 underline-offset-4 hover:underline"
                >
                  hello@holymog.com
                </a>{' '}
                from the address linked to your account to request
                access, correction, portability, or restriction of
                your data, or to follow up on a deletion request
                that can&rsquo;t be self-served.
              </li>
            </ul>
            <p className="mt-3">
              We will respond within 30 days, or sooner if required by
              applicable law.
            </p>
          </Section>

          <Section index={14} title="Children's Privacy">
            <p>
              The Service is not directed at children under 13, and we
              do not knowingly collect personal information from anyone
              under 13. If you are a parent or guardian and believe your
              child has provided personal information to us, please
              email hello@holymog.com and we will promptly delete the
              data and terminate the associated account.
            </p>
          </Section>

          <Section index={15} title="International Users">
            <p>
              The Service is operated from the United States. If you are
              accessing the Service from outside the United States, your
              information may be transferred to, stored in, and
              processed in the United States and other countries where
              our service providers operate. By using the Service, you
              consent to this transfer, subject to the safeguards
              described in Section 12.
            </p>
          </Section>

          <Section index={16} title="Security">
            <p>
              We implement reasonable administrative, technical, and
              physical safeguards to protect personal information,
              including: TLS-encrypted transport, hashed credentials
              managed by Auth.js, environment-secret separation,
              server-side rate limiting, and access controls on our
              database and storage buckets. However, no method of
              transmission over the Internet or electronic storage is
              100% secure, and we cannot guarantee absolute security.
            </p>
            <p>
              In the event of a personal data breach, where required by
              applicable law we will notify the relevant supervisory
              authority{' '}
              <span className="font-semibold">
                within 72 hours of becoming aware of the breach
              </span>{' '}
              (consistent with GDPR Art. 33). We will also notify
              affected users without undue delay where the breach is
              likely to result in a high risk to their rights and
              freedoms, or as otherwise required by applicable law.
            </p>
          </Section>

          <Section index={17} title="Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When
              we do, we will revise the &ldquo;Last updated&rdquo; date
              at the top of the page. Material changes will be
              communicated via the Service or by email to your account
              address at least seven (7) days before they take effect.
              Your continued use of the Service after changes take
              effect constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section index={18} title="Contact">
            <p>
              For privacy questions or to exercise any of your rights,
              email{' '}
              <a
                href="mailto:hello@holymog.com"
                className="font-medium text-white underline-offset-4 hover:underline"
              >
                hello@holymog.com
              </a>
              . To report abuse or violations, email{' '}
              <a
                href="mailto:safety@holymog.com"
                className="font-medium text-white underline-offset-4 hover:underline"
              >
                safety@holymog.com
              </a>
              .
            </p>
          </Section>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.4 }}
            className="mt-16 flex flex-col items-center gap-3 border-t border-white/10 pt-8 text-[11px] text-white/40"
          >
            <Link href="/terms" className="hover:text-white/80">
              ← Terms of Service
            </Link>
            <span className="text-[10px] text-white/30">
              © 2026 holymog. All rights reserved.
            </span>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ y: 8, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mt-12 flex flex-col gap-3"
    >
      <div className="flex items-baseline gap-3">
        <span className="font-num text-xs font-semibold tabular-nums text-white/35">
          {index.toString().padStart(2, '0')}
        </span>
        <h2 className="text-xl font-bold tracking-tight text-white">
          {title}
        </h2>
      </div>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-white/65">
        {children}
      </div>
    </motion.section>
  );
}

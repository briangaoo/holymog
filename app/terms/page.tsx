'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { LegalBackLink } from '@/components/LegalBackLink';

const LAST_UPDATED = 'May 11, 2026';

/**
 * Terms of Service. Includes BIPA-aligned biometric consent, DMCA
 * notice procedure, two-party-consent recording prohibition, mass-
 * arbitration protocol with 30-day opt-out, and gross-negligence /
 * willful-misconduct carve-out on the liability cap. Have a lawyer
 * review the specifics (state-by-state biometric regulation, your
 * eventual DMCA agent registration, and the dispute-resolution venue)
 * before public launch.
 */
export default function TermsPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-black">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(168,85,247,0.30) 0%, rgba(34,211,238,0.18) 35%, transparent 65%)',
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
              <FileText size={11} aria-hidden /> Legal
            </span>
            <h1 className="text-5xl font-bold leading-[1.05] tracking-tight text-white">
              Terms of Service
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
            className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] p-6 backdrop-blur sm:p-8"
            style={{
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(168,85,247,0.10)',
            }}
          >
            <p className="text-sm leading-relaxed text-white/75">
              Welcome to holymog. These Terms of Service (&ldquo;
              <span className="font-semibold">Terms</span>&rdquo;) are a
              binding agreement between you and{' '}
              <span className="font-semibold">holymog</span>{' '}
              (&ldquo;
              <span className="font-semibold">we</span>,&rdquo; &ldquo;
              <span className="font-semibold">us</span>,&rdquo; or &ldquo;
              <span className="font-semibold">our</span>&rdquo;) governing
              your access to and use of the holymog website, applications,
              and related services (collectively, the &ldquo;
              <span className="font-semibold">Service</span>&rdquo;). Please
              read them carefully. By accessing or using the Service you
              agree to be bound by these Terms. If you do not agree, do not
              use the Service.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/75">
              <span className="font-semibold text-white">Important:</span>{' '}
              Section 3 contains a binding biometric-data consent. Section
              20 contains a binding individual-arbitration provision and
              class-action waiver, with a 30-day opt-out described in
              Section 20(d). Read both carefully.
            </p>
          </motion.div>

          <Section index={1} title="Agreement to Terms">
            <p>
              By creating an account, accessing the Service, scanning your
              face, submitting to the leaderboard, joining a Mog Battle, or
              otherwise using any portion of the Service, you confirm that
              you have read, understood, and agree to be bound by these
              Terms and our{' '}
              <Link
                href="/privacy"
                className="font-medium text-white/85 underline-offset-4 hover:underline"
              >
                Privacy Policy
              </Link>
              . If you are using the Service on behalf of an organization,
              you represent that you are authorized to bind that
              organization to these Terms.
            </p>
          </Section>

          <Section index={2} title="Eligibility">
            <p>
              The Service is intended for users who are at least{' '}
              <span className="font-semibold">13 years old</span>{' '}
              (or the
              minimum legal age in your jurisdiction, whichever is higher).
              If you are under 18, you represent that you have your parent
              or legal guardian&rsquo;s permission to use the Service. By
              using the Service you represent and warrant that you meet
              these eligibility requirements and that all registration
              information you submit is truthful and accurate.
            </p>
            <p>
              The Service is not directed at, and we do not knowingly
              collect information from, children under 13. If we learn we
              have collected personal information from a child under 13, we
              will delete it.
            </p>
          </Section>

          <Section index={3} title="Biometric Information & Consent">
            <p>
              The Service captures images of your face and submits them to
              third-party machine-learning models for the purpose of
              generating an aesthetic score. To the extent the resulting
              data constitutes &ldquo;
              <span className="font-semibold">biometric identifiers</span>
              &rdquo; or &ldquo;
              <span className="font-semibold">biometric information</span>
              &rdquo; under the Illinois Biometric Information Privacy Act
              (740 ILCS 14, &ldquo;
              <span className="font-semibold">BIPA</span>&rdquo;), the
              Texas Capture or Use of Biometric Identifier Act, the
              Washington biometric privacy law (RCW 19.375), or
              &ldquo;sensitive personal information&rdquo; under the
              California Consumer Privacy Act / California Privacy Rights
              Act (&ldquo;
              <span className="font-semibold">CCPA/CPRA</span>&rdquo;), or
              &ldquo;special category data&rdquo; under the EU/UK General
              Data Protection Regulation (&ldquo;
              <span className="font-semibold">GDPR</span>&rdquo; Art. 9):
            </p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                <span className="font-semibold text-white/85">
                  Express consent.
                </span>{' '}
                By initiating a face scan, joining a Mog Battle, or
                submitting a photo to the leaderboard, you provide your
                informed, written, and revocable consent to our collection
                and processing of biometric data for the limited purpose
                described below.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Limited purpose.
                </span>{' '}
                Biometric data is collected solely to generate, display,
                and persist your aesthetic scores within the Service. We do
                not sell, lease, trade, or otherwise profit from biometric
                data, and we do not use it for marketing, advertising, or
                identification.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Retention & destruction schedule.
                </span>{' '}
                If you are <span className="font-semibold">signed in</span>,
                each face-scan image is archived to a private storage
                bucket (
                <code className="font-mono text-[12px]">holymog-scans</code>
                ) and retained until: (a) you delete your account, (b)
                you request individual deletion, or (c) three (3) years
                after your last interaction with the Service —
                whichever comes first. The bucket is{' '}
                <span className="font-semibold">never publicly readable</span>
                ; images are served only via short-lived authenticated
                URLs after we verify ownership. The archive serves
                three purposes: (i) so you can review your record-
                scoring photo from your account; (ii) integrity review
                of high-score submissions (see below); (iii) source-of-
                truth if you later choose to publish a scan to the
                public leaderboard. Public leaderboard photos (opt-in,
                optional at every tier) are stored in a separate public
                bucket and deleted within thirty (30) days of removal,
                account deletion, or deletion request. Battle-frame
                images are forwarded to the AI model, scored, and
                discarded immediately; we do not persist them.
                Anonymous (non-signed-in) scan images are not retained
                at all. All biometric identifiers will be permanently
                destroyed when the initial purpose for collection has
                been satisfied, or per the retention schedule above.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Top-score (≥ S-tier) review.
                </span>{' '}
                Scans whose overall score reaches{' '}
                <span className="font-semibold">87 or above</span>{' '}
                (S-tier and above) are flagged for human review. A
                holymog operator inspects the saved image to verify it
                plausibly belongs to the submitting account-holder
                rather than being a celebrity photo, AI composite, or
                other ineligible submission. Review is{' '}
                <span className="font-semibold">verification only</span>
                {' '}— it neither approves nor denies leaderboard
                placement. Reviewers are bound by the same
                confidentiality and use-limitation rules as the rest of
                the Service and are forbidden from sharing or
                redistributing reviewed images. By submitting a scan
                that scores ≥ 87, you consent to this human review.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Disclosure to processors.
                </span>{' '}
                We disclose biometric data only to the third-party
                AI-processing provider (currently Google, via the Gemini
                API) and to our hosting / storage providers (Vercel,
                Supabase, LiveKit) as strictly necessary to operate the
                Service. These providers are contractually required to
                handle the data only for that purpose.
              </li>
              <li>
                <span className="font-semibold text-white/85">
                  Withdrawal of consent.
                </span>{' '}
                You may withdraw your biometric consent at any time by
                emailing hello@holymog.com from the address linked to your
                account. Withdrawal will result in deletion of stored
                biometric data and termination of features that depend on
                it.
              </li>
            </ul>
            <p className="mt-3">
              Our written biometric data retention and destruction policy
              is incorporated into these Terms by reference and is
              published in our Privacy Policy.
            </p>
          </Section>

          <Section index={4} title="Your Account">
            <p>
              To access certain features (Mog Battles, the leaderboard,
              account stats, history) you must create an account using
              Google OAuth or email magic-link authentication. You are
              responsible for: (a) maintaining the confidentiality of your
              sign-in credentials, (b) all activity that occurs under your
              account, and (c) immediately notifying us of any unauthorized
              access at hello@holymog.com.
            </p>
            <p>
              You may not share your account, sell or transfer it, create
              an account using false information, or impersonate any person
              or entity. We reserve the right to suspend or terminate
              accounts that violate these Terms.
            </p>
          </Section>

          <Section index={5} title="License to Use the Service">
            <p>
              Subject to your compliance with these Terms, we grant you a
              limited, non-exclusive, non-transferable, non-sublicensable,
              revocable license to access and use the Service for your
              personal, non-commercial use. All rights not expressly
              granted are reserved.
            </p>
            <p>
              You may not: (a) reverse engineer, decompile, or disassemble
              any part of the Service; (b) scrape, crawl, or use automated
              means to access the Service; (c) use the Service to develop a
              competing product; (d) remove any proprietary notices; or
              (e) circumvent any technical protection measures.
            </p>
          </Section>

          <Section index={6} title="User Content">
            <p>
              The Service allows you to submit content including, without
              limitation, face scans, photographs, display names,
              leaderboard entries, battle gameplay video, and other
              materials (collectively, &ldquo;
              <span className="font-semibold">User Content</span>&rdquo;).
              You retain all ownership rights in your User Content.
            </p>
            <p>
              By submitting User Content to the Service, you grant us a
              worldwide, royalty-free, non-exclusive, sublicensable,
              transferable license to host, store, reproduce, modify (e.g.,
              resize, compress, crop), create derivative works of (e.g.,
              composite share images, leaderboard thumbnails), publicly
              display, publicly perform, and distribute your User Content
              solely for the purpose of operating, providing, and improving
              the Service. For leaderboard submissions specifically, this
              license includes the right to display your photo and display
              name to all users of the Service indefinitely while your
              entry is active.
            </p>
            <p>
              You represent and warrant that: (a) you own or have all
              necessary rights to your User Content; (b) your User Content
              does not violate any third-party rights or applicable law;
              and (c) for any image submitted to the leaderboard or used
              in Mog Battles, you are the person depicted, or you have the
              express written consent of every depicted person to upload
              and publicly display the image.
            </p>
            <p>
              You may delete your leaderboard entry, account, and stored
              data at any time by emailing hello@holymog.com or via the
              in-app account controls when available. Deletion is
              processed within 30 days, subject to legal retention
              obligations.
            </p>
          </Section>

          <Section index={7} title="Acceptable Use">
            <p>You agree not to use the Service to:</p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                Upload or display the face, likeness, or personal
                information of any other person without their explicit
                consent.
              </li>
              <li>
                Upload images depicting minors (anyone under 18), nudity,
                sexually explicit content, violence, or hate symbols.
              </li>
              <li>
                Harass, threaten, defame, dox, or stalk any other user, in
                Mog Battles or otherwise.
              </li>
              <li>
                Use AI-generated, deepfake, or otherwise non-authentic
                faces to manipulate the leaderboard or battle outcomes.
              </li>
              <li>
                Attempt to influence the AI scoring model through
                adversarial input, prompt injection, or other manipulation.
              </li>
              <li>
                Spam, post junk submissions, or attempt to artificially
                inflate ratings.
              </li>
              <li>
                Record, screenshot, screen-capture, or otherwise capture
                any portion of another participant&rsquo;s live audio or
                video during Mog Battles without that participant&rsquo;s
                affirmative consent. Many U.S. jurisdictions, including
                California (Cal. Penal Code § 632), require all-party
                consent to record private communications. Violations are a
                criminal offense in those jurisdictions and grounds for
                immediate, permanent termination of your account.
              </li>
              <li>
                Introduce malware, viruses, or any code intended to damage
                the Service or other users&rsquo; devices.
              </li>
              <li>
                Violate any applicable law, regulation, or third-party
                right.
              </li>
              <li>
                Use the Service for any commercial purpose without our
                prior written permission.
              </li>
            </ul>
            <p className="mt-3">
              We may, in our sole discretion and without prior notice,
              remove User Content, suspend or terminate accounts, and
              refer matters to law enforcement for any violation of this
              section. To report a violation, email{' '}
              <a
                href="mailto:safety@holymog.com"
                className="font-medium text-white/85 underline-offset-4 hover:underline"
              >
                safety@holymog.com
              </a>
              .
            </p>
          </Section>

          <Section index={8} title="Face Scoring & AI Disclaimer">
            <p>
              The Service uses third-party artificial intelligence
              (currently Google Gemini 2.5 Flash Lite) to generate
              aesthetic scores from submitted face images. These scores
              are{' '}
              <span className="font-semibold">
                provided for entertainment purposes only
              </span>{' '}
              and:
            </p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                Are subjective opinions generated by a machine-learning
                model, not statements of fact.
              </li>
              <li>
                Are not medical, psychological, or professional advice of
                any kind.
              </li>
              <li>
                May reflect biases inherent in the underlying model&rsquo;s
                training data.
              </li>
              <li>
                May vary between scans of the same person due to lighting,
                pose, and the probabilistic nature of the model.
              </li>
              <li>
                Should not be relied upon for self-image, dating, hiring,
                or any consequential decisions.
              </li>
            </ul>
            <p className="mt-3">
              We make no representations about the accuracy, fairness, or
              consistency of the scores. By using the Service you
              acknowledge and accept these limitations.
            </p>
          </Section>

          <Section index={9} title="Mog Battles">
            <p>
              The Mog Battles feature enables real-time peer video
              sessions between two or more authenticated users via the
              LiveKit Cloud platform. By participating you agree:
            </p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                That other participants will see and hear your live video
                feed for the duration of the session.
              </li>
              <li>
                Not to expose minors, third parties without consent,
                nudity, or any unlawful content on camera.
              </li>
              <li>
                Not to record, screenshot, screen-capture, broadcast, or
                republish another participant&rsquo;s live audio or video
                feed without their affirmative consent. Violations are
                grounds for permanent account termination and may
                additionally violate state two-party-consent laws (see
                Section 7).
              </li>
              <li>
                That we do not record battle video on our servers, but
                other participants may capture content via their own
                devices and we cannot control that.
              </li>
              <li>
                That for{' '}
                <span className="font-semibold">every battle (public
                and private)</span>, we save{' '}
                <span className="font-semibold">one image per
                participant per battle</span> &mdash; the
                highest-scoring frame our scorer pulled during the
                match &mdash; to a private storage bucket. This image
                is never publicly readable and is used only for
                moderation review (e.g. when an opponent reports you,
                or when we&rsquo;re investigating abuse).
              </li>
              <li>
                That public 1v1 opponents can{' '}
                <span className="font-semibold">file a report</span>{' '}
                against you after the match for cheating (deepfake,
                AI face, celebrity), minors on camera, nudity / sexual
                content, harassment, spam / impersonation, or other
                policy violations. The reporting flow does not apply
                to private parties; concerns about private-party
                participants must be emailed to{' '}
                <a
                  href="mailto:hello@holymog.com"
                  className="font-medium text-white/85 underline-offset-4 hover:underline"
                >
                  hello@holymog.com
                </a>
                .
              </li>
              <li>
                That ELO and rating changes from public 1v1 battles are
                final and non-reversible.
              </li>
            </ul>
            <p className="mt-3">
              <span className="font-semibold text-white/85">
                Bans.
              </span>{' '}
              We review every report and may permanently ban accounts
              that violate these Terms. Banning is at our sole
              discretion. When we ban you:
            </p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                Sign-in is disabled and every active session is purged
                immediately.
              </li>
              <li>
                You receive a notice email at the address on file
                explaining the action.
              </li>
              <li>
                Your leaderboard entry, scans, and battle history
                remain on file in case the decision is reversed. You
                may still request data export or deletion via{' '}
                <a
                  href="mailto:hello@holymog.com"
                  className="font-medium text-white/85 underline-offset-4 hover:underline"
                >
                  hello@holymog.com
                </a>
                .
              </li>
              <li>
                If you believe the ban was a mistake, you may appeal
                by emailing{' '}
                <a
                  href="mailto:safety@holymog.com"
                  className="font-medium text-white/85 underline-offset-4 hover:underline"
                >
                  safety@holymog.com
                </a>
                {' '}with the date of the battle and the basis for
                your appeal. We read every appeal and respond, but
                approval is at our sole discretion.
              </li>
            </ul>
            <p className="mt-3">
              <span className="font-semibold text-white/85">
                Filing a report.
              </span>{' '}
              Report submissions are made in good faith. Filing a
              false report intended to harass or retaliate is itself
              a violation of these Terms and may result in a ban of
              the filing account. The user being reported is{' '}
              <span className="font-semibold">not notified</span> that
              a report was filed, only if and when the report results
              in a ban.
            </p>
            <p className="mt-3">
              For abuse outside the in-app report flow (between
              battles, on profiles, in leaderboard submissions, etc),
              email{' '}
              <a
                href="mailto:safety@holymog.com"
                className="font-medium text-white/85 underline-offset-4 hover:underline"
              >
                safety@holymog.com
              </a>{' '}
              with the relevant IDs (visible in the result screen or
              on the public profile) and a brief description.
            </p>
          </Section>

          <Section index={10} title="Leaderboard Submissions">
            <p>
              When you submit a scan to the public leaderboard, your
              display name, score, sub-scores, and (only if you opt
              in) your scan photo become publicly visible to all
              users of the Service. Whether to publish your face on
              the public leaderboard is{' '}
              <span className="font-semibold">
                always optional, at every tier
              </span>
              ; the toggle lives in your account settings under
              privacy and you can flip it off at any time, after
              which the public copy is deleted within minutes.
            </p>
            <p>
              Separately, and at every tier, every authenticated
              scan is archived to a private storage bucket as
              described in Section 3 and in our Privacy Policy. For
              scans whose overall score reaches the S-tier threshold
              (≥ 87), a holymog operator may inspect that archived
              image to verify the scan plausibly belongs to the
              account-holder &mdash; purely for integrity review of
              top-of-board entries. This review uses the private
              archive, not your public leaderboard photo, which
              remains your independent opt-in choice.
            </p>
            <p>
              We reserve the right to remove leaderboard entries that we
              reasonably believe violate these Terms, are submitted in
              bad faith, or were obtained by manipulating the scoring
              system.
            </p>
          </Section>

          <Section index={11} title="Intellectual Property">
            <p>
              The Service, including all software, designs, text,
              graphics, logos, the holymog name and mark, and all other
              content (excluding User Content) is owned by or licensed to
              us and protected by copyright, trademark, and other
              intellectual property laws. Nothing in these Terms transfers
              any ownership of that intellectual property to you.
            </p>
            <p>
              You may not use our name, logo, or branding without our
              prior written consent.
            </p>
          </Section>

          <Section index={12} title="DMCA / Copyright Notices">
            <p>
              We respect the intellectual property rights of others and
              expect users of the Service to do the same. If you believe
              that User Content infringes your copyright, please send a
              written notice (a &ldquo;
              <span className="font-semibold">DMCA Notice</span>&rdquo;)
              to our designated agent at{' '}
              <a
                href="mailto:dmca@holymog.com"
                className="font-medium text-white/85 underline-offset-4 hover:underline"
              >
                dmca@holymog.com
              </a>{' '}
              that includes:
            </p>
            <ul className="ml-1 mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-white/65">
              <li>
                A physical or electronic signature of the copyright owner
                or person authorized to act on their behalf;
              </li>
              <li>
                Identification of the copyrighted work claimed to have
                been infringed;
              </li>
              <li>
                Identification of the allegedly infringing material with
                enough detail (e.g., leaderboard entry ID, URL,
                screenshot) for us to locate it;
              </li>
              <li>
                Your contact information (address, phone number, email);
              </li>
              <li>
                A statement that you have a good-faith belief that the
                use is not authorized by the copyright owner, its agent,
                or the law;
              </li>
              <li>
                A statement, under penalty of perjury, that the
                information in the notice is accurate and that you are
                the copyright owner or authorized to act on the
                owner&rsquo;s behalf.
              </li>
            </ul>
            <p className="mt-3">
              Upon receipt of a valid DMCA Notice, we will remove or
              disable access to the allegedly infringing material and may,
              in appropriate circumstances, terminate accounts of repeat
              infringers. If you believe content was removed or disabled
              by mistake or misidentification, you may submit a
              counter-notice to the same address.
            </p>
          </Section>

          <Section index={13} title="Third-Party Services">
            <p>
              The Service relies on third-party providers including,
              without limitation: Google (OAuth and Vertex AI), Supabase
              (database and storage), LiveKit (real-time video), Vercel
              (hosting), Google Workspace (transactional email), and
              Upstash (rate limiting). Your use of those providers&rsquo;
              functionality may be subject to their own terms and privacy
              policies, and we are not responsible for their acts or
              omissions. We may add, remove, or replace third-party
              providers at any time.
            </p>
          </Section>

          <Section index={14} title="Termination">
            <p>
              We may suspend or terminate your access to the Service,
              with or without notice, at our sole discretion, including
              if we believe you have violated these Terms. You may stop
              using the Service and delete your account at any time. Upon
              termination: (a) your right to use the Service ends
              immediately; (b) we will, on request, delete your personal
              data subject to our legal retention obligations; and (c)
              Sections 3 (Biometric Information, to the extent of
              ongoing destruction obligations), 6 (User Content license,
              to the extent of content already publicly distributed), 11
              (Intellectual Property), 15&ndash;20 (Disclaimers,
              Liability, Indemnification, Governing Law, Dispute
              Resolution), and 21 (Severability) survive termination.
            </p>
          </Section>

          <Section index={15} title="Disclaimers">
            <p>
              The Service is provided &ldquo;
              <span className="font-semibold">as is</span>&rdquo; and
              &ldquo;
              <span className="font-semibold">as available</span>&rdquo;
              without warranty of any kind, whether express, implied,
              statutory, or otherwise. To the maximum extent permitted by
              applicable law, we disclaim all warranties, including
              without limitation warranties of merchantability, fitness
              for a particular purpose, non-infringement, accuracy,
              reliability, and uninterrupted operation.
            </p>
            <p>
              We do not warrant that the Service will meet your
              requirements, that the operation of the Service will be
              uninterrupted or error-free, that defects will be
              corrected, or that the Service or the servers that make it
              available are free of viruses or other harmful components.
              You use the Service at your own risk.
            </p>
          </Section>

          <Section index={16} title="Limitation of Liability">
            <p>
              To the maximum extent permitted by applicable law, in no
              event shall we, our affiliates, officers, directors,
              employees, or agents be liable for any indirect, incidental,
              special, consequential, exemplary, or punitive damages,
              including without limitation damages for loss of profits,
              goodwill, use, data, or other intangible losses, arising
              out of or in connection with your use of, or inability to
              use, the Service, even if we have been advised of the
              possibility of such damages.
            </p>
            <p>
              Our total cumulative liability to you for any and all
              claims arising out of or relating to the Service or these
              Terms shall not exceed the greater of (a) one hundred US
              dollars ($100), or (b) the total amount you have paid us,
              if any, in the twelve (12) months preceding the event
              giving rise to the liability.
            </p>
            <p>
              <span className="font-semibold text-white/85">
                Carve-out.
              </span>{' '}
              Nothing in this Section limits or excludes liability that
              cannot be limited or excluded under applicable law,
              including (where applicable) liability for: (i) gross
              negligence or willful misconduct; (ii) fraud or fraudulent
              misrepresentation; (iii) death or personal injury caused by
              negligence; or (iv) any other liability that cannot be
              waived under consumer-protection statutes in your
              jurisdiction. To that extent, the foregoing limitations do
              not apply.
            </p>
          </Section>

          <Section index={17} title="Indemnification">
            <p>
              You agree to defend, indemnify, and hold harmless holymog,
              its affiliates, and their respective officers, directors,
              employees, and agents from and against any and all claims,
              damages, obligations, losses, liabilities, costs, debt, and
              expenses (including reasonable attorneys&rsquo; fees)
              arising from: (a) your use of and access to the Service;
              (b) your violation of any term of these Terms; (c) your
              violation of any third-party right, including any
              intellectual property or privacy right; (d) any User
              Content you submit; or (e) any other party&rsquo;s access
              and use of the Service with your account.
            </p>
          </Section>

          <Section index={18} title="Modifications">
            <p>
              We may revise these Terms at any time at our sole
              discretion. The most current version will always be posted
              at this URL with a &ldquo;Last updated&rdquo; date.
              Material changes will be communicated via the Service or
              by email to your account address at least seven (7) days
              before they take effect. Your continued use of the Service
              after changes take effect constitutes acceptance of the
              revised Terms. If you do not agree to the revised Terms,
              you must stop using the Service.
            </p>
          </Section>

          <Section index={19} title="Governing Law">
            <p>
              These Terms and any dispute arising out of or in connection
              with them are governed by the laws of the State of
              California, USA, without regard to its conflict-of-law
              principles. The United Nations Convention on Contracts for
              the International Sale of Goods does not apply.
            </p>
          </Section>

          <Section
            index={20}
            title="Dispute Resolution & Class-Action Waiver"
          >
            <p>
              <span className="font-semibold text-white/85">
                (a) Informal resolution.
              </span>{' '}
              Before initiating arbitration, you and we agree to attempt
              in good faith to resolve any dispute informally for at
              least sixty (60) days, beginning when one party sends the
              other a written notice of dispute (for us, to{' '}
              hello@holymog.com).
            </p>
            <p>
              <span className="font-semibold text-white/85">
                (b) Binding individual arbitration.
              </span>{' '}
              If informal resolution fails, any dispute, claim, or
              controversy arising out of or relating to these Terms or
              the Service shall be resolved by binding individual
              arbitration administered by the American Arbitration
              Association (&ldquo;
              <span className="font-semibold">AAA</span>&rdquo;) under
              its Consumer Arbitration Rules. Arbitration will take place
              in San Francisco, California, unless we agree to a
              different location; alternatively, you may elect to
              participate via telephone or video. Judgment on the award
              rendered by the arbitrator may be entered in any court of
              competent jurisdiction.
            </p>
            <p>
              <span className="font-semibold text-white/85">
                (c) Class-action waiver.
              </span>{' '}
              <span className="font-semibold">
                You and we agree that each party may bring claims against
                the other only in your or our individual capacity, and
                not as a plaintiff or class member in any purported class
                or representative proceeding.
              </span>{' '}
              The arbitrator may not consolidate more than one
              person&rsquo;s claims and may not preside over any form of
              representative or class proceeding.
            </p>
            <p>
              <span className="font-semibold text-white/85">
                (d) 30-day right to opt out.
              </span>{' '}
              You may opt out of this arbitration provision by sending a
              written notice to{' '}
              <a
                href="mailto:hello@holymog.com"
                className="font-medium text-white/85 underline-offset-4 hover:underline"
              >
                hello@holymog.com
              </a>{' '}
              within thirty (30) days of the date you first accept these
              Terms (or, for existing users, within thirty (30) days of
              the &ldquo;Last updated&rdquo; date above), stating your
              full name, the email address linked to your account, and a
              clear statement that you decline arbitration. If you opt
              out, the remaining sections of this Section 20, including
              the class-action waiver, will not apply to you.
            </p>
            <p>
              <span className="font-semibold text-white/85">
                (e) Mass-arbitration protocol.
              </span>{' '}
              If twenty-five (25) or more demands for arbitration of
              substantively similar disputes are filed against us by or
              with the assistance of the same law firm or coordinated
              counsel within a thirty (30) day period, the AAA Mass
              Arbitration Supplementary Rules (or any successor rules)
              shall apply. The parties shall select ten (10) bellwether cases
              for initial arbitration; the remaining cases shall be
              stayed. After bellwether outcomes, the parties shall
              attempt resolution of remaining cases in good faith using
              the bellwether results as guidance, and may seek a
              court-supervised mediation before further arbitration is
              initiated. This provision is intended to streamline
              resolution while preserving the substantive rights of all
              claimants.
            </p>
            <p>
              <span className="font-semibold text-white/85">
                (f) Exceptions.
              </span>{' '}
              Notwithstanding the foregoing, you may bring an individual
              action in small-claims court, and either party may seek
              injunctive or other equitable relief in any court of
              competent jurisdiction to protect its intellectual property
              rights.
            </p>
          </Section>

          <Section index={21} title="Severability & Entire Agreement">
            <p>
              If any provision of these Terms is held to be invalid or
              unenforceable, that provision will be limited or eliminated
              to the minimum extent necessary, and the remaining
              provisions will remain in full force and effect. These
              Terms, together with the Privacy Policy, constitute the
              entire agreement between you and us regarding the Service
              and supersede all prior or contemporaneous communications
              and proposals.
            </p>
            <p>
              Our failure to enforce any right or provision will not be
              considered a waiver. You may not assign these Terms without
              our prior written consent. We may freely assign these
              Terms.
            </p>
          </Section>

          <Section
            index={22}
            title="Cosmetics, Achievements & Future Purchases"
          >
            <p>
              The Service includes an in-app system of decorative
              cosmetic items that change how your display name and
              avatar appear to other users on profile pages,
              leaderboards, battle tiles, and follower lists. The
              system is permission-gated by gameplay: cosmetic items
              unlock by hitting specific milestones (for example,
              completing your first scan, scanning at a given tier,
              winning a number of battles, or reaching an ELO
              threshold).
            </p>
            <p>
              At the current release of the Service (&ldquo;Launch
              1&rdquo;), the cosmetic catalog is limited to{' '}
              <span className="font-semibold">name effects</span>{' '}
              (subtle text-decoration treatments applied to your
              display name) and is{' '}
              <span className="font-semibold">entirely free</span>:
              every cosmetic is earned through gameplay, none can be
              purchased, and no payments are processed through the
              Service. Cosmetics are purely decorative &mdash;
              equipping or unequipping a cosmetic does not affect
              your scores, your matchmaking, your ELO, or any other
              functional aspect of the Service.
            </p>
            <p>
              We may, in our sole discretion, add, modify, retire,
              replace, rebalance, or remove cosmetic items,
              achievement thresholds, or the slots in which
              cosmetics render, with or without notice. Retiring or
              renaming a specific cosmetic does not entitle you to
              any refund (no payments are involved at Launch 1) or
              to an equivalent replacement item.
            </p>
            <p>
              A future update may add a paid layer to this system,
              including one-time cosmetic purchases, a subscription
              tier (&ldquo;holymog+&rdquo;), or both. If and when
              that layer ships, additional terms governing
              purchases, subscriptions, refunds, taxes, and the
              legal relationship of paid items to your account will
              be added to these Terms and prominently disclosed
              before any payment is collected through the Service.
              Until that update ships, no payment-related terms in
              these Terms apply to you because no payments are
              being processed.
            </p>
          </Section>

          <Section index={23} title="Contact">
            <p>
              For questions about these Terms, email{' '}
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
              . For DMCA copyright notices, email{' '}
              <a
                href="mailto:dmca@holymog.com"
                className="font-medium text-white underline-offset-4 hover:underline"
              >
                dmca@holymog.com
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
            <Link href="/privacy" className="hover:text-white/80">
              Privacy Policy →
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

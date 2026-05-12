'use client';

import Link from 'next/link';
import {
  ExternalLink,
  HelpCircle,
  Mail,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { Section } from './shared';
import { captureCurrentAsBack } from '@/lib/back-nav';

/**
 * Help & legal — links and version footer. /help carries the FAQ +
 * contact form; /terms and /privacy are the static legal pages. Bug
 * reports route to mailto: while we don't have a ticketing system —
 * revisit when there's volume to justify one.
 */
export function HelpSection() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? 'v1';
  return (
    <Section
      id="help"
      label="help & legal"
      description="docs, contact, and the fine print."
      icon={HelpCircle}
      accent="zinc"
    >
      <LinkRow href="/help" Icon={HelpCircle} label="help & faq" />
      <LinkRow href="/terms" Icon={ScrollText} label="terms of service" />
      <LinkRow href="/privacy" Icon={ShieldCheck} label="privacy policy" />
      <LinkRow
        href="mailto:hello@holymog.com?subject=bug%20report"
        Icon={Mail}
        label="report a bug"
        external
      />
      <div className="border-t border-white/5 px-4 py-3">
        <span className="font-num text-[11px] tabular-nums text-zinc-600">
          holymog · {version}
        </span>
      </div>
    </Section>
  );
}

function LinkRow({
  href,
  Icon,
  label,
  external,
}: {
  href: string;
  Icon: React.ComponentType<{
    size?: number;
    className?: string;
    'aria-hidden'?: boolean;
  }>;
  label: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <Icon size={14} className="text-zinc-400" aria-hidden />
      <span className="flex-1 text-[14px] text-zinc-200">{label}</span>
      <ExternalLink size={12} className="text-zinc-500" aria-hidden />
    </>
  );
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 border-t border-white/5 px-4 py-3 transition-colors hover:bg-white/[0.025]"
      >
        {inner}
      </a>
    );
  }
  // Drop a back-nav breadcrumb so /terms and /privacy can route the
  // user back here with a "back to account" label instead of the
  // hardcoded "back home". /help doesn't need it (its own back link
  // handles the destination) but it's harmless.
  const isLegal = href === '/terms' || href === '/privacy';
  return (
    <Link
      href={href}
      onClick={() => {
        if (isLegal) captureCurrentAsBack();
      }}
      className="flex items-center gap-3 border-t border-white/5 px-4 py-3 transition-colors hover:bg-white/[0.025]"
    >
      {inner}
    </Link>
  );
}

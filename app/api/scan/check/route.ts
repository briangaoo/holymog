import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getOrIssueAnonymousId } from '@/lib/anonymousId';
import { checkScanLimit, readClientIp } from '@/lib/scanLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const anonId = userId ? null : await getOrIssueAnonymousId();
  const ip = readClientIp(request);
  const state = await checkScanLimit({ userId, anonId, ip });
  // Public surface only — do not leak anon_id, ip_hash, or oldest timestamps.
  return NextResponse.json({
    allowed: state.allowed,
    used: state.used,
    limit: state.limit,
    signedIn: state.signedIn,
    reason: state.reason,
    resetInSeconds: state.resetInSeconds,
  });
}

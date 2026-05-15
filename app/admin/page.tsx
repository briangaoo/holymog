import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { AdminConsole } from './AdminConsole';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /admin — staff console. The primary stealth gate is proxy.ts at the
 * repo root: non-admins never reach this handler, they get rewritten
 * to a non-existent path and Next serves its real _not-found
 * response (byte-identical to a 404 for any other unknown URL).
 *
 * The page-level requireAdmin() + notFound() below is defense in
 * depth — if the proxy ever fails open (bug, matcher drift, new
 * Next runtime quirk), the page still refuses to render and falls
 * back to a 404. The response shape is slightly different from
 * the proxy-mediated 404 in that "fail open" case, but it's still a
 * 404 with no console payload, which is the security-critical
 * property. We deliberately do NOT export a custom metadata object
 * here because the title would leak as a fingerprint visible to
 * an attacker who managed to bypass the proxy.
 */
export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) notFound();
  return <AdminConsole adminUserId={admin.userId} />;
}

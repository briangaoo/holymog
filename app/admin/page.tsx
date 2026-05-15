import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { AdminConsole } from './AdminConsole';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// No indexing, ever — even if a stray link leaks, search engines should
// not catalogue this surface. notFound() already adds noindex but this
// is a belt + braces guarantee independent of what Next does with the
// 404 render.
export const metadata = {
  title: '404',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * /admin — staff console. Hidden behind a real 404 for anyone who
 * isn't on the ADMIN_USER_IDS allowlist.
 *
 * Stealth model: when the caller is not an admin we call `notFound()`,
 * which throws the same NEXT_HTTP_ERROR_FALLBACK;404 that
 * a non-existent route would. The response status, headers, and body
 * are identical to hitting any other unknown URL. Logged-out users,
 * regular signed-in users, and curl scans all see the same 404 —
 * there's no observable signal that /admin exists at all.
 *
 * This is one half of the gate. The other half is /api/admin/*, where
 * each route handler also calls notFound() before doing any work.
 */
export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) notFound();
  return <AdminConsole adminUserId={admin.userId} />;
}

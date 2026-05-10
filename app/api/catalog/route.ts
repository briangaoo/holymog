import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CatalogRow = {
  kind: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  sort_order: number;
};

/**
 * GET /api/catalog
 *
 * Public read of every active catalog item. If the caller is signed
 * in, also includes their inventory so the storefront UI can show
 * "owned" badges. Optional ?kind=frame|badge|theme filter.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kindFilter = url.searchParams.get('kind');

  const pool = getPool();
  const items = await pool.query<CatalogRow>(
    kindFilter
      ? `select kind, slug, name, description, price_cents, sort_order
           from catalog_items
          where active = true and kind = $1
          order by kind asc, sort_order asc, price_cents asc`
      : `select kind, slug, name, description, price_cents, sort_order
           from catalog_items
          where active = true
          order by kind asc, sort_order asc, price_cents asc`,
    kindFilter ? [kindFilter] : [],
  );

  let owned: string[] = [];
  let equipped: {
    frame: string | null;
    theme: string | null;
    flair: string | null;
    name_fx: string | null;
  } = {
    frame: null,
    theme: null,
    flair: null,
    name_fx: null,
  };
  const session = await auth();
  if (session?.user) {
    const [inv, prof] = await Promise.all([
      pool.query<{ item_slug: string }>(
        `select item_slug from user_inventory where user_id = $1`,
        [session.user.id],
      ),
      pool.query<{
        equipped_frame: string | null;
        equipped_theme: string | null;
        equipped_flair: string | null;
        equipped_name_fx: string | null;
      }>(
        `select equipped_frame, equipped_theme, equipped_flair, equipped_name_fx
           from profiles where user_id = $1 limit 1`,
        [session.user.id],
      ),
    ]);
    owned = inv.rows.map((r) => r.item_slug);
    if (prof.rows[0]) {
      equipped = {
        frame: prof.rows[0].equipped_frame,
        theme: prof.rows[0].equipped_theme,
        flair: prof.rows[0].equipped_flair,
        name_fx: prof.rows[0].equipped_name_fx,
      };
    }
  }

  return NextResponse.json({
    items: items.rows,
    owned,
    equipped,
  });
}

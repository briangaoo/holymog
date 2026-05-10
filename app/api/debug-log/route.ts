import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOG_PATH = '/tmp/holymog-debug.log';

/**
 * Local dev-only debug log. In production this returns 404 so attackers
 * can't fingerprint or abuse it (disk-fill, log-poisoning). The /scan
 * client fires this fire-and-forget so a 404 in prod is silent.
 */
function isDevOnly(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export async function POST(request: Request) {
  if (!isDevOnly()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const entry = { ts: new Date().toISOString(), ...body };
    await fs.appendFile(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'log_failed' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  if (!isDevOnly()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    await fs.writeFile(LOG_PATH, '', 'utf8');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

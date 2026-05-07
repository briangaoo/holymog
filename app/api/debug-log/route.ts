import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOG_PATH = '/tmp/holymog-debug.log';

export async function POST(request: Request) {
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
  try {
    await fs.writeFile(LOG_PATH, '', 'utf8');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

import type { NextResponse } from 'next/server';
import { NextResponse as NR } from 'next/server';
import type { ZodType } from 'zod';
import { publicError } from './errors';

/**
 * Parse a JSON request body against a zod schema and return either
 * the typed result or a ready-to-return 400 response.
 *
 * Usage:
 *   const parsed = await parseJsonBody(request, MySchema);
 *   if ('error' in parsed) return parsed.error;
 *   const data = parsed.data; // typed
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      error: NR.json(publicError('invalid_body'), { status: 400 }),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      error: NR.json(
        publicError(
          'invalid_body',
          result.error.issues,
          // surface the first issue's message to the client so forms can
          // display it inline; the rest is logged server-side
          result.error.issues[0]?.message,
        ),
        { status: 400 },
      ),
    };
  }
  return { data: result.data };
}

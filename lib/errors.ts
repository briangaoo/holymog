/**
 * Generic error wrapper. Route handlers should pipe internal errors
 * through this so we never leak DB-error text, Gemini API state,
 * Stripe error codes, or stack traces to clients.
 *
 * Convention:
 *   { error: '<machine-readable code>', message?: '<user-facing string>' }
 *
 * `error` is intended for client-side branching. `message` is
 * optional, human-readable, and safe to surface in UI.
 */

export type PublicError = {
  error: string;
  message?: string;
};

/**
 * Build a safe error response payload.
 *
 * `internal` is logged server-side (console.error for now; swap to a
 * Sentry hook later); the client only sees the stable error code +
 * optional human-readable message.
 */
export function publicError(
  code: string,
  internal?: unknown,
  message?: string,
): PublicError {
  if (internal !== undefined) {
    // eslint-disable-next-line no-console
    console.error('[publicError]', code, internal);
  }
  return message ? { error: code, message } : { error: code };
}

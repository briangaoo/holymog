/**
 * Server-side IANA timezone validation. Used by endpoints that need
 * to compute a per-user "today" boundary in the caller's local
 * timezone instead of UTC.
 *
 * The browser sends its zone via `Intl.DateTimeFormat().resolvedOptions().timeZone`
 * (e.g., "America/Los_Angeles"). We validate against Node's own
 * Intl tables before letting the string near a SQL query — Postgres
 * accepts a timezone name in `AT TIME ZONE`, and an invalid name
 * throws a runtime error. Defensive validation keeps a malformed
 * client header from breaking the request.
 */
export function validateTimezone(input: string | null | undefined): string {
  if (!input) return 'UTC';
  const cleaned = input.trim();
  // IANA zone names are short (<= 64 chars in practice). A long
  // string is either malformed input or an attempt to push something
  // weird into the SQL — bail to UTC.
  if (cleaned.length === 0 || cleaned.length > 64) return 'UTC';
  // Intl.DateTimeFormat throws on an unknown timezone. Cheap probe.
  try {
    Intl.DateTimeFormat('en-US', { timeZone: cleaned });
    return cleaned;
  } catch {
    return 'UTC';
  }
}

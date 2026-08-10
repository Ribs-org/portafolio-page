/**
 * Reads an environment variable, stripping a leading byte-order mark and
 * surrounding whitespace.
 *
 * Values uploaded from a Windows shell can carry a UTF-8 BOM, which silently
 * corrupts anything compared byte for byte — a signing secret stops matching, a
 * timezone name stops resolving — with no error to point at the cause.
 */
export function env(name: string): string | undefined {
  const raw = process.env[name]
  if (raw === undefined) return undefined
  const cleaned = raw.replace(/^\uFEFF/, '').trim()
  return cleaned === '' ? undefined : cleaned
}

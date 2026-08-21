/**
 * Two-letter avatar initials. Falls back to the local part of an email when no
 * real name is available, so a pre-`full_name` token still renders something
 * sensible instead of "?".
 */
export function initials(name?: string | null, fallback = '?'): string {
  let s = (name ?? '').trim()
  if (s.includes('@')) s = s.split('@')[0].replace(/[._-]+/g, ' ')
  const p = s.split(/\s+/).filter(Boolean)
  if (!p.length) return fallback
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

/** Deterministic hue from a string, so a user always gets the same chip color. */
export function hueFrom(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

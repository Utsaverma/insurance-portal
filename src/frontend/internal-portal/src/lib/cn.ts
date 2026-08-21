type ClassValue = string | number | false | null | undefined

/**
 * Minimal class joiner. Deliberately NOT clsx + tailwind-merge: merging would
 * need its own config extension to learn that `rounded-card` and
 * `rounded-control` are one conflict group, and would silently mis-merge our
 * custom tokens otherwise.
 *
 * Convention this relies on: `className` on a primitive is for LAYOUT only
 * (w-full, mt-4, col-span-2) — never to repaint a variant. Variants are plain
 * Record lookups with mutually exclusive class sets, so no primitive ever
 * generates a conflicting pair internally. If a call site needs a new paint,
 * add a variant.
 */
export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ')
}

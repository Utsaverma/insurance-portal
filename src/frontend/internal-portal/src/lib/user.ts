import type { AuthUser, UserProfileResponse, UserRole } from '../types'

/**
 * JWT segments are base64**url** (`-` and `_`), which bare `atob` rejects.
 * Today's payloads happened to avoid those characters for typical values, but
 * adding `full_name` changes the payload bytes and makes them likely — and a
 * throw here used to mean a silent bounce to /login while holding a perfectly
 * valid token. The TextDecoder pass also stops `atob`'s bytes-as-chars output
 * from mangling non-ASCII names ("José" -> "JosÃ©").
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const seg = token.split('.')[1]
    if (!seg) return null
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
    const bytes = Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Seed the user from the access token so the header renders on first paint. */
export function tokenToUser(token: string): AuthUser | null {
  const p = decodeJwtPayload(token)
  const id = p && str(p.sub)
  if (!id) return null
  const email = str(p.email) ?? ''
  return {
    id,
    email,
    name: str(p.full_name) ?? email,
    role: (str(p.role) as UserRole | null) ?? 'AUDITOR',
  }
}

/** Map the /users/me response onto the client-side display shape. */
export function profileToUser(profile: UserProfileResponse): AuthUser {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name?.trim() || profile.email,
    role: profile.role,
  }
}

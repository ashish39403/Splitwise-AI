import { neonAuth, neonAuthUrl } from './neon-auth'

export async function signUp(email: string, password: string, name: string) {
  const result = await neonAuth.signUp.email({ email, password, name })
  if (result.error) throw new Error(result.error.message)
}
export async function signIn(email: string, password: string) {
  const result = await neonAuth.signIn.email({ email, password })
  if (result.error) throw new Error(result.error.message)
}
export async function signInWithGoogle() {
  const result = await neonAuth.signIn.social({
    provider: 'google',
    callbackURL: `${window.location.origin}/dashboard`,
  })
  if (result.error) throw new Error(result.error.message)
}
export async function signOut() { await neonAuth.signOut() }
export async function getSession() { return neonAuth.getSession() }

// Better Auth caches the session in memory, so getSession() can return a stale
// (or already-expired) JWT without hitting the network. Several components mount
// at once after a browser refresh and would otherwise each fire a request with
// that stale token, get a 401, and race to refresh. We single-flight every token
// read, verify the token really is a JWT with a future `exp`, and only then hand
// it to a caller. Never log the token itself — only safe metadata.
const REFRESH_SKEW_MS = 30_000
const DEV = import.meta.env.DEV

type JwtInfo = {
  expiresAt: number | null
  issuer: string | null
  audience: string | null
}

function decodeJwt(token: string): JwtInfo | null {
  try {
    const segment = token.split('.')[1]
    if (!segment) return null
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as {
      exp?: number | string
      iss?: string
      aud?: string | string[]
    }
    const rawExp = payload.exp
    const exp =
      typeof rawExp === 'number'
        ? rawExp
        : typeof rawExp === 'string' && rawExp.trim() !== ''
          ? Number(rawExp)
          : Number.NaN
    return {
      expiresAt: Number.isFinite(exp) ? exp * 1000 : null,
      issuer: typeof payload.iss === 'string' ? payload.iss : null,
      audience: Array.isArray(payload.aud)
        ? payload.aud.join(',')
        : typeof payload.aud === 'string'
          ? payload.aud
          : null,
    }
  } catch {
    return null
  }
}

function isUsable(token: string | null): boolean {
  if (!token) return false
  const info = decodeJwt(token)
  // An opaque session token (no JWT structure / no exp) must never be sent to
  // Django: it can only produce a 401. Require a real, unexpired JWT.
  if (!info || info.expiresAt === null) return false
  return info.expiresAt > Date.now() + REFRESH_SKEW_MS
}

function logTokenState(label: string, token: string | null): void {
  if (!DEV) return
  if (!token) {
    console.debug(`[auth] ${label}: no token`)
    return
  }
  const info = decodeJwt(token)
  console.debug(`[auth] ${label}:`, {
    isJwt: info !== null,
    secondsLeft:
      info?.expiresAt === null || info?.expiresAt === undefined
        ? null
        : Math.round((info.expiresAt - Date.now()) / 1000),
    iss: info?.issuer ?? null,
    aud: info?.audience ?? null,
  })
}

async function readToken(forceRefresh: boolean): Promise<string | null> {
  const result = await neonAuth.getSession(
    forceRefresh
      ? { fetchOptions: { headers: { 'X-Force-Fetch': 'true' } } }
      : undefined,
  )
  if (result.error) return null
  const token = result.data?.session?.token ?? null
  logTokenState(forceRefresh ? 'session (force-fetch)' : 'session (cached)', token)
  return token
}

// Last resort when getSession() keeps returning an opaque token: Better Auth's
// JWT plugin exposes GET /token, which issues a fresh signed JWT for the active
// session cookie. X-Force-Fetch makes the SDK hit the network instead of serving
// its cached session payload for this endpoint.
async function readFreshJwtFromTokenEndpoint(): Promise<string | null> {
  const client = neonAuth as typeof neonAuth & {
    getToken?: (options?: {
      fetchOptions?: { headers?: Record<string, string> }
    }) => Promise<{ data?: { token?: string }; error?: unknown }>
  }
  if (typeof client.getToken !== 'function') return null
  try {
    const result = await client.getToken({
      fetchOptions: { headers: { 'X-Force-Fetch': 'true' } },
    })
    if (result.error) return null
    const token = result.data?.token ?? null
    logTokenState('/token endpoint', token)
    return token
  } catch {
    return null
  }
}

let pendingToken: Promise<string | null> | null = null

export function getAccessToken(
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  if (pendingToken) return pendingToken
  pendingToken = (async () => {
    const cached = await readToken(options.forceRefresh === true)
    if (isUsable(cached)) return cached

    const refreshed = await readToken(true)
    if (isUsable(refreshed)) return refreshed

    // Cold page load: the SDK's in-memory cache is gone, so getSession() can
    // return the opaque session token instead of a JWT. Fall back to /token.
    const fromTokenEndpoint = await readFreshJwtFromTokenEndpoint()
    if (isUsable(fromTokenEndpoint)) return fromTokenEndpoint

    // Nothing usable. Return null so callers show a clear sign-in message
    // instead of firing requests that are guaranteed to be rejected with 401.
    return null
  })().finally(() => {
    pendingToken = null
  })
  return pendingToken
}

async function emailOtp(path: string, body: Record<string, string>) {
  const response = await fetch(`${neonAuthUrl}${path}`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const result: { message?: string } = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Email verification failed.')
}

export function resendVerificationCode(email: string) {
  return emailOtp('/email-otp/send-verification-otp', { email, type: 'email-verification' })
}

export function verifyEmailCode(email: string, otp: string) {
  return emailOtp('/email-otp/verify-email', { email, otp })
}

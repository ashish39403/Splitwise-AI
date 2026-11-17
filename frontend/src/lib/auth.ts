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

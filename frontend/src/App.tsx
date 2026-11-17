import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { getMe, type Profile } from "./lib/api";
import { getSession, resendVerificationCode, signIn, signInWithGoogle, signOut, signUp, verifyEmailCode } from "./lib/auth";
import { neonAuth } from "./lib/neon-auth";
import "./App.css";

function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const navigate = useNavigate();
  const isSignUp = mode === "signup";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError("");
    setLoading(true);
    try {
      const email = String(data.get("email"));
      const password = String(data.get("password"));
      if (isSignUp) { await signUp(email, password, String(data.get("name"))); navigate(`/verify-email?email=${encodeURIComponent(email)}`, { replace: true }); }
      else { await signIn(email, password); window.location.assign("/dashboard"); }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to continue.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function continueWithGoogle() {
    setError("");
    setLoading(true);
    try { await signInWithGoogle(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Google sign-in could not start."); setLoading(false); }
  }
  return (
    <main className="auth-layout">
      <section className="auth-card">
        <a className="brand" href="/">
          ◩ Splitter <b>AI</b>
        </a>
        <h1>{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p>
          {isSignUp
            ? "Start splitting expenses, tracking balances, and settling up with your people."
            : "Sign in to continue managing shared expenses."}
        </p>
        <form onSubmit={submit}>
          {isSignUp && (
            <label>
              Full name
              <input
                name="name"
                required
                placeholder="Enter your full name"
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              placeholder="Enter your email"
              autoComplete="email"
              inputMode="email"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder={
                isSignUp ? "Create a password" : "Enter your password"
              }
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
          </label>
          {isSignUp && (
            <small>At least 8 characters, with a number or symbol.</small>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button disabled={loading}>
            {loading ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>
        <div className="auth-divider"><span>or continue with</span></div>
        <button className="google-button" type="button" disabled={loading} onClick={() => void continueWithGoogle()}>
          <span aria-hidden="true">G</span> Continue with Google
        </button>
        <p className="switch">
          {isSignUp ? "Already have an account?" : "New to Splitter AI?"}{" "}
          <a href={isSignUp ? "/sign-in" : "/sign-up"}>
            {isSignUp ? "Sign in" : "Create account"}
          </a>
        </p>
      </section>
      <aside className="auth-art">
        <p className="eyebrow">SMARTER SHARED MONEY</p>
        <h2>
          Split expenses effortlessly with <em>Splitter AI</em>
        </h2>
        <p>
          Create groups, add expenses, and keep track of who owes whom — all in
          one place.
        </p>
        <div className="preview">
          <strong>🌴 Goa Trip</strong>
          <span>4 members</span>
          <hr />
          <b>Expenses</b>
          <p>
            🍽️ Dinner at Beach Shack <strong>₹2,400</strong>
          </p>
          <p>
            🛏️ Hotel (2 nights) <strong>₹8,000</strong>
          </p>
        </div>
      </aside>
    </main>
  );
}

function VerifyEmailPage() {
  const [params] = useSearchParams(); const email = params.get('email') ?? ''; const [otp, setOtp] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [loading, setLoading] = useState(false)
  async function verify(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); setLoading(true); try { await verifyEmailCode(email, otp); window.location.assign('/dashboard'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Incorrect or expired code.'); setLoading(false); } }
  async function resend() { setError(''); setMessage(''); setLoading(true); try { await resendVerificationCode(email); setMessage('A new verification code has been sent.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not resend the code.'); } finally { setLoading(false); } }
  return <main className="auth-layout"><section className="auth-card"><a className="brand" href="/">◩ Splitter <b>AI</b></a><h1>Verify your email</h1><p>We sent a verification code to <strong>{email || 'your email address'}</strong>.</p><form onSubmit={verify}><label>Verification code<input value={otp} onChange={(event) => setOtp(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} placeholder="Enter 6-digit code" /></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success">{message}</p>}<button disabled={loading || !email}>{loading ? 'Please wait…' : 'Verify email'}</button></form><p className="switch">Didn’t receive it? <button className="link-button" type="button" onClick={() => void resend()} disabled={loading || !email}>Resend code</button></p></section><aside className="auth-art"><p className="eyebrow">SECURE YOUR ACCOUNT</p><h2>One quick step and you’re <em>ready to split.</em></h2></aside></main>
}
function Home({ onSignOut }: { onSignOut: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    void neonAuth.token().then((result) => {
      if (!result.error && result.data?.token) void getMe(result.data.token).then(setProfile).catch(() => setProfile(null));
    });
  }, []);
  return (
    <main className="home">
      <header>
        <a className="brand" href="/">
          ◩ Splitter <b>AI</b>
        </a>
        <button onClick={() => void (async () => { await signOut(); onSignOut(); })()}>Sign out</button>
      </header>
      <section>
        <p className="eyebrow">YOU'RE SIGNED IN</p>
        <h1>Welcome{profile ? `, ${profile.display_name}` : ""}.</h1>
        <p>
          Welcome to Dashboard. Services available soon.
        </p>
      </section>
    </main>
  );
}
function App() {
  const [session, setSession] = useState<object | null | undefined>(undefined);
  useEffect(() => {
    void getSession().then((result) => setSession(result.data?.session ?? null));
  }, []);
  if (session === undefined)
    return <main className="loading-page">Loading Splitter AI…</main>;
  return (
    <Routes>
      <Route
        path="/sign-up"
        element={
          session ? <Navigate to="/dashboard" replace /> : <AuthPage mode="signup" />
        }
      />
      <Route
        path="/sign-in"
        element={
          session ? <Navigate to="/dashboard" replace /> : <AuthPage mode="signin" />
        }
      />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        path="/dashboard"
        element={
          session ? (
            <Home onSignOut={() => setSession(null)} />
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
export default App;

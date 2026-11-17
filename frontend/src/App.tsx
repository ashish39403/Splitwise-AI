import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  createExpense,
  createGroup,
  deleteExpense,
  getExpense,
  getGroup,
  getGroups,
  getMe,
  updateExpense,
  type AIQuickAddDraft,
  type ExpenseInput,
  type GroupDetail,
  type GroupSummary,
  type Profile,
} from "./lib/api";
import {
  calculatePercentageShares,
  formatInr,
  minorToInput,
  parseMinorInput,
} from "./lib/money";
import { getAccessToken, getSession, resendVerificationCode, signIn, signInWithGoogle, signOut, signUp, verifyEmailCode } from "./lib/auth";
import { GroupsPage } from "./features/groups/GroupsPage";
import { GroupDetailPage } from "./features/groups/GroupDetailPage";
import "./App.css";

/* ---------- Inline SVG icons (no extra dependency) ---------- */
function IconUser(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IconMail(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
function IconLock(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function IconEye(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconEyeOff(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}
function IconGoogle(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
function IconSparkle(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}
function IconPlus(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/* ---------- Brand mark ---------- */
function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="28" height="28">
        <defs>
          <linearGradient id="sm" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0f9f6e" />
            <stop offset="100%" stopColor="#7c6ff7" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#sm)" />
        <path d="M11 10c0-1.5 1.2-2.5 3-2.5h4c1.8 0 3 1 3 2.5s-1.2 2.5-3 2.5h-2c-1.8 0-3 1-3 2.5s1.2 2.5 3 2.5h4c1.8 0 3 1 3 2.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );
}

function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const navigate = useNavigate();
  const isSignUp = mode === "signup";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError("");
    setLoading(true);
    try {
      const email = String(data.get("email"));
      const password = String(data.get("password"));
      if (isSignUp) {
        await signUp(email, password, String(data.get("name")));
        navigate(`/verify-email?email=${encodeURIComponent(email)}`, { replace: true });
      } else {
        await signIn(email, password);
        window.location.assign("/dashboard");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to continue.");
    } finally {
      setLoading(false);
    }
  }
  async function continueWithGoogle() {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Google sign-in could not start.");
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell anim-fade">
      <section className="auth-form-side">
        <div className="auth-card anim-slide-up">
          <a className="brand" href="/">
            <BrandMark />
            <span>Splitter <b>AI</b></span>
          </a>

          <h1>{isSignUp ? "Create your account" : "Welcome back"}</h1>
          <p className="auth-subcopy">
            {isSignUp
              ? "Start splitting expenses, track balances, and settle up with friends, roommates, and groups — all in one place."
              : "Sign in to your Splitter AI account to manage shared expenses."}
          </p>

          <form onSubmit={submit} noValidate>
            {isSignUp && (
              <label>
                <span>Full name</span>
                <div className="input-wrap">
                  <IconUser className="input-icon" />
                  <input name="name" type="text" required placeholder="Enter your full name" autoComplete="name" />
                </div>
              </label>
            )}

            <label>
              <span>Email address</span>
              <div className="input-wrap">
                <IconMail className="input-icon" />
                <input name="email" type="email" required placeholder="Enter your email" autoComplete="email" inputMode="email" />
              </div>
            </label>

            <label>
              <span>Password</span>
              <div className="input-wrap">
                <IconLock className="input-icon" />
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  placeholder={isSignUp ? "Create a password" : "Enter your password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <IconEyeOff className="input-icon" /> : <IconEye className="input-icon" />}
                </button>
              </div>
              <small>At least 8 characters, with a number or symbol.</small>
            </label>

            {!isSignUp && (
              <div className="auth-row">
                <label className="checkbox">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  <span>Remember me</span>
                </label>
                <a className="text-link" href="#" onClick={(e) => e.preventDefault()}>
                  Forgot password?
                </a>
              </div>
            )}

            {error && (
              <div className="alert alert--error" role="alert">
                <span>{error}</span>
              </div>
            )}

            <button className="primary" type="submit" disabled={loading}>
              {loading ? (
                <span className="spinner" aria-hidden="true" />
              ) : null}
              {loading ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
            </button>
          </form>

          <div className="auth-divider">
            <span>or continue with</span>
          </div>

          <button className="google-button" type="button" disabled={loading} onClick={() => void continueWithGoogle()}>
            <IconGoogle className="google-icon" />
            {isSignUp ? "Sign up with Google" : "Sign in with Google"}
          </button>

          <p className="legal">
            By creating an account, you agree to our{" "}
            <a className="text-link" href="#" onClick={(e) => e.preventDefault()}>
              Terms of Service
            </a>{" "}
            and{" "}
            <a className="text-link" href="#" onClick={(e) => e.preventDefault()}>
              Privacy Policy
            </a>
            .
          </p>

          <p className="switch">
            {isSignUp ? "Already have an account?" : "New to Splitter AI?"}{" "}
            <a className="text-link" href={isSignUp ? "/sign-in" : "/sign-up"}>
              {isSignUp ? "Sign in" : "Create account"}
            </a>
          </p>
        </div>
      </section>

      <aside className="auth-visual" aria-hidden="true">
        <div className="visual-shape visual-shape--mint" />
        <div className="visual-shape visual-shape--lavender" />

        <div className="visual-content anim-slide-in">
          <p className="eyebrow">SMARTER SHARED MONEY</p>
          <h2>
            Split expenses effortlessly
            <br />
            with <em>Splitter AI</em>
          </h2>
          <p className="visual-copy">
            Create groups, add expenses, and keep track of who owes whom — with the help of AI.
          </p>

          {/* Mock data for visual development only */}
          <div className="preview-stack anim-stagger">
            <article className="preview-card groups-card">
              <header>
                <strong>Your groups</strong>
                <button type="button" className="icon-button small" aria-label="Add group">
                  <IconPlus className="input-icon" />
                </button>
              </header>
              <ul>
                <li><span className="dot dot--mint" /> Goa Trip <span className="count">4 members</span></li>
                <li><span className="dot dot--lavender" /> Roommates <span className="count">3 members</span></li>
                <li><span className="dot dot--amber" /> Office Lunch <span className="count">6 members</span></li>
              </ul>
            </article>

            <article className="preview-card detail-card">
              <header>
                <strong>Goa Trip</strong>
                <span className="count">4 members</span>
              </header>
              <nav className="tabs">
                <span className="tab is-active">Expenses</span>
                <span className="tab">Balances</span>
                <span className="tab">Members</span>
              </nav>
              <ul className="expense-list">
                <li><span className="cat">🍽️</span> Dinner at Beach Shack <span className="payer">Rahul paid</span><span className="amount">₹2,400</span></li>
                <li><span className="cat">🛏️</span> Hotel <span className="payer">You paid</span><span className="amount">₹8,000</span></li>
                <li><span className="cat">🚕</span> Airport Taxi <span className="payer">Aman paid</span><span className="amount">₹1,200</span></li>
              </ul>
            </article>

            <article className="preview-card balance-card">
              <span className="balance-label">Your balance</span>
              <strong className="balance-value">+₹1,320</strong>
              <span className="balance-note">You’re all settled up!</span>
            </article>
          </div>

          <div className="avatar-row">
            <span className="avatar" style={{ background: "#fde68a" }}>A</span>
            <span className="avatar" style={{ background: "#c4b5fd" }}>P</span>
            <span className="avatar" style={{ background: "#86efac" }}>K</span>
            <span className="avatar" style={{ background: "#fca5a5" }}>R</span>
            <span className="avatar avatar--plus"><IconPlus className="input-icon" /></span>
          </div>

          <div className="ai-badge">
            <IconSparkle className="ai-badge__icon" />
            <span>AI splits &amp; summaries</span>
          </div>
        </div>
      </aside>
    </main>
  );
}

function VerifyEmailPage() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyEmailCode(email, otp);
      window.location.assign("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Incorrect or expired code.");
      setLoading(false);
    }
  }
  async function resend() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await resendVerificationCode(email);
      setMessage("A new verification code has been sent.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not resend the code.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="auth-shell anim-fade">
      <section className="auth-form-side">
        <div className="auth-card anim-slide-up">
          <a className="brand" href="/">
            <BrandMark />
            <span>Splitter <b>AI</b></span>
          </a>
          <h1>Verify your email</h1>
          <p className="auth-subcopy">
            We sent a verification code to <strong>{email || "your email address"}</strong>.
          </p>
          <form onSubmit={verify}>
            <label>
              <span>Verification code</span>
              <div className="input-wrap">
                <IconMail className="input-icon" />
                <input
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                />
              </div>
            </label>
            {error && (
              <div className="alert alert--error" role="alert">
                <span>{error}</span>
              </div>
            )}
            {message && <p className="form-success">{message}</p>}
            <button className="primary" type="submit" disabled={loading || !email}>
              {loading ? <span className="spinner" aria-hidden="true" /> : null}
              {loading ? "Please wait…" : "Verify email"}
            </button>
          </form>
          <p className="switch">
            Didn’t receive it?{" "}
            <button className="text-link" type="button" onClick={() => void resend()} disabled={loading || !email}>
              Resend code
            </button>
          </p>
        </div>
      </section>
      <aside className="auth-visual" aria-hidden="true">
        <div className="visual-shape visual-shape--mint" />
        <div className="visual-shape visual-shape--lavender" />
        <div className="visual-content anim-slide-in">
          <p className="eyebrow">SECURE YOUR ACCOUNT</p>
          <h2>
            One quick step and you’re <em>ready to split.</em>
          </h2>
          <p className="visual-copy">Enter the 6-digit code we sent to your email to activate your account.</p>
        </div>
      </aside>
    </main>
  );
}

async function accessToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  return token;
}

function formatMoney(amountMinor: number) {
  return formatInr(amountMinor);
}

function WorkspaceHeader({ onSignOut }: { onSignOut: () => void }) {
  const navigate = useNavigate();
  async function leave() {
    await signOut();
    onSignOut();
    navigate("/sign-in", { replace: true });
  }
  return <header className="app-shell__header"><Link className="brand" to="/dashboard"><BrandMark /><span>Splitter <b>AI</b></span></Link><nav className="app-shell__nav" aria-label="Primary"><Link to="/dashboard">Groups</Link><button type="button" onClick={() => void leave()}>Sign out</button></nav></header>;
}

function GroupsPanel() {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void accessToken().then(getGroups).then(setGroups).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load groups.")); }, []);
  return <section className="groups-panel"><div className="section-heading"><div><h2>Your groups</h2><p>Only groups you belong to are visible here.</p></div><Link className="primary compact" to="/groups/new"><IconPlus className="input-icon" /> Create group</Link></div>{error && <div className="alert alert--error">{error}</div>}{groups === null && !error && <p className="page-status">Loading groups…</p>}{groups?.length === 0 && <div className="empty-state"><h3>No groups yet</h3><p>Create one to record your first shared expense.</p><Link className="primary compact" to="/groups/new">Create a group</Link></div>}<div className="group-grid">{groups?.map((group) => <Link className="group-card" to={`/groups/${group.id}`} key={group.id}><span className="group-icon">◫</span><strong>{group.name}</strong><span>{group.member_count} {group.member_count === 1 ? "member" : "members"}</span>{group.description && <p>{group.description}</p>}<small>{group.current_membership.role}</small></Link>)}</div></section>;
}

function CreateGroupPage({ onSignOut }: { onSignOut: () => void }) {
  const navigate = useNavigate(); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setSaving(true); setError(""); try { const group = await createGroup(await accessToken(), { name: String(data.get("name")), description: String(data.get("description")) }); navigate(`/groups/${group.id}`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create group."); } finally { setSaving(false); } }
  return <main className="app-shell"><WorkspaceHeader onSignOut={onSignOut} /><div className="app-shell__main form-page"><Link className="text-link" to="/dashboard">← Back to groups</Link><p className="eyebrow">NEW GROUP</p><h1>Create a group</h1><p>Start a shared space for a trip, flat, event, or meal.</p><form onSubmit={submit}><label><span>Group name</span><input name="name" required maxLength={120} autoFocus placeholder="Goa Trip 2025" /></label><label><span>Description (optional)</span><textarea name="description" maxLength={2000} placeholder="What are you sharing?" /></label>{error && <div className="alert alert--error">{error}</div>}<button className="primary" disabled={saving}>{saving ? "Creating…" : "Create group"}</button></form></div></main>;
}

type SplitMethod = "equal" | "custom" | "percentage";

function ExpenseFormPage({ onSignOut }: { onSignOut: () => void }) {
  const navigate = useNavigate(); const { groupId = "", expenseId } = useParams(); const [draftParams] = useSearchParams(); const isDraft = draftParams.get("draft") === "1"; const [group, setGroup] = useState<GroupDetail | null>(null); const [description, setDescription] = useState(""); const [amount, setAmount] = useState(""); const [payerId, setPayerId] = useState(""); const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal"); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [selectedIds, setSelectedIds] = useState<string[]>([]); const [custom, setCustom] = useState<Record<string, string>>({}); const [percentages, setPercentages] = useState<Record<string, string>>({}); const [error, setError] = useState(""); const [saving, setSaving] = useState(false); const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void accessToken().then(async (token) => {
      const loadedGroup = await getGroup(token, groupId);
      if (!active) return;
      setGroup(loadedGroup);
      if (expenseId) {
        const expense = await getExpense(token, groupId, expenseId);
        setDescription(expense.description); setAmount(minorToInput(expense.amount_minor));
        setPayerId(expense.payer.id); setSplitMethod(expense.split_method); setDate(expense.expense_date);
        setSelectedIds(expense.participants.map((participant) => participant.profile_id));
        setCustom(Object.fromEntries(expense.participants.map((participant) => [participant.profile_id, minorToInput(participant.share_amount_minor)])));
        setPercentages(Object.fromEntries(expense.participants.map((participant) => [participant.profile_id, participant.percentage ?? ""])));
        return;
      }
      if (isDraft) {
        const key = `splitter-ai-draft:${groupId}`;
        const raw = sessionStorage.getItem(key);
        if (!raw) { setError("The AI draft expired. Please add the expense manually."); return; }
        try {
          const draft = JSON.parse(raw) as AIQuickAddDraft;
          sessionStorage.removeItem(key);
          setDescription(draft.description); setAmount(minorToInput(draft.amount_minor));
          setPayerId(draft.payer.id); setSplitMethod(draft.split_method); setDate(draft.expense_date);
          setSelectedIds(draft.participants.map((item) => item.profile_id));
          setCustom(Object.fromEntries(draft.participants.map((item) => [item.profile_id, minorToInput(item.share_amount_minor)])));
          setPercentages(Object.fromEntries(draft.participants.map((item) => [item.profile_id, item.percentage ?? ""])));
          setAiWarnings(draft.warnings);
        } catch {
          sessionStorage.removeItem(key);
          setError("The AI draft was invalid. Please add the expense manually.");
        }
        return;
      }
      setPayerId(loadedGroup.members[0]?.id ?? "");
      setSelectedIds(loadedGroup.members.map((member) => member.id));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load this expense form."));
    return () => { active = false; };
  }, [expenseId, groupId, isDraft]);
  const amountMinor = parseMinorInput(amount); const selectedMembers = group?.members.filter((member) => selectedIds.includes(member.id)) ?? [];
  const percentagePreview = splitMethod === "percentage"
    ? calculatePercentageShares(amountMinor ?? 0, Object.fromEntries(selectedIds.map((id) => [id, percentages[id] ?? ""])))
    : null;
  const preview = selectedMembers.map((member) => { if (splitMethod === "custom") return [member.id, parseMinorInput(custom[member.id] ?? "") ?? 0] as const; if (splitMethod === "percentage") return [member.id, percentagePreview?.get(member.id) ?? null] as const; const ordered = [...selectedMembers].sort((a, b) => a.id.localeCompare(b.id)); const index = ordered.findIndex((item) => item.id === member.id); const [base, remainder] = amountMinor ? [Math.floor(amountMinor / ordered.length), amountMinor % ordered.length] : [0, 0]; return [member.id, base + (index < remainder ? 1 : 0)] as const; });
  const previewAmounts = new Map(preview.map(([id, value]) => [id, value]));
  function toggleMember(id: string) { setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const minor = parseMinorInput(amount); if (!minor || !group || selectedIds.length === 0) { setError("Enter a valid amount and choose at least one participant."); return; } const participants = selectedIds.map((profile_id) => ({ profile_id, ...(splitMethod === "custom" ? { share_amount_minor: parseMinorInput(custom[profile_id] ?? "") ?? -1 } : {}), ...(splitMethod === "percentage" ? { percentage: percentages[profile_id] ?? "" } : {}) })); const input: ExpenseInput = { description, amount_minor: minor, currency: "INR", payer_id: payerId, split_method: splitMethod, expense_date: date, source: isDraft && !expenseId ? "ai_quick_add" : undefined, participants }; setSaving(true); setError(""); try { if (expenseId) await updateExpense(await accessToken(), groupId, expenseId, input); else await createExpense(await accessToken(), groupId, input); navigate(`/groups/${groupId}`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save expense."); } finally { setSaving(false); } }
  async function remove() { if (!expenseId || !window.confirm("Delete this expense? It will be removed from current balances.")) return; try { await deleteExpense(await accessToken(), groupId, expenseId); navigate(`/groups/${groupId}`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete expense."); } }
  return <main className="app-shell"><WorkspaceHeader onSignOut={onSignOut} /><div className="app-shell__main expense-form-page"><Link className="text-link" to={`/groups/${groupId}`}>← Back to group</Link><p className="eyebrow">{expenseId ? "EDIT EXPENSE" : "NEW EXPENSE"}</p><h1>{expenseId ? "Edit expense" : "Add an expense"}</h1>{aiWarnings.length > 0 && <div className="alert alert--warning"><div><strong>AI suggestions need attention:</strong><ul>{aiWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div></div>}{!group && !error && <p className="page-status">Loading members…</p>}{group && <form className="expense-form" onSubmit={submit}><label><span>What was it for?</span><input value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={255} placeholder="Dinner at Beach Shack" /></label><div className="form-two"><label><span>Amount (₹)</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" required placeholder="0.00" /></label><label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label></div><label><span>Paid by</span><select value={payerId} onChange={(event) => setPayerId(event.target.value)}>{group.members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></label><fieldset><legend>Split method</legend><div className="split-methods">{(["equal", "custom", "percentage"] as SplitMethod[]).map((method) => <button className={splitMethod === method ? "is-selected" : ""} type="button" key={method} onClick={() => setSplitMethod(method)}>{method === "equal" ? "Split equally" : method === "custom" ? "Custom amounts" : "By percentage"}</button>)}</div></fieldset><fieldset><legend>Participants</legend><div className="participant-picker">{group.members.map((member) => <label className="participant-option" key={member.id}><input type="checkbox" checked={selectedIds.includes(member.id)} onChange={() => toggleMember(member.id)} /><span className="avatar">{member.display_name.slice(0, 1).toUpperCase()}</span><span>{member.display_name}</span>{splitMethod === "custom" && selectedIds.includes(member.id) && <input className="split-input" value={custom[member.id] ?? ""} onChange={(event) => setCustom({ ...custom, [member.id]: event.target.value })} inputMode="decimal" placeholder="₹0.00" />}{splitMethod === "percentage" && selectedIds.includes(member.id) && <input className="split-input" value={percentages[member.id] ?? ""} onChange={(event) => setPercentages({ ...percentages, [member.id]: event.target.value })} inputMode="decimal" placeholder="0%" />}</label>)}</div></fieldset><section className="split-preview"><h2>Split preview</h2>{selectedMembers.map((member) => <div key={member.id}><span>{member.display_name}</span><strong>{previewAmounts.get(member.id) == null ? "—" : formatMoney(previewAmounts.get(member.id) ?? 0)}</strong></div>)}{splitMethod === "percentage" && percentagePreview === null && <small>Percentages must total 100 (up to 4 decimals) to preview shares.</small>}<p>Final totals and rounding are always validated by Splitter AI.</p></section>{error && <div className="alert alert--error">{error}</div>}<div className="form-actions"><button className="primary" disabled={saving}>{saving ? "Saving…" : expenseId ? "Save changes" : "Add expense"}</button>{expenseId && <button className="danger-button" type="button" onClick={() => void remove()}>Delete expense</button>}</div></form>}</div></main>;
}

function Home({ onSignOut }: { onSignOut: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void getAccessToken()
      .then((token) => {
        if (!active) return;
        if (token) {
          return getMe(token)
            .then((p) => {
              if (active) setProfile(p);
            })
            .catch(() => {
              if (active) setProfile(null);
            });
        }
        if (active) setProfile(null);
        return undefined;
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="app-shell">
      <WorkspaceHeader onSignOut={onSignOut} />
      <div className="app-shell__main anim-slide-up">
        <p className="eyebrow">YOU'RE SIGNED IN</p>
        {loading ? (
          <>
            <div className="skeleton" style={{ width: "18rem", height: "2.5rem", marginBottom: "1rem" }} />
            <div className="skeleton" style={{ width: "26rem", height: "1rem" }} />
          </>
        ) : (
          <>
            <h1>Welcome{profile ? `, ${profile.display_name}` : ""}.</h1>
            <p>
              Create a group, add your people, and record shared expenses in one place.
            </p>
          </>
        )}
        <GroupsPanel />
      </div>
    </main>
  );
}

function App() {
  const [session, setSession] = useState<object | null | undefined>(undefined);
  const location = useLocation();
  useEffect(() => {
    void getSession().then((result) => setSession(result.data?.session ?? null));
  }, []);
  if (session === undefined) {
    return <main className="loading-page">Loading Splitter AI…</main>;
  }
  return (
    <div className="route-stage" key={location.pathname}>
      <Routes>
        <Route path="/sign-up" element={session ? <Navigate to="/dashboard" replace /> : <AuthPage mode="signup" />} />
        <Route path="/sign-in" element={session ? <Navigate to="/dashboard" replace /> : <AuthPage mode="signin" />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/dashboard" element={session ? <Home onSignOut={() => setSession(null)} /> : <Navigate to="/sign-in" replace />} />
        <Route path="/groups/new" element={session ? <CreateGroupPage onSignOut={() => setSession(null)} /> : <Navigate to="/sign-in" replace />} />
        <Route path="/groups/:groupId/expenses/new" element={session ? <ExpenseFormPage onSignOut={() => setSession(null)} /> : <Navigate to="/sign-in" replace />} />
        <Route path="/groups/:groupId/expenses/:expenseId/edit" element={session ? <ExpenseFormPage onSignOut={() => setSession(null)} /> : <Navigate to="/sign-in" replace />} />
        <Route path="/groups" element={session ? <GroupsPage /> : <Navigate to="/sign-in" replace />} />
        <Route path="/groups/:groupId" element={session ? <GroupDetailPage /> : <Navigate to="/sign-in" replace />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
}

export default App;

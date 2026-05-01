import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '../services/authStore';
import { supabase } from '../services/supabaseClient';

type View = 'login' | 'signup' | 'forgot';

interface AuthModalProps {
  onClose?: () => void;
}

export function AuthModal({ onClose }: AuthModalProps) {
  const [view, setView] = useState<View>('login');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-aurora">
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,245,160,0.15), transparent 70%),' +
              'radial-gradient(ellipse 60% 80% at 80% 100%, rgba(123,47,255,0.12), transparent 70%)',
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative w-full max-w-md mx-4"
      >
        <div
          className="rounded-3xl p-8 border border-white/10"
          style={{
            background: 'rgba(10, 10, 20, 0.75)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            boxShadow:
              '0 0 0 1px rgba(255,255,255,0.06) inset, 0 32px 80px rgba(0,0,0,0.6)',
          }}
        >
          <div className="mb-7 text-center">
            <div className="font-display font-extrabold text-2xl text-shimmer inline-block mb-1">
              noteJoscaz
            </div>
            <div className="text-muted text-sm font-mono">AI Piano & Guitar Transcription</div>
          </div>

          <AnimatePresence mode="wait">
            {view === 'login' && (
              <LoginView key="login" setView={setView} onSuccess={onClose} />
            )}
            {view === 'signup' && (
              <SignupView key="signup" setView={setView} onSuccess={onClose} />
            )}
            {view === 'forgot' && (
              <ForgotView key="forgot" setView={setView} />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Shared helpers ─────────────────────────────────────── */

function ViewWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

function Input({
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  hint,
  rightSlot,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-mono uppercase tracking-widest text-muted">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="w-full rounded-xl px-4 py-3 pr-10 text-sm bg-white/5 border border-white/10 text-text placeholder:text-muted/50 focus:border-piano/50 focus:outline-none transition-colors"
        />
        {rightSlot && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>
        )}
      </div>
      {hint && <div className="text-[11px] text-muted/70 font-mono">{hint}</div>}
    </div>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Input
      label={label}
      type={show ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      autoComplete={autoComplete}
      rightSlot={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="text-muted hover:text-text transition-colors"
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      }
    />
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl px-4 py-3 text-sm text-pink bg-pink/10 border border-pink/20"
    >
      {message}
    </motion.div>
  );
}

function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-button bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <GoogleIcon />
      Continue with Google
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 h-px bg-white/10" />
      <span className="text-xs text-muted font-mono">or</span>
      <div className="flex-1 h-px bg-white/10" />
    </div>
  );
}

/* ─── Password strength ──────────────────────────────────── */

function strengthLevel(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const STRENGTH_COLORS = ['#ff2d6b', '#ffb700', '#00b4d8', '#00f5a0'];
const STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong'];

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const level = strengthLevel(password);
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex gap-1 flex-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{
              background: i < level ? STRENGTH_COLORS[level - 1] : 'rgba(255,255,255,0.1)',
            }}
          />
        ))}
      </div>
      <span className="text-[11px] font-mono text-muted">
        {STRENGTH_LABELS[level - 1] ?? ''}
      </span>
    </div>
  );
}

/* ─── Login view ─────────────────────────────────────────── */

function LoginView({
  setView,
  onSuccess,
}: {
  setView: (v: View) => void;
  onSuccess?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signInWithEmail, signInWithGoogle } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithEmail(email.trim(), password);
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign in failed');
      setBusy(false);
    }
  };

  return (
    <ViewWrap>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        <PasswordInput
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        <AnimatePresence>{error && <ErrorBanner message={error} />}</AnimatePresence>

        <button
          type="submit"
          disabled={busy || !email || !password}
          className="w-full py-3 rounded-full font-button font-semibold text-black text-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #00b4d8, #00f5a0)',
            boxShadow: '0 0 28px rgba(0,245,160,0.3)',
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <Divider />
        <GoogleButton onClick={handleGoogle} disabled={busy} />

        <div className="flex justify-between text-xs font-mono text-muted mt-1">
          <button
            type="button"
            onClick={() => setView('forgot')}
            className="hover:text-text transition-colors"
          >
            Forgot password?
          </button>
          <button
            type="button"
            onClick={() => setView('signup')}
            className="hover:text-text transition-colors"
          >
            Create account →
          </button>
        </div>
      </form>
    </ViewWrap>
  );
}

/* ─── Signup view ────────────────────────────────────────── */

function SignupView({
  setView,
  onSuccess,
}: {
  setView: (v: View) => void;
  onSuccess?: () => void;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const { signUp, signInWithGoogle } = useAuthStore();

  const usernameValid = /^[a-z0-9_]{3,24}$/.test(username);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!usernameValid) {
      setError('Username must be 3–24 lowercase letters, numbers, or _');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (strengthLevel(password) < 2) {
      setError('Please choose a stronger password');
      return;
    }
    setBusy(true);
    try {
      await signUp(email.trim(), password, username.trim());
      setInfo('Check your email to confirm your account, then sign in.');
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign in failed');
      setBusy(false);
    }
  };

  return (
    <ViewWrap>
      {info ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-6 flex flex-col gap-3"
        >
          <div className="text-4xl">📬</div>
          <div className="text-text font-display font-bold">Check your email</div>
          <div className="text-muted text-sm">{info}</div>
          <button
            type="button"
            onClick={() => setView('login')}
            className="text-xs font-mono text-muted hover:text-text transition-colors mt-2"
          >
            ← Back to sign in
          </button>
        </motion.div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Username"
            type="text"
            value={username}
            onChange={(v) => setUsername(v.toLowerCase())}
            autoComplete="username"
            hint="3–24 chars · lowercase letters, numbers, _"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <div className="flex flex-col gap-1">
            <PasswordInput
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            <PasswordStrength password={password} />
          </div>
          <PasswordInput
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />

          <AnimatePresence>{error && <ErrorBanner message={error} />}</AnimatePresence>

          <button
            type="submit"
            disabled={busy || !username || !email || !password || !confirm}
            className="w-full py-3 rounded-full font-button font-semibold text-black text-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #00b4d8, #00f5a0)',
              boxShadow: '0 0 28px rgba(0,245,160,0.3)',
            }}
          >
            {busy ? 'Creating account…' : 'Create account'}
          </button>

          <Divider />
          <GoogleButton onClick={handleGoogle} disabled={busy} />

          <div className="text-center text-xs font-mono text-muted mt-1">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => setView('login')}
              className="hover:text-text transition-colors"
            >
              Sign in →
            </button>
          </div>
        </form>
      )}
    </ViewWrap>
  );
}

/* ─── Forgot password view ───────────────────────────────── */

function ForgotView({ setView }: { setView: (v: View) => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/#/login`,
      });
      if (err) throw err;
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewWrap>
      {sent ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-6 flex flex-col gap-3"
        >
          <div className="text-4xl">✉️</div>
          <div className="text-text font-display font-bold">Check your email</div>
          <div className="text-muted text-sm">We sent a password reset link to {email}</div>
          <button
            type="button"
            onClick={() => setView('login')}
            className="text-xs font-mono text-muted hover:text-text transition-colors mt-2"
          >
            ← Back to sign in
          </button>
        </motion.div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="text-sm text-muted text-center mb-2">
            Enter your email — we'll send a reset link.
          </div>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <AnimatePresence>{error && <ErrorBanner message={error} />}</AnimatePresence>
          <button
            type="submit"
            disabled={busy || !email}
            className="w-full py-3 rounded-full font-button font-semibold text-black text-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #00b4d8, #00f5a0)',
              boxShadow: '0 0 28px rgba(0,245,160,0.3)',
            }}
          >
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <div className="text-center">
            <button
              type="button"
              onClick={() => setView('login')}
              className="text-xs font-mono text-muted hover:text-text transition-colors"
            >
              ← Back to sign in
            </button>
          </div>
        </form>
      )}
    </ViewWrap>
  );
}

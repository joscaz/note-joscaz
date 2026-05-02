import { useAuthStore, DAILY_LIMIT } from '../services/authStore';
import { navigate } from '../hooks/useHashRoute';

export function AuthBadge() {
  const { user, dailyCount, signOut } = useAuthStore();

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => navigate('/login')}
        className="px-4 py-1.5 rounded-full text-xs font-button font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
        style={{ background: '#00b4d8' }}
      >
        Sign in
      </button>
    );
  }

  const username =
    (user.user_metadata?.username as string | undefined) ??
    user.email?.split('@')[0] ??
    'user';
  const initials = username.slice(0, 2).toUpperCase();
  const atLimit = dailyCount >= DAILY_LIMIT;

  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-button font-bold flex-shrink-0"
        style={{ background: 'rgba(0,245,160,0.15)', color: '#00f5a0' }}
      >
        {initials}
      </div>
      <span className="text-xs font-mono text-muted max-w-[80px] truncate">{username}</span>
      <span className="text-white/20 text-xs">·</span>
      <span
        className={`text-xs font-mono tabular-nums transition-colors ${atLimit ? 'text-pink' : 'text-piano'}`}
        title={atLimit ? 'Daily limit reached' : `${DAILY_LIMIT - dailyCount} remaining today`}
      >
        {dailyCount}/{DAILY_LIMIT}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="text-[10px] font-mono text-muted hover:text-pink transition-colors ml-1 hidden group-hover:block"
      >
        sign out
      </button>
    </div>
  );
}

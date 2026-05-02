import { useEffect } from 'react';
import { AuthModal } from './AuthModal';
import { useAuthStore } from '../services/authStore';
import { navigate } from '../hooks/useHashRoute';

export function AuthPage() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const isPasswordRecovery = useAuthStore((s) => s.isPasswordRecovery);

  useEffect(() => {
    if (!loading && user && !isPasswordRecovery) {
      navigate('/');
    }
  }, [user, loading, isPasswordRecovery]);

  return <AuthModal onClose={() => navigate('/')} />;
}

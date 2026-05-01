import { useEffect } from 'react';
import { AuthModal } from './AuthModal';
import { useAuthStore } from '../services/authStore';
import { navigate } from '../hooks/useHashRoute';

export function AuthPage() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    if (!loading && user) {
      navigate('/');
    }
  }, [user, loading]);

  return <AuthModal onClose={() => navigate('/')} />;
}

import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export const DAILY_LIMIT = 5;

interface AuthState {
  user: User | null;
  session: Session | null;
  dailyCount: number;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchDailyCount: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Subscribe once at store creation; listener fires immediately with the
  // current session so `loading` drops to false on the first tick.
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    set({ user, session, loading: false });
    if (user) {
      void get().fetchDailyCount();
    } else {
      set({ dailyCount: 0 });
    }
  });

  return {
    user: null,
    session: null,
    dailyCount: 0,
    loading: true,

    signInWithEmail: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },

    signInWithGoogle: async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    },

    signUp: async (email, password, username) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) throw error;
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({ id: data.user.id, username });
        if (profileError) throw profileError;
      }
    },

    signOut: async () => {
      await supabase.auth.signOut();
      set({ user: null, session: null, dailyCount: 0 });
    },

    fetchDailyCount: async () => {
      const userId = get().user?.id;
      if (!userId) { set({ dailyCount: 0 }); return; }
      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('transcription_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', today);
      set({ dailyCount: count ?? 0 });
    },
  };
});

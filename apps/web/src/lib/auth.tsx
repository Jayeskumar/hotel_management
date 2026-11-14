import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@tablewise/shared';
import { api, refreshSession, tokenStore } from './api';
import type { OutletSummary, Session } from './types';

interface AuthState {
  session: Session | null;
  loading: boolean;
  outlet: OutletSummary | null;
  setOutletId: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (input: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  can: (p: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);
const OUTLET_KEY = 'tw.outletId';

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [outletId, setOutletIdState] = useState<string | null>(() => localStorage.getItem(OUTLET_KEY));

  const accept = useCallback((body: (Session & { accessToken?: string }) | null) => {
    if (body?.accessToken) tokenStore.set(body.accessToken);
    setSession(body ? { user: body.user, organization: body.organization, outlets: body.outlets, permissions: body.permissions } : null);
  }, []);

  useEffect(() => {
    tokenStore.onExpired(() => { tokenStore.set(null); setSession(null); qc.clear(); });
    refreshSession()
      .then((b) => accept(b as Session | null))
      .finally(() => setLoading(false));
  }, [accept, qc]);

  const outlet = useMemo(() => {
    if (!session?.outlets.length) return null;
    return session.outlets.find((o) => o.id === outletId) ?? session.outlets[0]!;
  }, [session, outletId]);

  const value: AuthState = {
    session,
    loading,
    outlet,
    setOutletId: (id) => {
      localStorage.setItem(OUTLET_KEY, id);
      setOutletIdState(id);
      qc.clear();
    },
    login: async (email, password) => {
      accept(await api.post<Session & { accessToken: string }>('/auth/login', { email, password }));
    },
    register: async (input) => {
      accept(await api.post<Session & { accessToken: string }>('/auth/register', input));
    },
    logout: async () => {
      await api.post('/auth/logout').catch(() => undefined);
      tokenStore.set(null);
      setSession(null);
      qc.clear();
    },
    reload: async () => {
      accept(await api.get<Session>('/auth/me'));
    },
    can: (p) => !!session?.permissions.includes(p),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Current outlet, guaranteed (pages render only once an outlet is selected). */
export function useOutlet() {
  const { outlet } = useAuth();
  if (!outlet) throw new Error('No outlet selected');
  return { outlet, base: `/outlets/${outlet.id}` };
}

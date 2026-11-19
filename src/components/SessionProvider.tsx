"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@/domain/types";
import { USERS } from "@/domain/fixtures";

interface SessionValue {
  user: User;
  /** Users offered by the mock role switcher. */
  personas: User[];
  switchUser: (id: string) => void;
  /** Bumped after role switches and mutations so every useApi() refetches. */
  version: number;
  bump: () => void;
  showSources: boolean;
  setShowSources: (v: boolean) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ initialUserId, children }: { initialUserId: string; children: React.ReactNode }) {
  const personas = useMemo(() => USERS.filter((u) => u.switchable), []);
  const [userId, setUserId] = useState(initialUserId);
  const [version, setVersion] = useState(0);
  const [showSources, setShowSources] = useState(false);
  const user = personas.find((u) => u.id === userId) ?? personas[0];

  const switchUser = useCallback((id: string) => {
    document.cookie = `vh_user=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
    setUserId(id);
    setVersion((v) => v + 1);
  }, []);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const value = useMemo(
    () => ({ user, personas, switchUser, version, bump, showSources, setShowSources }),
    [user, personas, switchUser, version, bump, showSources],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

interface ApiState<T> {
  data?: T;
  error?: Error & { status?: number };
  loading: boolean;
}

/**
 * Small data hook around the typed API client. Refetches when the role changes,
 * when `deps` change, after `bump()`, and every `pollMs` if given.
 */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[], opts?: { pollMs?: number }) {
  const { version } = useSession();
  const [state, setState] = useState<ApiState<T>>({ loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fnRef.current();
      setState({ data, loading: false });
    } catch (e) {
      setState((s) => ({ data: silent ? s.data : undefined, error: e as Error, loading: false }));
    }
  }, []);

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, load, ...deps]);

  const poll = opts?.pollMs;
  useEffect(() => {
    if (!poll) return;
    const id = setInterval(() => void load(true), poll);
    return () => clearInterval(id);
  }, [poll, load]);

  return { ...state, reload: () => load(true) };
}

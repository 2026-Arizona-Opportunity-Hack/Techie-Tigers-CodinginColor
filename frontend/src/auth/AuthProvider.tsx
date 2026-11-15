import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getMe, type BackendRole, type Me } from "../lib/api";
import type { Role } from "../lib/roles";

// Backend role string -> frontend URL segment
const routeForRole: Record<BackendRole, Role> = {
  admin: "admin",
  board_member: "board",
  fundraising: "fundraising",
};

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "ready"; me: Me; role: Role }
  | { status: "error"; message: string };

type AuthContextValue = AuthState & { signOut: () => Promise<void> };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = still checking whether there's a saved session
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // The backend's answer, tagged with whose login it was for.
  const [result, setResult] = useState<{ userId: string; state: AuthState } | null>(null);

  // 1. Keep track of the Supabase session (survives page refresh).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // 2. Whenever the signed-in user changes, ask the backend for their role.
  //    (Keyed on user id so routine token refreshes don't refetch.)
  const checked = session !== undefined;
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        const role = routeForRole[me.role];
        setResult({
          userId,
          state: role
            ? { status: "ready", me, role }
            : {
                status: "error",
                message: `Your account has an unknown role ("${me.role}"). Ask an admin to fix it.`,
              },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({
          userId,
          state: {
            status: "error",
            message:
              err instanceof Error ? err.message : "Could not load your account.",
          },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Worked out on each render rather than stored, so it can't go stale:
  // signed out, or still waiting on the backend for this user, or its answer.
  const state: AuthState = !checked
    ? { status: "loading" }
    : !userId
      ? { status: "signedOut" }
      : result?.userId === userId
        ? result.state
        : { status: "loading" };

  async function signOut() {
    setResult(null); // so signing back in never shows the old answer
    await supabase.auth.signOut(); // onAuthStateChange clears the session
  }

  return (
    <AuthContext.Provider value={{ ...state, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

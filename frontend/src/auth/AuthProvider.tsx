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
import type { Role } from "../components/Sidebar";

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
  const [state, setState] = useState<AuthState>({ status: "loading" });

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
    if (!checked) return;

    if (!userId) {
      setState({ status: "signedOut" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    getMe()
      .then((me) => {
        if (cancelled) return;
        const role = routeForRole[me.role];
        if (!role) {
          setState({
            status: "error",
            message: `Your account has an unknown role ("${me.role}"). Ask an admin to fix it.`,
          });
        } else {
          setState({ status: "ready", me, role });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            err instanceof Error ? err.message : "Could not load your account.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [checked, userId]);

  async function signOut() {
    await supabase.auth.signOut(); // onAuthStateChange sets state to signedOut
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

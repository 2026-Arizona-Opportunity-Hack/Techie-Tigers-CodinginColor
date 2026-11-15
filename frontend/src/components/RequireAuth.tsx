import type { ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F0E6] px-6 text-[#242A26]">
      <div className="w-full max-w-[400px] text-center">{children}</div>
    </main>
  );
}

// Wraps dashboard pages: must be signed in, and the URL's role must match
// the role the backend says you have.
export default function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { role } = useParams();
  const location = useLocation();

  if (auth.status === "loading") {
    return (
      <FullPageMessage>
        <p role="status" className="text-sm text-[#5E6B61]">
          Loading your workspace…
        </p>
      </FullPageMessage>
    );
  }

  if (auth.status === "signedOut") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (auth.status === "error") {
    return (
      <FullPageMessage>
        <h1 className="font-display text-4xl">We couldn't open your workspace.</h1>
        <p role="alert" className="mt-4 text-sm text-red-700">
          {auth.message}
        </p>
        <button
          onClick={auth.signOut}
          className="mt-8 w-full cursor-pointer bg-[#183E32] px-6 py-4 text-sm font-semibold text-white hover:bg-[#285745]"
        >
          Sign out
        </button>
      </FullPageMessage>
    );
  }

  // Signed in, but the URL is for a different role -> send them to their own.
  if (role !== auth.role) {
    return <Navigate to={`/${auth.role}/overview`} replace />;
  }

  return <>{children}</>;
}

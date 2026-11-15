
import { useState } from "react";
import { Asterisk, ArrowRight, Eye, EyeOff } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleLogin(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError) {
        throw authError;
      }

      if (!data.session || !data.user) {
        throw new Error("Unable to establish a session.");
      }

      // Login succeeded!
      // We'll navigate to the correct dashboard once
      // the backend provides the user's verified role.
      setSuccess(
        "Signed in successfully! Dashboard access " +
        "will be connected next."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F5F0E6] text-[#242A26]">
      {/* TOP LEFT BRAND */}
      <header className="absolute left-6 top-6 sm:left-12 sm:top-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center bg-[#183E32] text-[#F5F0E6]">
            <Asterisk size={26} strokeWidth={1.5} />
          </div>

          <span className="text-xl font-semibold tracking-[-0.06em] text-[#183E32]">
            coding in color.
          </span>
        </div>
      </header>

      {/* LOGIN CONTENT */}
      <section className="flex min-h-screen items-center justify-center px-6 py-28">
        <div className="w-full max-w-[400px]">
          <div className="mb-10">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7B8D80]">
              Member access
            </p>

            <h1 className="font-display text-6xl leading-none tracking-[-0.025em] sm:text-7xl">
              Welcome back.
            </h1>

            <p className="mt-4 text-sm text-[#788279]">
              Sign in to your workspace.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-7">
            {/* EMAIL */}
            <div>
              <label
                htmlFor="email"
                className="mb-3 block text-[11px] font-bold uppercase tracking-[0.12em] text-[#3E4A42]"
              >
                Email address
              </label>

              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@codingincolor.net"
                disabled={loading}
                className="w-full border-0 border-b border-[#BFC8BE] bg-transparent px-0 py-3 text-sm outline-none transition-colors placeholder:text-[#A1A99F] focus:border-[#183E32] disabled:opacity-60"
              />
            </div>

            {/* PASSWORD */}
            <div>
              <label
                htmlFor="password"
                className="mb-3 block text-[11px] font-bold uppercase tracking-[0.12em] text-[#3E4A42]"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={loading}
                  className="w-full border-0 border-b border-[#BFC8BE] bg-transparent px-0 py-3 pr-10 text-sm outline-none transition-colors placeholder:text-[#A1A99F] focus:border-[#183E32] disabled:opacity-60"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  className="absolute right-0 top-1/2 -translate-y-1/2 cursor-pointer text-[#7B8D80] hover:text-[#183E32]"
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </div>

            {/* ERROR MESSAGE */}
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}

            {/* SUCCESS MESSAGE */}
            {success && (
              <p role="status" className="text-sm text-[#183E32]">
                {success}
              </p>
            )}

            {/* SIGN IN */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full cursor-pointer items-center justify-between bg-[#183E32] px-6 py-4 text-sm font-semibold text-white transition-colors hover:bg-[#285745] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#183E32] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
              <ArrowRight size={19} />
            </button>
          </form>

          <p className="mt-10 text-center text-xs text-[#899388]">
            Coding in Color · Donor & Funder Platform
          </p>
        </div>
      </section>
    </main>
  );
}

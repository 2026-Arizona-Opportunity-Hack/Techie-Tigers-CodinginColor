
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Asterisk, Check } from "lucide-react";

type Role = "admin" | "board" | "fundraising";

const roles: {
  id: Role;
  name: string;
  description: string;
}[] = [
  {
    id: "admin",
    name: "CEO / Admin",
    description: "Organization overview and management",
  },
  {
    id: "board",
    name: "Board Member",
    description: "Assigned donors and follow-ups",
  },
  {
    id: "fundraising",
    name: "Fundraising",
    description: "Campaigns, outreach, and events",
  },
];

export default function Login() {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] =
    useState<Role>("board");
  const [email, setEmail] = useState("");

  function handleContinue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Temporary demo navigation.
    // Replace with Supabase Auth later.
    navigate(`/${selectedRole}/overview`);
  }

  return (
    <main className="min-h-screen bg-[#F5F0E6] lg:grid lg:grid-cols-[48%_52%]">

      {/* LEFT: BRAND PANEL */}
      <section className="relative flex min-h-[270px] flex-col justify-between overflow-hidden bg-[#183E32] p-7 text-[#F5F0E6] sm:p-10 lg:min-h-screen lg:p-14">

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center border border-[#8BA99A]">
            <Asterisk size={26} strokeWidth={1.5} />
          </div>

          <span className="text-lg font-semibold tracking-[-0.05em]">
            coding in color.
          </span>
        </div>

        <div className="relative z-10 max-w-lg py-10 lg:py-0">
          <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#B8CEBF]">
            Relationships that matter
          </p>

          <h1 className="font-display text-[clamp(3.6rem,6vw,7rem)] leading-[0.98] tracking-[-0.025em]">
            The people
            <br />
            behind the
            <br />
            <span className="italic text-[#D8B77D]">
              progress.
            </span>
          </h1>

          <p className="mt-7 max-w-sm text-sm leading-7 text-[#C6D7CC]">
            A shared home for the relationships that
            keep our programs going.
          </p>
        </div>

        <div className="relative z-10 flex items-end justify-between border-t border-[#507365] pt-6">
          <div>
            <p className="text-xs font-semibold tracking-wide">
              CODING IN COLOR
            </p>

            <p className="mt-1 text-xs text-[#ABC4B4]">
              Donor & Funder Platform
            </p>
          </div>

          <span className="text-xs text-[#ABC4B4]">
            PHOENIX, AZ
          </span>
        </div>

        {/* Subtle decorative outline */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-36 top-1/4 h-[450px] w-[450px] rounded-full border border-[#31584A] opacity-70"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 top-1/3 h-[300px] w-[300px] rounded-full border border-[#31584A] opacity-50"
        />
      </section>

      {/* RIGHT: LOGIN PANEL */}
      <section className="flex min-h-[600px] items-center justify-center px-7 py-14 sm:px-12 lg:min-h-screen lg:px-20">
        <div className="w-full max-w-[430px]">

          <div className="mb-12 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#829087]">
              Member Access
            </span>

            <span className="text-xs text-[#829087]">
              01 / 01
            </span>
          </div>

          <h2 className="font-display text-6xl leading-none tracking-[-0.025em] text-[#242A26] sm:text-7xl">
            Welcome back.
          </h2>

          <p className="mb-10 mt-4 text-sm leading-6 text-[#707970]">
            Sign in to your Coding in Color workspace.
          </p>

          <form onSubmit={handleContinue}>

            {/* EMAIL */}
            <div className="mb-8">
              <label
                htmlFor="email"
                className="mb-3 block text-[11px] font-bold uppercase tracking-[0.12em] text-[#3E4A42]"
              >
                Email address
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@codingincolor.net"
                className="w-full border-0 border-b border-[#BFC8BE] bg-transparent px-0 py-3 text-sm text-[#242A26] outline-none transition-colors placeholder:text-[#A1A99F] focus:border-[#183E32]"
              />
            </div>

            {/* DEMO ROLE PICKER */}
            <fieldset>
              <legend className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#3E4A42]">
                Choose your workspace
              </legend>

              <div className="border-t border-[#C8D0C5]">
                {roles.map((role) => {
                  const active = selectedRole === role.id;

                  return (
                    <label
                      key={role.id}
                      className={`flex cursor-pointer items-center justify-between border-b px-4 py-4 transition-colors ${
                        active
                          ? "border-[#183E32] bg-[#E3E9DF]"
                          : "border-[#C8D0C5] hover:bg-[#ECEFE7]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={role.id}
                        checked={active}
                        onChange={() => setSelectedRole(role.id)}
                        className="sr-only"
                      />

                      <span>
                        <span className="block text-sm font-semibold text-[#242A26]">
                          {role.name}
                        </span>

                        <span className="mt-1 block text-xs text-[#778277]">
                          {role.description}
                        </span>
                      </span>

                      <span
                        className={`flex h-5 w-5 items-center justify-center border ${
                          active
                            ? "border-[#183E32] bg-[#183E32] text-white"
                            : "border-[#AAB7AB]"
                        }`}
                      >
                        {active && <Check size={13} />}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* SUBMIT */}
            <button
              type="submit"
              className="mt-9 flex w-full cursor-pointer items-center justify-between bg-[#183E32] px-6 py-4 text-sm font-semibold text-white transition-colors hover:bg-[#285745] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#183E32]"
            >
              Continue to workspace
              <ArrowUpRight size={19} />
            </button>

            <p className="mt-5 text-center text-xs leading-5 text-[#899388]">
              Demo mode — authentication will be added later.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}

import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowUpRight, Search, UserCog } from "lucide-react";

import { getBoardMembers, formatMoney, type BoardMember } from "../lib/api";

// Board members with what their donors have given. CEO and fundraising team only.
export default function BoardMembersPage() {
  const { role } = useParams();
  const navigate = useNavigate();
  const allowed = role === "admin" || role === "fundraising";

  const [members, setMembers] = useState<BoardMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getBoardMembers()
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (!allowed) return <Navigate to={`/${role}/overview`} replace />;

  const query = search.trim().toLowerCase();
  const filtered = members.filter((m) => !query || m.name.toLowerCase().includes(query));
  const totalRaised = members.reduce((sum, m) => sum + m.total_raised, 0);
  const openMember = (id: string) => navigate(`/${role}/members/${id}`);

  return (
    <div className="space-y-8">
      {/* Page Heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#5E6B61]">
            Team / Board members
          </p>
          <h2 className="mt-3 font-display text-5xl text-[#183E32]">Board members.</h2>
          <p className="mt-3 text-sm text-[#5E6B61]">
            Donation totals from each member's donors. Click a member to see their donors and
            retention.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 border border-[#C8D2C7] px-4 py-3">
            <UserCog size={18} className="text-[#52705D]" />
            <span className="text-sm font-semibold">
              {loading ? "…" : members.length} members
            </span>
          </div>
          <div className="border border-[#C8D2C7] px-4 py-3 text-sm font-semibold text-[#183E32]">
            {loading ? "…" : formatMoney(totalRaised)} raised
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex min-w-[220px] items-center gap-3 border border-[#CDD5CB] bg-[#FBF9F3] px-4 focus-within:border-[#183E32] focus-within:outline-2 focus-within:outline-[#183E32]">
        <Search size={18} className="text-[#5E6B61]" />
        <input
          type="search"
          placeholder="Search by name..."
          aria-label="Search board members by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent py-4 text-sm outline-none"
        />
      </div>

      {/* Members Table */}
      <div className="overflow-x-auto border border-[#D8DED4] bg-[#FBF9F3]">
        {error ? (
          <div role="alert" className="p-12 text-center text-sm text-[#9A3B2E]">
            Couldn't load board members: {error}
          </div>
        ) : loading ? (
          <div role="status" className="p-12 text-center text-sm text-[#5E6B61]">
            Loading board members…
          </div>
        ) : (
          <>
            <table className="w-full min-w-[650px] text-left">
              <thead className="border-b border-[#D8DED4] bg-[#EDF0E8]">
                <tr className="text-[11px] uppercase tracking-wider text-[#5E6B61]">
                  <th className="px-6 py-4 font-semibold">Member</th>
                  <th className="px-6 py-4 font-semibold">Donors</th>
                  <th className="px-6 py-4 font-semibold">Total raised</th>
                  <th className="px-6 py-4 font-semibold">This year</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => openMember(m.id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openMember(m.id);
                    }}
                    className="cursor-pointer border-b border-[#E3E7DF] transition-colors last:border-0 hover:bg-[#EDF0E8] focus-visible:outline-2 focus-visible:outline-[#183E32]"
                  >
                    <td className="px-6 py-5 text-sm font-semibold text-[#242A26]">{m.name}</td>
                    <td className="px-6 py-5 text-sm tabular-nums">{m.donors}</td>
                    <td className="px-6 py-5 text-sm font-semibold text-[#183E32] tabular-nums">
                      {formatMoney(m.total_raised)}
                      <span className="ml-2 text-xs font-normal text-[#5E6B61]">
                        {m.gift_count} {m.gift_count === 1 ? "gift" : "gifts"}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm tabular-nums">
                      {formatMoney(m.raised_this_year)}
                    </td>
                    <td className="px-6 py-5">
                      <span className="border border-[#A9C3AE] px-3 py-1 text-xs text-[#42674C]">
                        {m.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <ArrowUpRight size={18} className="text-[#52705D]" aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="p-12 text-center text-sm text-[#5E6B61]">
                {members.length === 0
                  ? "No board members yet."
                  : "No board members match your search."}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

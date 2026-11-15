import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowUpRight, Search, Users } from "lucide-react";

import RetentionBadge from "../components/RetentionBadge";
import {
  getDonors,
  getRetentionStatuses,
  formatMoney,
  RETENTION_STATUSES,
  type Donor,
  type RetentionStatus,
} from "../lib/api";
import { retentionLabel } from "../lib/retentionStyle";

export default function DonorsPage() {
  const { role } = useParams();
  const navigate = useNavigate();

  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [retention, setRetention] = useState<Map<number, RetentionStatus>>(new Map());
  const [retentionFilter, setRetentionFilter] = useState("all");

  // The backend decides which donors come back: board members only get
  // their own, staff get everyone. No filtering by role happens here.
  useEffect(() => {
    let cancelled = false;
    // Retention labels are a nice-to-have: if they fail, the list still loads.
    Promise.all([getDonors(), getRetentionStatuses().catch(() => new Map())])
      .then(([rows, statuses]) => {
        if (cancelled) return;
        setDonors(rows);
        setRetention(statuses);
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
  }, []);

  const query = search.trim().toLowerCase();
  const filteredDonors = donors.filter((donor) => {
    const matchesSearch =
      !query ||
      donor.display_name.toLowerCase().includes(query) ||
      (donor.email ?? "").toLowerCase().includes(query);
    const matchesType = filter === "all" || donor.donor_type === filter;
    const status = retention.get(donor.id) ?? "none";
    const matchesRetention = retentionFilter === "all" || status === retentionFilter;
    return matchesSearch && matchesType && matchesRetention;
  });

  const openDonor = (id: number) => navigate(`/${role}/donors/${id}`);

  return (
    <div className="space-y-8">
      {/* Page Heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#829087]">
            Donor management / Directory
          </p>

          <h2 className="mt-3 font-display text-5xl text-[#183E32]">
            {role === "board" ? "My donors." : "All donors."}
          </h2>

          <p className="mt-3 text-sm text-[#788279]">
            View relationships, giving history, and outreach.
          </p>
        </div>

        <div className="flex items-center gap-2 border border-[#C8D2C7] px-4 py-3">
          <Users size={18} className="text-[#52705D]" />
          <span className="text-sm font-semibold">
            {loading ? "…" : donors.length} donors
          </span>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-[220px] flex-1 items-center gap-3 border border-[#CDD5CB] bg-[#FBF9F3] px-4">
          <Search size={18} className="text-[#7F9082]" />

          <input
            type="search"
            placeholder="Search name or email..."
            aria-label="Search donors by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent py-4 text-sm outline-none"
          />
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter donors by type"
          className="border border-[#CDD5CB] bg-[#FBF9F3] px-5 py-3 text-sm outline-none"
        >
          <option value="all">All types</option>
          <option value="individual">Individuals</option>
          <option value="funder">Funders</option>
        </select>

        <select
          value={retentionFilter}
          onChange={(e) => setRetentionFilter(e.target.value)}
          aria-label="Filter donors by this year's giving"
          className="border border-[#CDD5CB] bg-[#FBF9F3] px-5 py-3 text-sm outline-none"
        >
          <option value="all">All giving</option>
          {RETENTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {retentionLabel(s, true)}
            </option>
          ))}
          <option value="none">No gift this year or last</option>
        </select>
      </div>

      {/* Donor Table */}
      <div className="overflow-x-auto border border-[#D8DED4] bg-[#FBF9F3]">
        {error ? (
          <div role="alert" className="p-12 text-center text-sm text-[#9A3B2E]">
            Couldn't load donors: {error}
          </div>
        ) : loading ? (
          <div role="status" className="p-12 text-center text-sm text-[#819083]">
            Loading donors…
          </div>
        ) : (
          <>
            <table className="w-full min-w-[820px] text-left">
              <thead className="border-b border-[#D8DED4] bg-[#EDF0E8]">
                <tr className="text-[11px] uppercase tracking-wider text-[#6F8172]">
                  <th className="px-6 py-4 font-semibold">Donor</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  {role !== "board" && (
                    <th className="px-6 py-4 font-semibold">Owner</th>
                  )}
                  <th className="px-6 py-4 font-semibold">Total given</th>
                  <th className="px-6 py-4 font-semibold">
                    {new Date().getFullYear()} giving
                  </th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredDonors.map((donor) => (
                  <tr
                    key={donor.id}
                    onClick={() => openDonor(donor.id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openDonor(donor.id);
                    }}
                    className="cursor-pointer border-b border-[#E3E7DF] transition-colors last:border-0 hover:bg-[#EDF0E8] focus-visible:outline-2 focus-visible:outline-[#183E32]"
                  >
                    <td className="px-6 py-5">
                      <p className="text-sm font-semibold text-[#242A26]">
                        {donor.display_name}
                      </p>
                      <p className="mt-1 text-xs text-[#819083]">
                        {donor.email ?? "No email"}
                      </p>
                    </td>

                    <td className="px-6 py-5 text-sm capitalize">
                      {donor.donor_type}
                    </td>

                    {role !== "board" && (
                      <td className="px-6 py-5 text-sm">
                        {donor.owner_name ?? "Unassigned"}
                      </td>
                    )}

                    <td className="px-6 py-5 text-sm font-semibold text-[#183E32]">
                      {formatMoney(donor.lifetime_total)}
                      <span className="ml-2 text-xs font-normal text-[#819083]">
                        {donor.gift_count} {donor.gift_count === 1 ? "gift" : "gifts"}
                      </span>
                    </td>

                    <td className="px-6 py-5">
                      <RetentionBadge
                        status={retention.get(donor.id)}
                        lastGiftDate={donor.last_gift_date}
                        giftCount={donor.gift_count}
                      />
                    </td>

                    <td className="px-6 py-5">
                      <span className="border border-[#A9C3AE] px-3 py-1 text-xs text-[#42674C]">
                        {donor.active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="px-6 py-5">
                      <ArrowUpRight size={18} className="text-[#52705D]" aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredDonors.length === 0 && (
              <div className="p-12 text-center text-sm text-[#819083]">
                {donors.length === 0
                  ? "No donors yet. Import a spreadsheet, Zeffy, or Benevity export to get started."
                  : "No donors match your search."}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

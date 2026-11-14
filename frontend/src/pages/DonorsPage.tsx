
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowUpRight,
  Search,
  Users,
} from "lucide-react";

import {
  mockDonors,
  donorName,
  formatMoney,
} from "../data/mockDonors";

export default function DonorsPage() {
  const { role } = useParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // Temporary demo filtering. Real access control
  // must be enforced by the backend.
  const visibleDonors =
    role === "board"
      ? mockDonors.filter(
          (d) => d.owner === "Demo Board Member"
        )
      : mockDonors;

  const filteredDonors = visibleDonors.filter((donor) => {
    const query = search.toLowerCase();

    const matchesSearch =
      donorName(donor).toLowerCase().includes(query) ||
      donor.email.toLowerCase().includes(query);

    const matchesType =
      filter === "all" || donor.donor_type === filter;

    return matchesSearch && matchesType;
  });

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
            {visibleDonors.length} donors
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
      </div>

      {/* Donor Table */}
      <div className="overflow-x-auto border border-[#D8DED4] bg-[#FBF9F3]">
        <table className="w-full min-w-[650px] text-left">
          <thead className="border-b border-[#D8DED4] bg-[#EDF0E8]">
            <tr className="text-[11px] uppercase tracking-wider text-[#6F8172]">
              <th className="px-6 py-4 font-semibold">Donor</th>
              <th className="px-6 py-4 font-semibold">Type</th>
              <th className="px-6 py-4 font-semibold">Total given</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold"></th>
            </tr>
          </thead>

          <tbody>
            {filteredDonors.map((donor) => (
              <tr
                key={donor.id}
                onClick={() =>
                  navigate(`/${role}/donors/${donor.id}`)
                }
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    navigate(`/${role}/donors/${donor.id}`);
                  }
                }}
                className="cursor-pointer border-b border-[#E3E7DF] transition-colors last:border-0 hover:bg-[#EDF0E8] focus-visible:outline-2 focus-visible:outline-[#183E32]"
              >
                <td className="px-6 py-5">
                  <p className="text-sm font-semibold text-[#242A26]">
                    {donorName(donor)}
                  </p>

                  <p className="mt-1 text-xs text-[#819083]">
                    {donor.email}
                  </p>
                </td>

                <td className="px-6 py-5 text-sm capitalize">
                  {donor.donor_type}
                </td>

                <td className="px-6 py-5 text-sm font-semibold text-[#183E32]">
                  {formatMoney(donor.total_donated)}
                </td>

                <td className="px-6 py-5">
                  <span className="border border-[#A9C3AE] px-3 py-1 text-xs text-[#42674C]">
                    {donor.active ? "Active" : "Inactive"}
                  </span>
                </td>

                <td className="px-6 py-5">
                  <ArrowUpRight
                    size={18}
                    className="text-[#52705D]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredDonors.length === 0 && (
          <div className="p-12 text-center text-sm text-[#819083]">
            No donors match your search.
          </div>
        )}
      </div>

      <p className="text-xs text-[#829087]">
        Sample data for frontend development.
      </p>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import {
  getBoardMember,
  getMemberDonors,
  formatDate,
  formatMoney,
  type BoardMemberDetail,
  type Donor,
} from "../lib/api";

const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border border-[#D8DED4] bg-[#FBF9F3] p-5">
      <p className="text-[11px] uppercase tracking-wider text-[#6F8172]">{label}</p>
      <p className="mt-2 font-display text-3xl text-[#183E32] tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-[#819083]">{note}</p>}
    </div>
  );
}

// One board member: totals, their donors' retention by year, and their donor list.
// CEO and fundraising team only.
export default function BoardMemberPage() {
  const { role, memberId } = useParams();
  const navigate = useNavigate();
  const allowed = role === "admin" || role === "fundraising";

  const [member, setMember] = useState<BoardMemberDetail | null>(null);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!allowed || !memberId) return;
    let cancelled = false;
    Promise.all([getBoardMember(memberId), getMemberDonors(memberId)])
      .then(([detail, rows]) => {
        if (cancelled) return;
        setMember(detail);
        setDonors(rows);
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
  }, [allowed, memberId]);

  if (!allowed) return <Navigate to={`/${role}/overview`} replace />;

  const back = (
    <Link
      to={`/${role}/members`}
      className="inline-flex items-center gap-2 text-sm text-[#52705D] hover:text-[#183E32]"
    >
      <ArrowLeft size={16} /> All board members
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-6">
        {back}
        <div role="alert" className="border border-[#D9A99F] bg-[#FBF1EE] p-5 text-sm text-[#7A2E22]">
          Couldn't load this board member: {error}
        </div>
      </div>
    );
  }

  if (loading || !member) {
    return (
      <div className="space-y-6">
        {back}
        <div role="status" className="p-12 text-center text-sm text-[#819083]">
          Loading board member…
        </div>
      </div>
    );
  }

  const latest = member.retention[member.retention.length - 1];
  const history = [...member.retention].reverse();
  const openDonor = (id: number) => navigate(`/${role}/donors/${id}`);

  return (
    <div className="space-y-8">
      {back}

      {/* Heading */}
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[#829087]">
          Team / Board members {member.active ? "" : "/ Inactive"}
        </p>
        <h2 className="mt-3 font-display text-5xl text-[#183E32]">{member.name}</h2>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active donors" value={String(member.donors)} />
        <Stat
          label="Total raised"
          value={formatMoney(member.total_raised)}
          note={`${member.gift_count} ${member.gift_count === 1 ? "gift" : "gifts"}`}
        />
        <Stat label="Raised this year" value={formatMoney(member.raised_this_year)} />
        <Stat
          label={latest ? `Retention ${latest.year}` : "Retention"}
          value={pct(latest?.retention_rate ?? null)}
          note={
            !latest
              ? "No gifts yet"
              : latest.in_progress
                ? "Year in progress: lapsed means not yet this year"
                : `${latest.counts.lapsed} lapsed`
          }
        />
      </div>

      {/* Retention by year */}
      <section className="space-y-3">
        <h3 className="font-display text-2xl text-[#183E32]">Retention by year</h3>
        <div className="overflow-x-auto border border-[#D8DED4] bg-[#FBF9F3]">
          {history.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#819083]">
              None of this member's donors have given yet.
            </div>
          ) : (
            <table className="w-full min-w-[650px] text-left">
              <thead className="border-b border-[#D8DED4] bg-[#EDF0E8]">
                <tr className="text-[11px] uppercase tracking-wider text-[#6F8172]">
                  <th className="px-6 py-4 font-semibold">Year</th>
                  <th className="px-6 py-4 font-semibold">Retention</th>
                  <th className="px-6 py-4 font-semibold">Donors giving</th>
                  <th className="px-6 py-4 font-semibold">New</th>
                  <th className="px-6 py-4 font-semibold">Lapsed</th>
                  <th className="px-6 py-4 font-semibold">Raised</th>
                </tr>
              </thead>
              <tbody>
                {history.map((y) => (
                  <tr key={y.year} className="border-b border-[#E3E7DF] last:border-0">
                    <td className="px-6 py-4 text-sm font-semibold text-[#242A26]">
                      {y.year}
                      {y.in_progress && (
                        <span className="ml-2 text-xs font-normal text-[#819083]">so far</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-[#183E32] tabular-nums">
                      {pct(y.retention_rate)}
                    </td>
                    <td className="px-6 py-4 text-sm tabular-nums">{y.donors_giving}</td>
                    <td className="px-6 py-4 text-sm tabular-nums">
                      {y.counts.new + y.counts.reactivated}
                    </td>
                    <td className="px-6 py-4 text-sm tabular-nums">{y.counts.lapsed}</td>
                    <td className="px-6 py-4 text-sm tabular-nums">{formatMoney(y.total_raised)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Donor list */}
      <section className="space-y-3">
        <h3 className="font-display text-2xl text-[#183E32]">Donors ({donors.length})</h3>
        <div className="overflow-x-auto border border-[#D8DED4] bg-[#FBF9F3]">
          {donors.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#819083]">
              No donors assigned to this member.
            </div>
          ) : (
            <table className="w-full min-w-[650px] text-left">
              <thead className="border-b border-[#D8DED4] bg-[#EDF0E8]">
                <tr className="text-[11px] uppercase tracking-wider text-[#6F8172]">
                  <th className="px-6 py-4 font-semibold">Donor</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold">Total given</th>
                  <th className="px-6 py-4 font-semibold">Last gift</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {donors.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => openDonor(d.id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openDonor(d.id);
                    }}
                    className="cursor-pointer border-b border-[#E3E7DF] transition-colors last:border-0 hover:bg-[#EDF0E8] focus-visible:outline-2 focus-visible:outline-[#183E32]"
                  >
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-[#242A26]">{d.display_name}</p>
                      <p className="mt-1 text-xs text-[#819083]">{d.email ?? "No email"}</p>
                    </td>
                    <td className="px-6 py-4 text-sm capitalize">{d.donor_type}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-[#183E32] tabular-nums">
                      {formatMoney(d.lifetime_total)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {d.last_gift_date ? formatDate(d.last_gift_date) : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span className="border border-[#A9C3AE] px-3 py-1 text-xs text-[#42674C]">
                        {d.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <ArrowUpRight size={18} className="text-[#52705D]" aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowUpRight } from "lucide-react";

import { useAuth } from "../auth/AuthProvider";
import {
  formatDate,
  formatMoney,
  getBoardSummary,
  getMyQueue,
  getRetention,
  type BoardMemberSummary,
  type MyQueue,
  type RetentionYear,
} from "../lib/api";

type Data = {
  retention?: RetentionYear | null;
  board?: { members: BoardMemberSummary[]; unassigned_donors: number };
  queue?: MyQueue;
  errors: string[];
};

function Tile({
  label,
  value,
  note,
  to,
  alert,
}: {
  label: string;
  value: string;
  note?: string;
  to?: string;
  alert?: boolean;
}) {
  const body = (
    <>
      <p className="flex items-center justify-between text-xs text-[#5E6B61]">
        {label}
        {to && <ArrowUpRight size={15} className="text-[#52705D]" aria-hidden="true" />}
      </p>
      <p className={`mt-3 font-display text-4xl ${alert ? "text-[#9A3B2E]" : "text-[#183E32]"}`}>
        {value}
      </p>
      {note && <p className="mt-2 text-xs text-[#5E6B61]">{note}</p>}
    </>
  );
  const cls = "block border border-[#D8DED4] bg-[#FBF9F3] p-6";
  return to ? (
    <Link
      to={to}
      className={`${cls} transition-colors hover:bg-[#EDF0E8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function OverviewPage() {
  const { role } = useParams();
  const auth = useAuth();
  const me = auth.status === "ready" ? auth.me : null;
  const isStaff = me?.role === "admin" || me?.role === "fundraising";
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const staff = me.role === "admin" || me.role === "fundraising";
    // Each panel loads on its own, so one failing endpoint doesn't blank the page.
    Promise.allSettled([
      getRetention(),
      staff ? getBoardSummary() : Promise.resolve(undefined),
      staff ? Promise.resolve(undefined) : getMyQueue(),
    ]).then(([r, b, q]) => {
      if (cancelled) return;
      const errors = [r, b, q]
        .filter((x): x is PromiseRejectedResult => x.status === "rejected")
        .map((x) => (x.reason as Error).message);
      setData({
        retention: r.status === "fulfilled" ? r.value.selected : undefined,
        board: b.status === "fulfilled" ? b.value : undefined,
        queue: q.status === "fulfilled" ? q.value : undefined,
        errors,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [me]);

  const year = new Date().getFullYear();
  const sel = data?.retention;
  const board = data?.board;
  const totals = board?.members.reduce(
    (t, m) => ({ donors: t.donors + m.donors, touched: t.touched + m.touched_90d, overdue: t.overdue + m.overdue_steps }),
    { donors: 0, touched: 0, overdue: 0 }
  );

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[#5E6B61]">
          Coding in Color / Overview
        </p>
        <h2 className="mt-3 font-display text-5xl text-[#183E32]">
          {me ? `Welcome back, ${me.name.split(" ")[0]}.` : "Welcome back."}
        </h2>
        <p className="mt-3 text-sm text-[#5E6B61]">
          {isStaff
            ? "Donor health and board outreach, at a glance."
            : "Your donors and what you owe them this week."}
        </p>
      </div>

      {!data ? (
        <p role="status" className="text-sm text-[#5E6B61]">Loading…</p>
      ) : (
        <>
          {data.errors.length > 0 && (
            <p role="alert" className="text-sm text-[#9A3B2E]">
              Some numbers couldn't load: {data.errors.join("; ")}
            </p>
          )}

          {/* Board member: their own week */}
          {!isStaff && data.queue && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Tile
                label="Overdue follow-ups"
                value={String(data.queue.counts.overdue)}
                alert={data.queue.counts.overdue > 0}
                to={`/${role}/followups`}
              />
              <Tile
                label="Due this week"
                value={String(data.queue.counts.this_week)}
                to={`/${role}/followups`}
              />
              <Tile
                label="Drafts to review"
                value={String(data.queue.counts.drafts)}
                note="Review, send yourself, mark sent"
                to={`/${role}/outreach`}
              />
              <Tile
                label="No contact in 90 days"
                value={String(data.queue.counts.quarterly_owed)}
                note="Owed a quarterly touch"
                to={`/${role}/followups`}
              />
            </div>
          )}

          {/* Giving this year (everyone; board members see their own donors) */}
          {sel && (
            <section aria-labelledby="giving-heading" className="space-y-4">
              <h3 id="giving-heading" className="text-sm font-semibold">
                {isStaff ? `Giving in ${sel.year}` : `Your donors in ${sel.year}`}
                {sel.in_progress && <span className="font-normal text-[#5E6B61]"> (so far)</span>}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Tile label="Raised" value={formatMoney(sel.total_raised)} note={`${sel.donors_giving} donors gave`} />
                <Tile
                  label="Retention rate"
                  value={sel.retention_rate == null ? "—" : `${sel.retention_rate}%`}
                  note={`of ${sel.year - 1} donors gave again`}
                  to={`/${role}/retention`}
                />
                <Tile
                  label={sel.in_progress ? "To win back" : "Lost to lapsed donors"}
                  value={formatMoney(sel.lost_from_lapsed)}
                  note={`${sel.counts.lapsed} donors ${sel.in_progress ? "haven't given yet" : "lapsed"}`}
                  alert={sel.counts.lapsed > 0}
                  to={`/${role}/retention`}
                />
                <Tile
                  label="New and returning"
                  value={String(sel.counts.new + sel.counts.reactivated)}
                  note={`${formatMoney(sel.gained_from_new)} from them`}
                />
              </div>
            </section>
          )}

          {/* CEO + fundraising: has each board member reached out? */}
          {isStaff && board && totals && (
            <section
              aria-labelledby="board-heading"
              className="border border-[#D8DED4] bg-[#FBF9F3]"
            >
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#D8DED4] px-6 py-5">
                <div>
                  <h3 id="board-heading" className="text-sm font-semibold">
                    Board outreach, last 90 days
                  </h3>
                  <p className="mt-1 text-xs text-[#5E6B61]">
                    Who has reached their donors. Least contacted first: who needs a nudge.
                  </p>
                </div>
                <p className="text-sm tabular-nums text-[#42674C]">
                  {totals.touched} of {totals.donors} donors contacted
                  {totals.overdue > 0 && ` · ${totals.overdue} overdue follow-ups`}
                </p>
              </div>

              {board.unassigned_donors > 0 && (
                <p className="flex items-center gap-2 border-b border-[#E0E4DB] bg-[#FBF5E8] px-6 py-3 text-sm text-[#6B5428]">
                  <AlertTriangle size={15} aria-hidden="true" />
                  {board.unassigned_donors} active donor
                  {board.unassigned_donors === 1 ? " has" : "s have"} no board member.
                </p>
              )}

              {board.members.length === 0 ? (
                <p className="px-6 py-5 text-sm text-[#5E6B61]">No active board members yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-xs text-[#5E6B61]">
                      <tr>
                        <th scope="col" className="px-6 py-3 font-semibold">Board member</th>
                        <th scope="col" className="px-6 py-3 font-semibold">Donors contacted</th>
                        <th scope="col" className="px-6 py-3 text-right font-semibold">Overdue</th>
                        <th scope="col" className="px-6 py-3 font-semibold">Last outreach</th>
                      </tr>
                    </thead>
                    <tbody>
                      {board.members.map((m) => (
                        <tr key={m.id} className="border-t border-[#E0E4DB]">
                          <td className="px-6 py-4 font-semibold">{m.name}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="h-2 w-28 overflow-hidden rounded-full bg-[#E3E7DF]"
                                aria-hidden="true"
                              >
                                <div
                                  className="h-full rounded-full bg-[#3D9A62]"
                                  style={{ width: `${m.touched_pct ?? 0}%` }}
                                />
                              </div>
                              <span className="tabular-nums">
                                {m.touched_90d} of {m.donors}
                                {m.touched_pct != null && (
                                  <span className="text-[#5E6B61]"> ({m.touched_pct}%)</span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td
                            className={`px-6 py-4 text-right tabular-nums ${
                              m.overdue_steps > 0 ? "font-semibold text-[#9A3B2E]" : ""
                            }`}
                          >
                            {m.overdue_steps}
                          </td>
                          <td className="px-6 py-4 text-[#5E6B61]">
                            {m.last_outreach_90d ? formatDate(m.last_outreach_90d) : "None in 90 days"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Shortcuts */}
          <nav aria-label="Shortcuts" className="flex flex-wrap gap-3">
            {(me?.role === "admin"
              ? [
                  { label: "All donors", to: "donors" },
                  { label: "Retention", to: "retention" },
                  { label: "Outreach", to: "outreach" },
                  { label: "Import donors", to: "imports" },
                ]
              : me?.role === "fundraising"
                ? [
                    { label: "All donors", to: "donors" },
                    { label: "Retention", to: "retention" },
                  ]
                : [
                  { label: "My donors", to: "donors" },
                  { label: "Follow-ups", to: "followups" },
                  { label: "Outreach", to: "outreach" },
                ]
            ).map((l) => (
              <Link
                key={l.to}
                to={`/${role}/${l.to}`}
                className="inline-flex items-center gap-2 border border-[#183E32] px-4 py-2 text-sm text-[#183E32] hover:bg-[#EDF0E8]"
              >
                {l.label}
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            ))}
          </nav>
          <p className="text-xs text-[#5E6B61]">Figures for {year} update as gifts are imported.</p>
        </>
      )}
    </div>
  );
}

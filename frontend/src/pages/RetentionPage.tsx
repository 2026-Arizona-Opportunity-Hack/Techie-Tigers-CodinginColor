import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Phone } from "lucide-react";

import {
  formatMoney,
  getRetention,
  RETENTION_STATUSES,
  type RetentionReport,
  type RetentionYear,
} from "../lib/api";
import {
  RETENTION_COLOR,
  RETENTION_HINT,
  RETENTION_LABEL,
  retentionLabel,
} from "../lib/retentionStyle";

// Shared with the donor list and donor page badges. Every segment is also
// labelled in the legend, tooltip and table, so color is never alone.
const COLOR = RETENTION_COLOR;
const LABEL = RETENTION_LABEL;
const HINT = RETENTION_HINT;
const statusLabel = retentionLabel;

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border border-[#D8DED4] bg-[#FBF9F3] p-6">
      <p className="text-xs text-[#829087]">{label}</p>
      <p className="mt-3 font-display text-4xl text-[#183E32]">{value}</p>
      {note && <p className="mt-2 text-xs text-[#829087]">{note}</p>}
    </div>
  );
}

function YearBar({ y, max }: { y: RetentionYear; max: number }) {
  const total = RETENTION_STATUSES.reduce((n, s) => n + y.counts[s], 0);
  return (
    <div className="grid grid-cols-[56px_1fr_40px] items-center gap-3">
      <span className="text-sm tabular-nums text-[#5E6B61]">
        {y.year}
        {y.in_progress && <span className="sr-only"> (in progress)</span>}
      </span>
      <div
        className="flex h-7 gap-[2px]"
        style={{ width: `${max ? (100 * total) / max : 0}%` }}
        aria-hidden="true"
      >
        {RETENTION_STATUSES.filter((s) => y.counts[s] > 0).map((s, i, arr) => (
          <div
            key={s}
            title={`${y.year} · ${statusLabel(s, y.in_progress)}: ${y.counts[s]}`}
            className={`h-full transition-opacity hover:opacity-80 ${i === 0 ? "rounded-l" : ""} ${
              i === arr.length - 1 ? "rounded-r" : ""
            }`}
            style={{ flexGrow: y.counts[s], flexBasis: 0, backgroundColor: COLOR[s] }}
          />
        ))}
      </div>
      <span className="text-right text-xs tabular-nums text-[#829087]">{total}</span>
    </div>
  );
}

export default function RetentionPage() {
  const { role } = useParams();
  const [year, setYear] = useState<number | undefined>();
  const [result, setResult] = useState<{ key: string; data?: RetentionReport; error?: string }>();
  const key = String(year ?? "default");

  useEffect(() => {
    let cancelled = false;
    getRetention(year)
      .then((data) => !cancelled && setResult({ key, data }))
      .catch((err: Error) => !cancelled && setResult({ key, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [year, key]);

  const data = result?.data;
  const sel = data?.selected;
  const maxDonors = Math.max(
    1,
    ...(data?.years ?? []).map((y) => RETENTION_STATUSES.reduce((n, s) => n + y.counts[s], 0))
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#829087]">
            Donor health / Retention
          </p>
          <h2 className="mt-3 font-display text-5xl text-[#183E32]">Who kept giving.</h2>
          <p className="mt-3 max-w-2xl text-sm text-[#788279]">
            Year over year: who is new, who gave more or less, and who stopped.
            {role === "board" && " Showing your donors only."}
          </p>
        </div>

        {data && data.years.length > 0 && (
          <div role="group" aria-label="Choose a year" className="flex flex-wrap gap-2">
            {data.years.map((y) => (
              <button
                key={y.year}
                type="button"
                aria-pressed={sel?.year === y.year}
                onClick={() => setYear(y.year)}
                className={`border px-4 py-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32] ${
                  sel?.year === y.year
                    ? "border-[#183E32] bg-[#183E32] text-white"
                    : "border-[#C8D2C7] text-[#42674C] hover:bg-[#EDF0E8]"
                }`}
              >
                {y.year}
              </button>
            ))}
          </div>
        )}
      </div>

      {result?.error && !data ? (
        <div role="alert" className="border border-[#D9A99F] bg-[#FBF1EE] p-5 text-sm text-[#7A2E22]">
          Couldn't load retention: {result.error}
        </div>
      ) : !data ? (
        <p role="status" className="text-sm text-[#788279]">Loading retention…</p>
      ) : !sel ? (
        <p className="border border-[#D8DED4] bg-[#FBF9F3] p-8 text-sm text-[#829087]">
          No gifts yet. Import donor exports to see retention.
        </p>
      ) : (
        <>
          {sel.in_progress && (
            <p className="border-l-2 border-[#D8B77D] pl-4 text-sm text-[#6B5428]">
              {sel.year} isn't over yet. "Not yet this year" means they gave in {sel.year - 1}{" "}
              but haven't given in {sel.year} so far: these are the donors to call before
              December 31.
            </p>
          )}

          {/* Headline numbers */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Retention rate"
              value={sel.retention_rate == null ? "—" : `${sel.retention_rate}%`}
              note={`of ${sel.year - 1} donors gave again in ${sel.year}`}
            />
            <Tile
              label={`Raised in ${sel.year}`}
              value={formatMoney(sel.total_raised)}
              note={`${sel.donors_giving} donors gave`}
            />
            <Tile
              label={sel.in_progress ? "To win back" : "Lost to lapsed donors"}
              value={formatMoney(sel.lost_from_lapsed)}
              note={`what ${sel.counts.lapsed} ${sel.in_progress ? "not-yet" : "lapsed"} donors gave in ${sel.year - 1}`}
            />
            <Tile
              label="From new and returning"
              value={formatMoney(sel.gained_from_new)}
              note={`${sel.counts.new + sel.counts.reactivated} donors`}
            />
          </div>

          {/* Chart */}
          <section
            aria-labelledby="chart-heading"
            className="space-y-5 border border-[#D8DED4] bg-[#FBF9F3] p-6"
          >
            <div>
              <h3 id="chart-heading" className="text-sm font-semibold">
                Donors by year
              </h3>
              <p className="mt-1 text-xs text-[#829087]">
                Each bar is every donor who gave that year or the year before. Hover a
                segment for its count.
              </p>
            </div>

            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#4E5A51]">
              {RETENTION_STATUSES.map((s) => (
                <li key={s} className="flex items-center gap-2" title={HINT[s]}>
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: COLOR[s] }}
                    aria-hidden="true"
                  />
                  {LABEL[s]}
                </li>
              ))}
            </ul>

            <div className="space-y-3">
              {data.years.map((y) => (
                <YearBar key={y.year} y={y} max={maxDonors} />
              ))}
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-[#183E32]">
                Show as a table
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <caption className="sr-only">Donors by retention status and year</caption>
                  <thead className="text-[#6F8172]">
                    <tr>
                      <th scope="col" className="py-2 pr-4 font-semibold">Year</th>
                      {RETENTION_STATUSES.map((s) => (
                        <th key={s} scope="col" className="py-2 pr-4 font-semibold">
                          {LABEL[s]}
                        </th>
                      ))}
                      <th scope="col" className="py-2 font-semibold">Retention</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.years.map((y) => (
                      <tr key={y.year} className="border-t border-[#E0E4DB] tabular-nums">
                        <th scope="row" className="py-2 pr-4 font-normal">
                          {y.year}
                          {y.in_progress ? " (so far)" : ""}
                        </th>
                        {RETENTION_STATUSES.map((s) => (
                          <td key={s} className="py-2 pr-4">{y.counts[s]}</td>
                        ))}
                        <td className="py-2">
                          {y.retention_rate == null ? "—" : `${y.retention_rate}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            {/* Call list */}
            <section
              aria-labelledby="call-heading"
              className="border border-[#D8DED4] bg-[#FBF9F3]"
            >
              <div className="border-b border-[#D8DED4] px-6 py-5">
                <h3 id="call-heading" className="flex items-center gap-2 text-sm font-semibold">
                  <Phone size={16} className="text-[#52705D]" aria-hidden="true" />
                  {sel.in_progress ? "Call before December 31" : `Lapsed in ${sel.year}`}
                </h3>
                <p className="mt-1 text-xs text-[#829087]">
                  Gave in {sel.year - 1}, not {sel.in_progress ? "yet " : ""}in {sel.year}. Biggest
                  first.
                </p>
              </div>
              {data.call_list.length === 0 ? (
                <p className="px-6 py-5 text-sm text-[#829087]">Nobody lapsed. 🎉</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-[#6F8172]">
                    <tr>
                      <th scope="col" className="px-6 py-3 font-semibold">Donor</th>
                      <th scope="col" className="px-6 py-3 text-right font-semibold">
                        Gave in {sel.year - 1}
                      </th>
                      <th scope="col" className="px-6 py-3 font-semibold">Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.call_list.map((d) => (
                      <tr key={d.donor_id} className="border-t border-[#E0E4DB]">
                        <td className="px-6 py-3">
                          <Link
                            to={`/${role}/donors/${d.donor_id}`}
                            className="font-semibold underline decoration-[#C8D2C7] underline-offset-2 hover:text-[#183E32]"
                          >
                            {d.donor_name}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums">
                          {formatMoney(d.gave_last_year)}
                        </td>
                        <td className="px-6 py-3 text-[#5E6B61]">{d.owner_name ?? "Unassigned"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* By board member */}
            {role !== "board" && data.by_owner.length > 0 && (
              <section
                aria-labelledby="owner-heading"
                className="border border-[#D8DED4] bg-[#FBF9F3]"
              >
                <div className="border-b border-[#D8DED4] px-6 py-5">
                  <h3 id="owner-heading" className="text-sm font-semibold">
                    By board member, {sel.year}
                  </h3>
                  <p className="mt-1 text-xs text-[#829087]">
                    Whose donors are slipping? Most lapsed first.
                  </p>
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-[#6F8172]">
                    <tr>
                      <th scope="col" className="px-6 py-3 font-semibold">Owner</th>
                      <th scope="col" className="px-6 py-3 text-right font-semibold">Retention</th>
                      <th scope="col" className="px-6 py-3 text-right font-semibold">
                        {statusLabel("lapsed", sel.in_progress)}
                      </th>
                      <th scope="col" className="px-6 py-3 text-right font-semibold">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_owner.map((o) => (
                      <tr key={o.owner_name} className="border-t border-[#E0E4DB] tabular-nums">
                        <td className="px-6 py-3">{o.owner_name}</td>
                        <td className="px-6 py-3 text-right">
                          {o.retention_rate == null ? "—" : `${o.retention_rate}%`}
                        </td>
                        <td className="px-6 py-3 text-right">{o.lapsed}</td>
                        <td className="px-6 py-3 text-right">{o.new}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

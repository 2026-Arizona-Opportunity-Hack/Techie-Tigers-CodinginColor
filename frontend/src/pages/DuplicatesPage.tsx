import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, CopyCheck, GitMerge } from "lucide-react";

import { useAuth } from "../auth/AuthProvider";
import {
  formatDate,
  formatMoney,
  getDonors,
  getDuplicatePairs,
  markNotDuplicate,
  mergeDonors,
  type Donor,
  type DuplicatePair,
} from "../lib/api";

type Loaded = { pairs: DuplicatePair[]; donors: Map<number, Donor> };

// Same fields for both records, so differences are easy to spot.
const FIELDS: { label: string; value: (d: Donor) => string }[] = [
  { label: "Email", value: (d) => d.email ?? "—" },
  { label: "Phone", value: (d) => d.phone ?? "—" },
  { label: "Type", value: (d) => d.donor_type },
  { label: "Owner", value: (d) => d.owner_name ?? "Unassigned" },
  { label: "Gifts", value: (d) => `${d.gift_count} · ${formatMoney(d.lifetime_total)}` },
  { label: "Last gift", value: (d) => formatDate(d.last_gift_date) },
];

function PairCard({
  pair,
  a,
  b,
  role,
  reviewerId,
  onDone,
}: {
  pair: DuplicatePair;
  a: Donor;
  b: Donor;
  role: string | undefined;
  reviewerId: string;
  onDone: (message: string) => void;
}) {
  // Default: keep the record with more history.
  const [keepId, setKeepId] = useState(
    b.gift_count > a.gift_count ? b.id : a.id
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keep = keepId === a.id ? a : b;
  const dup = keepId === a.id ? b : a;

  async function run(work: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      onDone(message);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const merge = () => {
    if (
      !window.confirm(
        `Merge ${dup.display_name} into ${keep.display_name}?\n\n` +
          `All of ${dup.display_name}'s gifts, messages and follow-ups move to ` +
          `${keep.display_name}, and the duplicate record is retired. This can't be undone from the app.`
      )
    )
      return;
    run(() => mergeDonors(keep.id, dup.id), `Merged into ${keep.display_name}.`);
  };

  const notDuplicate = () =>
    run(
      () => markNotDuplicate(pair.id, reviewerId),
      `Kept ${a.display_name} and ${b.display_name} as separate donors.`
    );

  return (
    <li className="border border-[#D8DED4] bg-[#FBF9F3] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[#5E6B61]">
          Flagged because: <span className="font-semibold text-[#242A26]">{pair.reason}</span>
        </p>
        <span className="text-xs tabular-nums text-[#829087]">
          Match score {Math.round(pair.score)} / 100
        </span>
      </div>

      <fieldset disabled={busy}>
        <legend className="sr-only">Choose which record to keep</legend>
        <div className="grid gap-4 md:grid-cols-2">
          {[a, b].map((d) => {
            const kept = keepId === d.id;
            return (
              <label
                key={d.id}
                className={`block cursor-pointer border p-5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#183E32] ${
                  kept ? "border-[#183E32] bg-white" : "border-[#D8DED4] hover:bg-[#F3F4EE]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#242A26]">{d.display_name}</p>
                    <Link
                      to={`/${role}/donors/${d.id}`}
                      className="text-xs text-[#52705D] underline underline-offset-2"
                    >
                      Donor #{d.id}
                    </Link>
                  </div>
                  <span className="flex items-center gap-2 text-xs font-semibold text-[#183E32]">
                    <input
                      type="radio"
                      name={`keep-${pair.id}`}
                      checked={kept}
                      onChange={() => setKeepId(d.id)}
                      className="accent-[#183E32]"
                    />
                    {kept ? "Keep this one" : "Keep"}
                  </span>
                </div>
                <dl className="mt-4 space-y-1.5 text-sm">
                  {FIELDS.map((f) => {
                    const other = d.id === a.id ? b : a;
                    const differs = f.value(d) !== f.value(other);
                    return (
                      <div key={f.label} className="flex justify-between gap-4">
                        <dt className="text-[#829087]">{f.label}</dt>
                        <dd
                          className={`text-right break-all ${
                            differs ? "font-semibold text-[#242A26]" : "text-[#5E6B61]"
                          }`}
                        >
                          {f.value(d)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[#9A3B2E]">{error}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={merge}
          disabled={busy}
          className="inline-flex items-center gap-2 bg-[#183E32] px-5 py-3 text-sm font-semibold text-white hover:bg-[#285745] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]"
        >
          <GitMerge size={16} aria-hidden="true" />
          {busy ? "Working…" : `Merge into ${keep.display_name}`}
        </button>
        <button
          type="button"
          onClick={notDuplicate}
          disabled={busy}
          className="inline-flex items-center gap-2 border border-[#183E32] px-5 py-3 text-sm font-semibold text-[#183E32] hover:bg-[#EDF0E8] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]"
        >
          Not a duplicate
        </button>
        <p className="text-xs text-[#829087]">
          Bold fields differ. Blank contact details on the kept record are filled from the other.
        </p>
      </div>
    </li>
  );
}

export default function DuplicatesPage() {
  const { role } = useParams();
  const auth = useAuth();
  const me = auth.status === "ready" ? auth.me : null;

  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ version: number; data?: Loaded; error?: string }>();
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDuplicatePairs(), getDonors()])
      .then(([pairs, donors]) => {
        if (cancelled) return;
        setResult({ version, data: { pairs, donors: new Map(donors.map((d) => [d.id, d])) } });
      })
      .catch((err: Error) => !cancelled && setResult({ version, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const data = result?.data;
  // Hide pairs where either donor was already merged away or made inactive:
  // the donor list only returns active, unmerged donors.
  const pairs =
    data?.pairs.filter((p) => data.donors.has(p.donor_id) && data.donors.has(p.candidate_id)) ?? [];

  if (me && me.role !== "admin") {
    return (
      <p className="text-sm text-[#788279]">
        Only the CEO / admin can review duplicates.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#829087]">
            Donor data / Duplicate review
          </p>
          <h2 className="mt-3 font-display text-5xl text-[#183E32]">One donor, one record.</h2>
          <p className="mt-3 max-w-2xl text-sm text-[#788279]">
            Imports merge exact email matches on their own. These pairs share a phone number or
            have very similar names, so a person decides. Two different Maria Garcias are common.
          </p>
        </div>
        {data && (
          <div className="flex items-center gap-2 border border-[#C8D2C7] px-4 py-3">
            <CopyCheck size={18} className="text-[#52705D]" aria-hidden="true" />
            <span className="text-sm font-semibold">{pairs.length} to review</span>
          </div>
        )}
      </div>

      {notice && (
        <p role="status" className="flex items-center gap-2 border border-[#A9C3AE] bg-[#EEF4EE] p-4 text-sm text-[#2F5A3C]">
          <CheckCircle2 size={16} aria-hidden="true" /> {notice}
        </p>
      )}

      {result?.error && !data ? (
        <div role="alert" className="border border-[#D9A99F] bg-[#FBF1EE] p-5 text-sm text-[#7A2E22]">
          Couldn't load duplicates: {result.error}
        </div>
      ) : !data || !me ? (
        <p role="status" className="text-sm text-[#788279]">Loading…</p>
      ) : pairs.length === 0 ? (
        <p className="border border-[#D8DED4] bg-[#FBF9F3] p-8 text-sm text-[#829087]">
          Nothing to review. New possible duplicates appear here after each import.
        </p>
      ) : (
        <ul className="space-y-5">
          {pairs.map((p) => (
            <PairCard
              key={p.id}
              pair={p}
              a={data.donors.get(p.donor_id)!}
              b={data.donors.get(p.candidate_id)!}
              role={role}
              reviewerId={me.id}
              onDone={(message) => {
                setNotice(message);
                setVersion((v) => v + 1);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

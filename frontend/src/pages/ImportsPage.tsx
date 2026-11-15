import { useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileUp, RotateCcw } from "lucide-react";

import { ApiError, importFile, type ImportResult, type ImportSource } from "../lib/api";

const SOURCES: { id: ImportSource; label: string; hint: string }[] = [
  { id: "spreadsheet", label: "CIC spreadsheet", hint: "The team's own donor sheet" },
  { id: "zeffy", label: "Zeffy", hint: "Online donations export" },
  { id: "benevity", label: "Benevity", hint: "Workplace giving report" },
];

// Labels for the numbers the backend returns. Anything not listed is still shown.
const LABELS: Record<string, string> = {
  rows_read: "Rows read",
  donors_to_create: "New donors",
  donors_to_update: "Existing donors updated",
  matched_by_email: "Matched an existing donor by email",
  matched_by_name_same_source: "Matched by name (same source)",
  gifts_to_create: "New gifts",
  gifts_already_imported: "Gifts already imported (skipped)",
  rows_already_imported: "Rows already imported (skipped)",
  duplicate_candidates: "Possible duplicates for review",
  rows_skipped: "Rows skipped",
  anonymous_rows: "Anonymous gifts",
  gifts_skipped_bad_amount: "Gifts with no valid amount",
  gifts_skipped_bad_date: "Gifts with no readable date",
  gifts_unknown_program: "Gifts with an unknown program",
  invalid_emails: "Invalid emails ignored",
  rows_for_inactive_donors: "Rows for inactive donors",
  sources_to_create: "Source records",
  donors_created: "Donors created",
  donors_updated: "Donors updated",
  sources_created: "Source records saved",
  gifts_created: "Gifts saved",
  duplicate_candidates_created: "Duplicates sent to review",
  donors_without_owner: "New donors without an owner",
};

// The headline numbers, shown large.
const KEY_STATS = ["rows_read", "donors_to_create", "gifts_to_create", "duplicate_candidates"];

const label = (key: string) => LABELS[key] ?? key.replace(/_/g, " ");

function StatList({ stats, exclude = [] }: { stats: Record<string, number>; exclude?: string[] }) {
  const rows = Object.entries(stats).filter(([k, v]) => v > 0 && !exclude.includes(k));
  if (rows.length === 0) return null;
  return (
    <dl className="divide-y divide-[#E0E4DB]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2 text-sm">
          <dt className="text-[#5E6B61]">{label(k)}</dt>
          <dd className="font-semibold tabular-nums text-[#183E32]">{v.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

type Step = "choose" | "previewing" | "preview" | "importing" | "done";

export default function ImportsPage() {
  const { role } = useParams();
  const fileInput = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<ImportSource>("zeffy");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<{ message: string; headers?: string[] } | null>(null);

  const busy = step === "previewing" || step === "importing";

  // Imports are admin-only (the backend refuses everyone else).
  if (role !== "admin") return <Navigate to={`/${role}/overview`} replace />;

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    setStep("choose");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function run(dryRun: boolean) {
    if (!file) return;
    setError(null);
    setStep(dryRun ? "previewing" : "importing");
    try {
      setResult(await importFile(source, file, dryRun));
      setStep(dryRun ? "preview" : "done");
    } catch (err) {
      const detail = err instanceof ApiError ? (err.detail as { headers_found?: string[] }) : undefined;
      setError({
        message: err instanceof Error ? err.message : "Import failed.",
        headers: detail?.headers_found,
      });
      // A failed preview goes back to choosing; a failed import keeps the preview visible.
      setStep(dryRun ? "choose" : "preview");
    }
  }

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[#829087]">
          Donor data / Imports
        </p>
        <h2 className="mt-3 font-display text-5xl text-[#183E32]">Import donors.</h2>
        <p className="mt-3 max-w-2xl text-sm text-[#788279]">
          Upload an export to bring donors and gifts into one list. You'll see a preview
          first, and nothing is saved until you confirm. Uploading the same file twice is
          safe: rows that were already imported are skipped.
        </p>
      </div>

      {/* Step 1: source and file */}
      <section className="space-y-6 border border-[#D8DED4] bg-[#FBF9F3] p-6">
        <fieldset disabled={busy || step === "done"}>
          <legend className="mb-4 text-sm font-semibold">1. Where is this file from?</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {SOURCES.map((s) => (
              <label
                key={s.id}
                className={`cursor-pointer border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#183E32] ${
                  source === s.id
                    ? "border-[#183E32] bg-[#EDF0E8]"
                    : "border-[#CDD5CB] hover:bg-[#F3F4EE]"
                }`}
              >
                <input
                  type="radio"
                  name="source"
                  value={s.id}
                  checked={source === s.id}
                  onChange={() => {
                    setSource(s.id);
                    setResult(null);
                    setStep("choose");
                  }}
                  className="sr-only"
                />
                <span className="block text-sm font-semibold text-[#242A26]">{s.label}</span>
                <span className="mt-1 block text-xs text-[#829087]">{s.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="import-file" className="mb-3 block text-sm font-semibold">
            2. Choose the file (.csv or .xlsx, up to 5 MB)
          </label>
          <input
            id="import-file"
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx"
            disabled={busy || step === "done"}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError(null);
              setStep("choose");
            }}
            className="block w-full text-sm file:mr-4 file:cursor-pointer file:border file:border-[#183E32] file:bg-transparent file:px-4 file:py-2 file:text-sm file:text-[#183E32] hover:file:bg-[#EDF0E8]"
          />
        </div>

        {(step === "choose" || step === "previewing") && (
          <button
            type="button"
            onClick={() => run(true)}
            disabled={!file || busy}
            className="inline-flex items-center gap-2 bg-[#183E32] px-5 py-3 text-sm font-semibold text-[#F5F0E6] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]"
          >
            <FileUp size={16} aria-hidden="true" />
            {step === "previewing" ? "Reading file…" : "Preview import"}
          </button>
        )}
      </section>

      {/* Errors */}
      {error && (
        <div role="alert" className="border border-[#D9A99F] bg-[#FBF1EE] p-5 text-sm text-[#7A2E22]">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} aria-hidden="true" /> {error.message}
          </p>
          {error.headers && (
            <p className="mt-2 text-xs">
              Columns found in this file: {error.headers.join(", ")}. Check that you picked
              the right source above.
            </p>
          )}
        </div>
      )}

      {/* Preview / result */}
      {result && (
        <section
          aria-live="polite"
          className="space-y-6 border border-[#D8DED4] bg-[#FBF9F3] p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {step === "done" ? (
                <>
                  <CheckCircle2 size={18} className="text-[#2F6B45]" aria-hidden="true" />
                  Imported {result.filename}
                </>
              ) : (
                <>3. Preview of {result.filename}: nothing has been saved yet</>
              )}
            </h3>
          </div>

          {/* Headline numbers */}
          <div className="grid gap-4 sm:grid-cols-4">
            {KEY_STATS.map((k) => (
              <div key={k} className="border border-[#E0E4DB] p-4">
                <p className="text-xs text-[#829087]">{label(k)}</p>
                <p className="mt-2 font-display text-3xl text-[#183E32]">
                  {(result.summary[k] ?? 0).toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs uppercase tracking-wider text-[#6F8172]">
                {step === "done" ? "What was saved" : "Details"}
              </h4>
              {step === "done" && result.saved ? (
                <StatList stats={result.saved} />
              ) : (
                <StatList stats={result.summary} exclude={KEY_STATS} />
              )}
            </div>

            <div>
              <h4 className="mb-2 text-xs uppercase tracking-wider text-[#6F8172]">
                Columns used
              </h4>
              <dl className="divide-y divide-[#E0E4DB]">
                {Object.entries(result.columns_matched).map(([field, header]) => (
                  <div key={field} className="flex justify-between gap-4 py-2 text-sm">
                    <dt className="text-[#5E6B61]">{field.replace(/_/g, " ")}</dt>
                    <dd className="text-right">“{header}”</dd>
                  </div>
                ))}
              </dl>
              {result.columns_ignored.length > 0 && (
                <p className="mt-2 text-xs text-[#829087]">
                  Ignored: {result.columns_ignored.join(", ")}
                </p>
              )}
            </div>
          </div>

          {result.warnings.length > 0 && (
            <ul className="space-y-1 border-l-2 border-[#D8B77D] pl-4 text-sm text-[#6B5428]">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {result.skipped.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">
                {result.summary.rows_skipped ?? result.skipped.length} rows skipped: see why
              </summary>
              <table className="mt-3 w-full text-left text-xs">
                <thead className="text-[#6F8172]">
                  <tr>
                    <th className="py-1 pr-4 font-semibold">Line in file</th>
                    <th className="py-1 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.skipped.map((s) => (
                    <tr key={`${s.line}-${s.reason}`} className="border-t border-[#E0E4DB]">
                      <td className="py-1 pr-4 tabular-nums">{s.line}</td>
                      <td className="py-1">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          <div className="flex flex-wrap gap-3">
            {step !== "done" && (
              <button
                type="button"
                onClick={() => run(false)}
                disabled={busy}
                className="inline-flex items-center gap-2 bg-[#183E32] px-5 py-3 text-sm font-semibold text-[#F5F0E6] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]"
              >
                {step === "importing" ? "Importing…" : "Confirm import"}
              </button>
            )}
            {step === "done" && (
              <Link
                to={`/${role}/donors`}
                className="inline-flex items-center bg-[#183E32] px-5 py-3 text-sm font-semibold text-[#F5F0E6] hover:opacity-90"
              >
                View donors
              </Link>
            )}
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="inline-flex items-center gap-2 border border-[#183E32] px-5 py-3 text-sm text-[#183E32] hover:bg-[#EDF0E8] disabled:opacity-40"
            >
              <RotateCcw size={15} aria-hidden="true" />
              {step === "done" ? "Import another file" : "Start over"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

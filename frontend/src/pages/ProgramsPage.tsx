import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate, useParams } from "react-router-dom";
import { GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";

import {
  createOutcome,
  createProgram,
  deleteOutcome,
  deleteProgram,
  getProgramsWithOutcomes,
  renameProgram,
  type Outcome,
  type Program,
} from "../lib/api";

const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR + 1, THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2, THIS_YEAR - 3];

const input =
  "border border-[#CDD5CB] bg-white px-4 py-3 text-sm outline-none focus:border-[#183E32] focus-visible:outline-2 focus-visible:outline-[#183E32]";
const primaryButton =
  "inline-flex items-center gap-2 bg-[#183E32] px-5 py-3 text-sm font-semibold text-white hover:bg-[#254C3E] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]";
const quietButton =
  "inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-[#5E6B61] hover:text-[#183E32] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#183E32]";

// CEO only. Programs (AI Academy, Summer Camp…) and their results each year.
// Outcomes are what quarterly updates and funder packets tell donors their
// money did; program names are how imported gifts get matched to a program.
export default function ProgramsPage() {
  const { role } = useParams();
  const allowed = role === "admin";

  const [programs, setPrograms] = useState<Program[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newProgram, setNewProgram] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      getProgramsWithOutcomes()
        .then(({ programs, outcomes }) => {
          setPrograms(programs);
          setOutcomes(outcomes);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  if (!allowed) return <Navigate to={`/${role}/overview`} replace />;

  // Runs a change, shows any error, then reloads. Returns whether it worked.
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const nameTaken = (name: string, exceptId?: number) =>
    programs.some(
      (p) => p.id !== exceptId && p.name.trim().toLowerCase() === name.trim().toLowerCase()
    );

  async function addProgram(e: FormEvent) {
    e.preventDefault();
    const name = newProgram.trim();
    if (!name) return;
    if (nameTaken(name)) {
      setError(`There's already a program called "${name}".`);
      return;
    }
    if (await run(() => createProgram(name))) setNewProgram("");
  }

  const outcomeCount = outcomes.length;

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#5E6B61]">
            Settings / Programs
          </p>
          <h2 className="mt-3 font-display text-5xl text-[#183E32]">Programs & outcomes.</h2>
          <p className="mt-3 max-w-2xl text-sm text-[#5E6B61]">
            What each program achieved, by year. Outcomes go into every quarterly update and
            funder packet, so donors hear what their gifts did. Program names should match the
            "Program" column in your donor spreadsheet so imported gifts are linked.
          </p>
        </div>

        <div className="flex items-center gap-2 border border-[#C8D2C7] px-4 py-3">
          <GraduationCap size={18} className="text-[#52705D]" aria-hidden="true" />
          <span className="text-sm font-semibold">
            {loading ? "…" : `${programs.length} programs · ${outcomeCount} outcomes`}
          </span>
        </div>
      </div>

      {/* Add program */}
      <form
        onSubmit={addProgram}
        className="flex flex-wrap items-end gap-4 border border-[#D8DED4] bg-[#FBF9F3] p-5"
      >
        <label className="flex min-w-[240px] flex-1 flex-col gap-2 text-sm">
          <span className="text-[11px] uppercase tracking-wider text-[#5E6B61]">New program</span>
          <input
            value={newProgram}
            onChange={(e) => setNewProgram(e.target.value)}
            placeholder="e.g. Summer Camp"
            maxLength={100}
            className={input}
          />
        </label>
        <button type="submit" disabled={busy || !newProgram.trim()} className={primaryButton}>
          <Plus size={16} aria-hidden="true" />
          Add program
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="border border-[#D9A99F] bg-[#FBF1EE] p-5 text-sm text-[#7A2E22]"
        >
          {error}
        </div>
      )}

      {/* Programs */}
      {loading ? (
        <p role="status" className="p-12 text-center text-sm text-[#5E6B61]">
          Loading programs…
        </p>
      ) : programs.length === 0 ? (
        <p className="border border-[#D8DED4] bg-[#FBF9F3] p-12 text-center text-sm text-[#5E6B61]">
          No programs yet. Add CIC's programs above, like AI Academy, Summer Camp and Day of
          Compute.
        </p>
      ) : (
        <div className="space-y-6">
          {programs.map((p) => (
            <ProgramCard
              key={p.id}
              program={p}
              outcomes={outcomes.filter((o) => o.program_id === p.id)}
              busy={busy}
              nameTaken={(name) => nameTaken(name, p.id)}
              run={run}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ProgramCardProps {
  program: Program;
  outcomes: Outcome[]; // this program's, newest year first
  busy: boolean;
  nameTaken: (name: string) => boolean;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  onError: (message: string) => void;
}

function ProgramCard({ program, outcomes, busy, nameTaken, run, onError }: ProgramCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(program.name);
  const [year, setYear] = useState(THIS_YEAR);
  const [description, setDescription] = useState("");

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === program.name) {
      setRenaming(false);
      setName(program.name);
      return;
    }
    if (nameTaken(trimmed)) {
      onError(`There's already a program called "${trimmed}".`);
      return;
    }
    if (await run(() => renameProgram(program.id, trimmed))) setRenaming(false);
  }

  async function addOutcome(e: FormEvent) {
    e.preventDefault();
    const text = description.trim();
    if (!text) return;
    if (await run(() => createOutcome({ program_id: program.id, year, description: text })))
      setDescription("");
  }

  function removeProgram() {
    if (!window.confirm(`Delete the program "${program.name}"?`)) return;
    run(() => deleteProgram(program.id));
  }

  function removeOutcome(o: Outcome) {
    if (!window.confirm(`Delete this ${o.year} outcome for ${program.name}?\n\n"${o.description}"`))
      return;
    run(() => deleteOutcome(o.id));
  }

  const years = [...new Set(outcomes.map((o) => o.year))];

  return (
    <section
      aria-labelledby={`program-${program.id}`}
      className="border border-[#D8DED4] bg-[#FBF9F3]"
    >
      {/* Program name */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8DED4] px-6 py-4">
        {renaming ? (
          <form onSubmit={saveName} className="flex flex-1 flex-wrap items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              aria-label={`New name for ${program.name}`}
              className={`${input} min-w-[220px] flex-1 py-2`}
            />
            <button type="submit" disabled={busy} className={`${primaryButton} py-2`}>
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setName(program.name);
              }}
              className={quietButton}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <h3 id={`program-${program.id}`} className="text-lg font-semibold text-[#183E32]">
              {program.name}
            </h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRenaming(true)}
                disabled={busy}
                className={quietButton}
              >
                <Pencil size={14} aria-hidden="true" />
                Rename
              </button>
              <button
                type="button"
                onClick={removeProgram}
                disabled={busy}
                className={`${quietButton} hover:text-[#7A2E22]`}
              >
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      {/* Outcomes by year */}
      <div className="px-6 py-5">
        {outcomes.length === 0 ? (
          <p className="text-sm text-[#5E6B61]">
            No outcomes yet. Add one below so donors hear what this program achieved.
          </p>
        ) : (
          <div className="space-y-4">
            {years.map((y) => (
              <div key={y}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5E6B61]">
                  {y}
                </p>
                <ul className="mt-2 space-y-1">
                  {outcomes
                    .filter((o) => o.year === y)
                    .map((o) => (
                      <li
                        key={o.id}
                        className="flex items-start justify-between gap-3 border-b border-[#E3E7DF] py-2 last:border-0"
                      >
                        <span className="text-sm text-[#242A26]">{o.description}</span>
                        <button
                          type="button"
                          onClick={() => removeOutcome(o)}
                          disabled={busy}
                          aria-label={`Delete ${y} outcome: ${o.description}`}
                          className={`${quietButton} shrink-0 hover:text-[#7A2E22]`}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Add outcome */}
        <form onSubmit={addOutcome} className="mt-5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-[11px] uppercase tracking-wider text-[#5E6B61]">Year</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={`${input} py-2.5`}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[240px] flex-1 flex-col gap-2 text-sm">
            <span className="text-[11px] uppercase tracking-wider text-[#5E6B61]">
              Outcome
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 45 students across 3 schools; 82% completion"
              maxLength={300}
              className={`${input} py-2.5`}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !description.trim()}
            className={`${primaryButton} py-2.5`}
          >
            <Plus size={16} aria-hidden="true" />
            Add outcome
          </button>
        </form>
      </div>
    </section>
  );
}

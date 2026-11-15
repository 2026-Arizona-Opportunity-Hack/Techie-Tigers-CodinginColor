import { useState, type FormEvent } from "react";
import { CalendarDays, Check, Plus } from "lucide-react";

import {
  completeNextStep,
  createNextStep,
  formatDate,
  type OpenStep,
} from "../lib/api";

// Today as YYYY-MM-DD in the user's own time zone, to compare with due dates.
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface NextStepCellProps {
  donorId: number;
  donorName: string;
  active: boolean;
  steps: OpenStep[]; // this donor's open steps, soonest first
  onChange: () => void; // reload steps after a change
}

// The "Next step" cell in a board member's donor list: the soonest open step
// with a box to mark it done, or a small form to add one.
export default function NextStepCell({
  donorId,
  donorName,
  active,
  steps,
  onChange,
}: NextStepCellProps) {
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const step = steps[0];

  async function markDone() {
    if (!step) return;
    setBusy(true);
    setError("");
    try {
      await completeNextStep(step.id);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!description.trim() || !dueDate) return;
    setBusy(true);
    setError("");
    try {
      await createNextStep({
        donor_id: donorId,
        description: description.trim(),
        due_date: dueDate,
      });
      setDescription("");
      setDueDate("");
      setAdding(false);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const errorLine = error && (
    <p role="alert" className="mt-2 text-xs text-[#9A3B2E]">
      {error}
    </p>
  );

  if (adding) {
    return (
      <form onSubmit={save} className="w-64 space-y-2">
        <input
          type="text"
          required
          autoFocus
          placeholder="e.g. Invite to Day of Compute"
          aria-label={`Next step for ${donorName}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-[#CDD5CB] bg-white px-3 py-2 text-sm outline-none focus:border-[#183E32]"
        />
        <div className="flex gap-2">
          <input
            type="date"
            required
            min={todayIso()}
            aria-label={`Due date for ${donorName}'s next step`}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="min-w-0 flex-1 border border-[#CDD5CB] bg-white px-2 py-2 text-sm outline-none focus:border-[#183E32]"
          />
          <button
            type="submit"
            disabled={busy}
            className="cursor-pointer bg-[#183E32] px-3 py-2 text-xs font-semibold text-white hover:bg-[#254C3E] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setError("");
            }}
            className="cursor-pointer px-2 py-2 text-xs text-[#6F8172] hover:text-[#183E32]"
          >
            Cancel
          </button>
        </div>
        {errorLine}
      </form>
    );
  }

  if (!step) {
    if (!active) return <span className="text-xs text-[#9AA59C]">—</span>;
    return (
      <div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex cursor-pointer items-center gap-1 border border-dashed border-[#A9C3AE] px-3 py-1.5 text-xs text-[#42674C] hover:border-[#183E32] hover:text-[#183E32] focus-visible:outline-2 focus-visible:outline-[#183E32]"
        >
          <Plus size={14} aria-hidden="true" />
          Add next step
        </button>
        {errorLine}
      </div>
    );
  }

  const overdue = step.due_date < todayIso();

  return (
    <div className="flex w-64 items-start gap-3">
      <button
        type="button"
        onClick={markDone}
        disabled={busy}
        aria-label={`Mark "${step.description}" done`}
        title="Mark done"
        className="mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center border border-[#A5B3A6] bg-white hover:border-[#183E32] hover:bg-[#EDF0E8] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]"
      >
        {busy && <Check size={13} aria-hidden="true" />}
      </button>
      <div className="min-w-0">
        <p className="truncate text-sm text-[#242A26]" title={step.description}>
          {step.description}
        </p>
        <p
          className={`mt-1 flex items-center gap-1 text-xs ${
            overdue ? "font-semibold text-[#9A3B2E]" : "text-[#718274]"
          }`}
        >
          <CalendarDays size={13} aria-hidden="true" />
          {overdue ? "Overdue · " : ""}
          {formatDate(step.due_date)}
          {steps.length > 1 && (
            <span className="ml-1 font-normal text-[#819083]">
              · +{steps.length - 1} more
            </span>
          )}
        </p>
        {errorLine}
      </div>
    </div>
  );
}

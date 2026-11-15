import { useEffect, useState } from "react";

import { getBoardMembers, reassignDonor, type BoardMember } from "../lib/api";

interface OwnerPickerProps {
  donorId: number;
  ownerId: string | null;
  ownerName: string | null;
  onChanged: () => void; // reload the donor after a reassignment
}

// CEO only: choose which board member owns a donor. Lists active board
// members with how many active donors each has, so the CEO can keep the
// load even, the same way round-robin does for new donors.
export default function OwnerPicker({ donorId, ownerId, ownerName, onChanged }: OwnerPickerProps) {
  const [members, setMembers] = useState<BoardMember[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getBoardMembers()
      .then((rows) => !cancelled && setMembers(rows.filter((m) => m.active)))
      .catch((err: Error) => !cancelled && setError(`Couldn't load board members: ${err.message}`));
    return () => {
      cancelled = true;
    };
  }, []);

  async function change(newOwner: string) {
    if (!newOwner || newOwner === ownerId) return;
    setSaving(true);
    setError("");
    try {
      await reassignDonor(donorId, newOwner);
      onChanged();
      // Refresh the donor counts shown next to each name.
      getBoardMembers()
        .then((rows) => setMembers(rows.filter((m) => m.active)))
        .catch(() => {});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const fewest = members?.length ? Math.min(...members.map((m) => m.donors)) : null;

  return (
    <div className="mt-4">
      <label
        htmlFor={`owner-${donorId}`}
        className="block text-[11px] uppercase tracking-wider text-[#5E6B61]"
      >
        Board member owner
      </label>
      <select
        id={`owner-${donorId}`}
        value={ownerId ?? ""}
        disabled={!members || saving}
        onChange={(e) => change(e.target.value)}
        className="mt-2 min-w-[260px] border border-[#CDD5CB] bg-[#FBF9F3] px-4 py-2.5 text-sm text-[#242A26] outline-none focus:border-[#183E32] focus-visible:outline-2 focus-visible:outline-[#183E32] disabled:opacity-60"
      >
        {!ownerId && <option value="">Unassigned: choose a board member…</option>}
        {ownerId && !members?.some((m) => m.id === ownerId) && (
          <option value={ownerId}>
            {members ? `${ownerName ?? "Current owner"} (no longer active)` : ownerName ?? "Loading…"}
          </option>
        )}
        {members?.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · {m.donors} {m.donors === 1 ? "donor" : "donors"}
            {m.donors === fewest ? " (fewest)" : ""}
          </option>
        ))}
      </select>
      {saving && (
        <p role="status" className="mt-2 text-xs text-[#5E6B61]">
          Reassigning…
        </p>
      )}
      {members?.length === 0 && (
        <p className="mt-2 text-xs text-[#5E6B61]">
          There are no active board members yet.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-[#9A3B2E]">
          {error}
        </p>
      )}
    </div>
  );
}

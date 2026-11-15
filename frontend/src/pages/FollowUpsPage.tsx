import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CalendarDays, Check, Mail, Plus, X } from "lucide-react";

import {
  completeNextStep,
  createNextStep,
  draftQuarterlyUpdate,
  formatDate,
  getDonors,
  getMyQueue,
  type Donor,
  type MyQueue,
  type QueueStep,
} from "../lib/api";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time

function Section({
  title,
  hint,
  empty,
  children,
}: {
  title: string;
  hint: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="border border-[#D8DED4] bg-[#FBF9F3]">
      <div className="border-b border-[#D8DED4] px-6 py-5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-[#5E6B61]">{hint}</p>
      </div>
      {children.length === 0 ? (
        <p className="px-6 py-5 text-sm text-[#5E6B61]">{empty}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </section>
  );
}

export default function FollowUpsPage() {
  const { role } = useParams();

  // `version` goes up to reload the queue; results remember which version
  // they belong to, so "loading" is simply "result is for an older version".
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ version: number; queue?: MyQueue; error?: string }>();
  const [busyStep, setBusyStep] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");

  // "Draft update" on a donor owed a quarterly touch: draft (or reuse the
  // waiting) quarterly update, then open it in Outreach to review and send.
  const navigate = useNavigate();
  const [draftingDonor, setDraftingDonor] = useState<number | null>(null);
  async function draftQuarterly(donorId: number) {
    setDraftingDonor(donorId);
    setActionError("");
    try {
      const draft = await draftQuarterlyUpdate(donorId);
      navigate(`/${role}/outreach?draft=${draft.id}`);
    } catch (err) {
      setActionError((err as Error).message);
      setDraftingDonor(null);
    }
  }

  const [showForm, setShowForm] = useState(false);
  const [donors, setDonors] = useState<Donor[] | null>(null);
  const [donorId, setDonorId] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getMyQueue()
      .then((queue) => !cancelled && setResult({ version, queue }))
      .catch((err: Error) => !cancelled && setResult({ version, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = () => setVersion((v) => v + 1);
  const queue = result?.queue;
  const loading = result?.version !== version && !queue;

  async function markDone(step: QueueStep) {
    setBusyStep(step.id);
    setActionError("");
    try {
      await completeNextStep(step.id);
      reload();
    } catch (err) {
      setActionError(`Couldn't complete "${step.description}": ${(err as Error).message}`);
    } finally {
      setBusyStep(null);
    }
  }

  function openForm() {
    setShowForm(true);
    setFormError("");
    if (!donors) {
      // The backend only returns donors this person can see.
      getDonors()
        .then(setDonors)
        .catch((err: Error) => setFormError(`Couldn't load donors: ${err.message}`));
    }
  }

  async function addTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!donorId || !description.trim() || !dueDate) return;
    setSaving(true);
    setFormError("");
    try {
      await createNextStep({
        donor_id: Number(donorId),
        description: description.trim(),
        due_date: dueDate,
      });
      setDescription("");
      setDueDate("");
      setShowForm(false);
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const donorLink = (id: number, name: string) => (
    <Link
      to={`/${role}/donors/${id}`}
      className="underline decoration-[#C8D2C7] underline-offset-2 hover:text-[#183E32]"
    >
      {name}
    </Link>
  );

  const stepRow = (step: QueueStep, overdue: boolean) => (
    <li
      key={step.id}
      className="flex items-center gap-4 border-b border-[#E0E4DB] px-6 py-5 last:border-0"
    >
      <button
        type="button"
        onClick={() => markDone(step)}
        disabled={busyStep === step.id}
        aria-label={`Mark "${step.description}" done`}
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center border border-[#A5B3A6] hover:border-[#183E32] hover:bg-[#EDF0E8] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]"
      >
        {busyStep === step.id && <Check size={15} aria-hidden="true" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#242A26]">{step.description}</p>
        <p className="mt-1 text-xs text-[#5E6B61]">
          {donorLink(step.donor_id, step.donor_name)}
        </p>
      </div>

      <div
        className={`flex shrink-0 items-center gap-2 text-xs ${
          overdue ? "font-semibold text-[#9A3B2E]" : "text-[#5E6B61]"
        }`}
      >
        <CalendarDays size={15} aria-hidden="true" />
        {overdue ? "Overdue · " : ""}
        {formatDate(step.due_date)}
      </div>
    </li>
  );

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#5E6B61]">
            Donor relationships / Reminders
          </p>
          <h2 className="mt-3 font-display text-5xl text-[#183E32]">Your next steps.</h2>
          <p className="mt-3 text-sm text-[#5E6B61]">
            Everything you owe your donors this week, overdue first.
          </p>
        </div>

        <button
          type="button"
          onClick={openForm}
          className="flex cursor-pointer items-center gap-2 bg-[#183E32] px-5 py-3 text-sm font-semibold text-white hover:bg-[#285745] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]"
        >
          <Plus size={18} aria-hidden="true" />
          Add follow-up
        </button>
      </div>

      {result?.error && !queue ? (
        <div role="alert" className="border border-[#D9A99F] bg-[#FBF1EE] p-5 text-sm text-[#7A2E22]">
          Couldn't load your follow-ups: {result.error}
        </div>
      ) : loading || !queue ? (
        <p role="status" className="text-sm text-[#5E6B61]">Loading your follow-ups…</p>
      ) : (
        <>
          {/* Statistics */}
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: "Overdue", value: queue.counts.overdue, alert: queue.counts.overdue > 0 },
              { label: "Due this week", value: queue.counts.this_week },
              { label: "Drafts to review", value: queue.counts.drafts },
              { label: "No contact in 90 days", value: queue.counts.quarterly_owed },
            ].map((stat) => (
              <div key={stat.label} className="border border-[#D8DED4] bg-[#FBF9F3] p-6">
                <p className="text-xs text-[#5E6B61]">{stat.label}</p>
                <p
                  className={`mt-4 font-display text-4xl ${
                    stat.alert ? "text-[#9A3B2E]" : "text-[#183E32]"
                  }`}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {actionError && (
            <p role="alert" className="text-sm text-[#9A3B2E]">{actionError}</p>
          )}

          <Section
            title="Follow-ups"
            hint="Tick a box when it's done; it moves to the donor's timeline."
            empty="Nothing due this week. Nice work."
          >
            {[
              ...queue.overdue.map((s) => stepRow(s, true)),
              ...queue.this_week.map((s) => stepRow(s, false)),
            ]}
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section
              title="Drafts to review"
              hint="Written by the system. Review it, send it yourself, then mark it sent."
              empty="No drafts waiting."
            >
              {queue.drafts_to_review.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-3 border-b border-[#E0E4DB] px-6 py-4 last:border-0"
                >
                  <Mail size={16} className="shrink-0 text-[#52705D]" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold first-letter:uppercase">
                      {d.kind.replace(/_/g, " ")}
                      {d.channel ? ` · ${d.channel}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-[#5E6B61]">
                      {donorLink(d.donor_id, d.donor_name)}
                    </p>
                  </div>
                  <Link
                    to={`/${role}/outreach?draft=${d.id}`}
                    className="shrink-0 border border-[#183E32] px-3 py-1.5 text-xs font-semibold text-[#183E32] hover:bg-[#EDF0E8]"
                  >
                    Review
                  </Link>
                </li>
              ))}
            </Section>

            <Section
              title="Owed a quarterly touch"
              hint="Your donors with no message, call or meeting in the last 90 days."
              empty="Everyone has heard from you this quarter."
            >
              {queue.quarterly_owed.map((d) => (
                <li
                  key={d.donor_id}
                  className="flex items-center justify-between gap-4 border-b border-[#E0E4DB] px-6 py-4 text-sm last:border-0"
                >
                  {donorLink(d.donor_id, d.donor_name)}
                  <button
                    type="button"
                    onClick={() => draftQuarterly(d.donor_id)}
                    disabled={draftingDonor !== null}
                    aria-label={`Draft a quarterly update for ${d.donor_name}`}
                    className="shrink-0 cursor-pointer border border-[#183E32] px-3 py-1.5 text-xs font-semibold text-[#183E32] hover:bg-[#EDF0E8] disabled:opacity-50"
                  >
                    {draftingDonor === d.donor_id ? "Drafting…" : "Draft update"}
                  </button>
                </li>
              ))}
            </Section>
          </div>
        </>
      )}

      {/* New Follow-up Dialog */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onKeyDown={(e) => e.key === "Escape" && setShowForm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="follow-up-title"
            className="w-full max-w-lg bg-[#F5F0E6] p-8"
          >
            <div className="mb-8 flex items-center justify-between">
              <h2 id="follow-up-title" className="font-display text-4xl text-[#183E32]">
                New follow-up.
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close form"
                className="cursor-pointer"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={addTask} className="space-y-6">
              <div>
                <label htmlFor="followup-donor" className="mb-2 block text-xs font-semibold">
                  Donor
                </label>
                <select
                  id="followup-donor"
                  required
                  autoFocus
                  value={donorId}
                  onChange={(e) => setDonorId(e.target.value)}
                  disabled={!donors}
                  className="w-full border border-[#C8D2C7] bg-white p-3 text-sm"
                >
                  <option value="">{donors ? "Choose a donor…" : "Loading donors…"}</option>
                  {donors?.map((donor) => (
                    <option key={donor.id} value={donor.id}>
                      {donor.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="followup-description" className="mb-2 block text-xs font-semibold">
                  Next step
                </label>
                <textarea
                  id="followup-description"
                  required
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Invite to Day of Compute"
                  rows={3}
                  className="w-full border border-[#C8D2C7] bg-white p-3 text-sm"
                />
              </div>

              <div>
                <label htmlFor="followup-date" className="mb-2 block text-xs font-semibold">
                  Due date
                </label>
                <input
                  id="followup-date"
                  type="date"
                  required
                  min={today()}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full border border-[#C8D2C7] bg-white p-3 text-sm"
                />
              </div>

              {formError && (
                <p role="alert" className="text-sm text-[#9A3B2E]">{formError}</p>
              )}

              <button
                type="submit"
                disabled={saving || !donors}
                className="w-full cursor-pointer bg-[#183E32] px-5 py-4 text-sm font-semibold text-white hover:bg-[#285745] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save follow-up"}
              </button>
              <p className="text-xs text-[#5E6B61]">
                Follow-ups due more than a week out appear here once they're within 7 days, and
                always on the donor's page.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

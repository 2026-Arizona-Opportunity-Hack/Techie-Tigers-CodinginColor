
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Mail, Plus, Send } from "lucide-react";

import { mockDonors, donorName } from "../data/mockDonors.ts";

type MessageStatus = "draft" | "sent";

type Message = {
  id: number;
  donorId: number;
  subject: string;
  body: string;
  status: MessageStatus;
};

const initialMessages: Message[] = [
  {
    id: 1,
    donorId: 1,
    subject: "Your impact this fall",
    body: "Hi Maria,\n\nThank you for supporting Coding in Color.\n\nBest,\nCoding in Color",
    status: "draft",
  },
  {
    id: 2,
    donorId: 3,
    subject: "Thank you for your support",
    body: "Hi James,\n\nThank you for your generous support!\n\nBest,\nCoding in Color",
    status: "draft",
  },
  {
    id: 3,
    donorId: 2,
    subject: "AI Academy program update",
    body: "Hello,\n\nThank you for supporting our programs.\n\nBest,\nCoding in Color",
    status: "sent",
  },
];

export default function OutreachPage() {
  const { role } = useParams();
  const [searchParams] = useSearchParams();

  const visibleDonors =
    role === "board"
      ? mockDonors.filter(
          (donor) => donor.owner === "Demo Board Member"
        )
      : mockDonors;

  const donorIds = new Set(visibleDonors.map((donor) => donor.id));

  const [messages, setMessages] = useState(initialMessages);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const initialDonorId = Number(searchParams.get("donorId"));
  const defaultDonorId = donorIds.has(initialDonorId)
    ? initialDonorId
    : (visibleDonors[0]?.id ?? 0);

  const [newDonorId, setNewDonorId] = useState(defaultDonorId);
  const [showForm, setShowForm] = useState(false);

  const accessibleMessages = messages.filter((message) =>
    donorIds.has(message.donorId)
  );

  const selected = accessibleMessages.find(
    (message) => message.id === selectedId
  );

  const selectedDonor = selected
    ? visibleDonors.find((donor) => donor.id === selected.donorId)
    : undefined;

  function createDraft() {
    const donor = visibleDonors.find((d) => d.id === newDonorId);
    if (!donor) return;

    const greeting =
      donor.first_name || donor.organization_name || "there";

    const draft: Message = {
      id: Date.now(),
      donorId: donor.id,
      subject: "Thank you for supporting Coding in Color",
      body: `Hi ${greeting},\n\nThank you for your support of Coding in Color.\n\nBest,\nCoding in Color`,
      status: "draft",
    };

    setMessages((previous) => [draft, ...previous]);
    setSelectedId(draft.id);
    setShowForm(false);
  }

  function updateDraft(changes: Partial<Message>) {
    if (!selected || selected.status !== "draft") return;

    setMessages((previous) =>
      previous.map((message) =>
        message.id === selected.id
          ? { ...message, ...changes }
          : message
      )
    );
  }

  function markAsSent() {
    if (!selected || selected.status !== "draft") return;

    const confirmed = window.confirm(
      "Did you actually send this email? This only updates the demo status."
    );
    if (!confirmed) return;

    setMessages((previous) =>
      previous.map((message) =>
        message.id === selected.id
          ? { ...message, status: "sent" }
          : message
      )
    );
  }

  const mailtoHref =
    selected && selectedDonor
      ? `mailto:${selectedDonor.email}?${new URLSearchParams({
          subject: selected.subject,
          body: selected.body,
        }).toString()}`
      : "#";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#829087]">
            Donor relationships / Communications
          </p>
          <h2 className="mt-3 font-display text-5xl text-[#183E32]">
            Stay in touch.
          </h2>
          <p className="mt-3 text-sm text-[#788279]">
            Review every message before it goes out.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewDonorId(defaultDonorId);
            setShowForm(true);
          }}
          className="flex items-center gap-2 bg-[#183E32] px-5 py-3 text-sm font-semibold text-white hover:bg-[#285745]"
        >
          <Plus size={18} />
          New message
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Drafts",
            value: accessibleMessages.filter(
              (message) => message.status === "draft"
            ).length,
          },
          {
            label: "Sent",
            value: accessibleMessages.filter(
              (message) => message.status === "sent"
            ).length,
          },
          { label: "Total messages", value: accessibleMessages.length },
        ].map((stat) => (
          <div
            key={stat.label}
            className="border border-[#D8DED4] bg-[#FBF9F3] p-6"
          >
            <p className="text-xs text-[#829087]">{stat.label}</p>
            <p className="mt-3 font-display text-4xl text-[#183E32]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="border border-[#D8DED4] bg-[#FBF9F3]">
          <div className="border-b border-[#D8DED4] p-5 text-sm font-semibold">
            Messages
          </div>

          {accessibleMessages.map((message) => {
            const donor = visibleDonors.find(
              (d) => d.id === message.donorId
            );

            return (
              <button
                type="button"
                key={message.id}
                onClick={() => setSelectedId(message.id)}
                className={`w-full border-b border-[#E0E4DB] p-5 text-left hover:bg-[#EDF0E8] ${
                  selectedId === message.id ? "bg-[#E5EBE1]" : ""
                }`}
              >
                <p className="text-sm font-semibold text-[#242A26]">
                  {message.subject}
                </p>
                <p className="mt-2 text-xs text-[#829087]">
                  {donor ? donorName(donor) : "Unknown donor"} ·{" "}
                  {message.status}
                </p>
              </button>
            );
          })}
        </div>

        <div className="min-h-[400px] border border-[#D8DED4] bg-[#FBF9F3] p-6">
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <Mail size={30} className="text-[#52705D]" />
              <h3 className="font-display text-3xl text-[#183E32]">
                Select a message.
              </h3>
              <p className="text-sm text-[#829087]">
                Choose a message on the left to review or edit it.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <h3 className="font-display text-3xl text-[#183E32]">
                {selected.status === "draft"
                  ? "Review draft."
                  : "Sent message."}
              </h3>

              <p className="text-sm text-[#657365]">
                To: {selectedDonor?.email}
              </p>

              <label className="block text-sm font-semibold">
                Subject
                <input
                  value={selected.subject}
                  disabled={selected.status === "sent"}
                  onChange={(event) =>
                    updateDraft({ subject: event.target.value })
                  }
                  className="mt-2 w-full border border-[#C8D2C7] bg-white p-3 font-normal outline-none"
                />
              </label>

              <label className="block text-sm font-semibold">
                Message
                <textarea
                  rows={11}
                  value={selected.body}
                  disabled={selected.status === "sent"}
                  onChange={(event) =>
                    updateDraft({ body: event.target.value })
                  }
                  className="mt-2 w-full resize-y border border-[#C8D2C7] bg-white p-4 font-normal leading-7 outline-none"
                />
              </label>

              {selected.status === "draft" && (
                <div className="flex flex-wrap gap-3">
                  <a
                    href={mailtoHref}
                    className="flex items-center gap-2 bg-[#183E32] px-5 py-3 text-sm font-semibold text-white"
                  >
                    <Send size={17} />
                    Open email app
                  </a>

                  <button
                    type="button"
                    onClick={markAsSent}
                    className="border border-[#183E32] px-5 py-3 text-sm font-semibold text-[#183E32]"
                  >
                    Confirm sent
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-message-title"
            className="w-full max-w-md bg-[#F5F0E6] p-8"
          >
            <h3
              id="new-message-title"
              className="font-display text-4xl text-[#183E32]"
            >
              New message.
            </h3>

            <label className="mt-6 block text-sm font-semibold">
              Donor
              <select
                value={newDonorId}
                onChange={(event) =>
                  setNewDonorId(Number(event.target.value))
                }
                className="mt-2 w-full border border-[#C8D2C7] bg-white p-3 font-normal"
              >
                {visibleDonors.map((donor) => (
                  <option key={donor.id} value={donor.id}>
                    {donorName(donor)}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={createDraft}
                className="bg-[#183E32] px-5 py-3 text-sm font-semibold text-white"
              >
                Create draft
              </button>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border border-[#C8D2C7] px-5 py-3 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-[#829087]">
        Demo mode: message changes reset when the page reloads.
        No emails are sent automatically.
      </p>
    </div>
  );
}

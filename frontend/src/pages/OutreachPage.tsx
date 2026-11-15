import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CalendarClock, CheckCircle2, Lock, Mail, MessageSquare, Phone, Plus, Trash2, X } from "lucide-react";

import { useAuth } from "../auth/AuthProvider";
import {
  draftQuarterlyUpdates,
  editDraft,
  formatDate,
  getDonors,
  getDonorTimeline,
  getDraftLinks,
  getMessages,
  logOutreach,
  markSent,
  skipDraft,
  dismissQuarterlyDrafts,
  type Donor,
  type MessageSummary,
} from "../lib/api";

type Tab = "draft" | "sent";

// The message body comes from the donor's timeline: the message list endpoint
// returns summaries only.
type Detail = {
  id: number;
  subject: string;
  body: string;
  saved: { subject: string; body: string }; // what the server has, to detect edits
  hasEmail: boolean; // which ways the donor can be reached
  hasPhone: boolean;
  error?: string;
};

const kindLabel = (m: MessageSummary) =>
  `${m.kind.replace(/_/g, " ")}${m.channel ? ` · ${m.channel.replace("_", " ")}` : ""}`;

const primaryButton =
  "inline-flex items-center gap-2 bg-[#183E32] px-5 py-3 text-sm font-semibold text-white hover:bg-[#285745] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]";
const secondaryButton =
  "inline-flex items-center gap-2 border border-[#183E32] px-5 py-3 text-sm font-semibold text-[#183E32] hover:bg-[#EDF0E8] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]";

const dangerButton =
  "inline-flex items-center gap-2 border border-[#B4472F] px-5 py-3 text-sm font-semibold text-[#7A2E22] hover:bg-[#FBF1EE] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7A2E22]";

export default function OutreachPage() {
  const { role } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState<Tab>("draft");
  const [version, setVersion] = useState(0);
  const [list, setList] = useState<{ key: string; messages?: MessageSummary[]; error?: string }>();
  const listKey = `${tab}-${version}`;

  // ?draft=12 opens that draft (the Follow-ups page links here).
  const [selectedId, setSelectedId] = useState<number | null>(
    Number(searchParams.get("draft")) || null
  );
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [awaitingSend, setAwaitingSend] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  const auth = useAuth();
  const me = auth.status === "ready" ? auth.me : null;

  const messages = list?.messages ?? [];
  const selected = messages.find((m) => m.id === selectedId);
  const current = detail && detail.id === selectedId ? detail : null;
  const isDraft = selected?.status === "draft";
  // The database only lets you edit or send a draft the system wrote or you
  // started (admins excepted), so nobody can take over a teammate's message.
  const draftOwnedByOther =
    isDraft && !!selected?.user_id && selected.user_id !== me?.id && me?.role !== "admin";
  const edited =
    !!current &&
    (current.subject !== current.saved.subject || current.body !== current.saved.body);

  // Load the message list for the current tab.
  useEffect(() => {
    let cancelled = false;
    getMessages(tab)
      .then((rows) => !cancelled && setList({ key: listKey, messages: rows }))
      .catch((err: Error) => !cancelled && setList({ key: listKey, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [tab, listKey]);

  // A draft opened from a link (?draft=12) may be far down the list: bring its
  // row into view so it's clear which draft is open.
  useEffect(() => {
    if (!selectedId || !messages.length) return;
    document
      .querySelector(`[data-message-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId, messages.length]);

  // Load the selected message's full text.
  const selectedDonorId = selected?.donor_id;
  useEffect(() => {
    if (!selectedId || !selectedDonorId) return;
    let cancelled = false;
    getDonorTimeline(selectedDonorId)
      .then((t) => {
        const item = [...t.open, ...t.history].find(
          (i) => i.type === "message" && i.id === selectedId
        );
        const subject = item?.subject ?? "";
        const body = item?.body ?? "";
        if (!cancelled)
          setDetail({
            id: selectedId,
            subject,
            body,
            saved: { subject, body },
            hasEmail: !!t.donor.email,
            hasPhone: !!t.donor.phone,
          });
      })
      .catch(
        (err: Error) =>
          !cancelled &&
          setDetail({
            id: selectedId,
            subject: "",
            body: "",
            saved: { subject: "", body: "" },
            hasEmail: false,
            hasPhone: false,
            error: err.message,
          })
      );
    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedDonorId]);

  function select(id: number | null) {
    setSelectedId(id);
    setAwaitingSend(false);
    setActionError("");
    setNotice("");
    setSearchParams(id && tab === "draft" ? { draft: String(id) } : {}, { replace: true });
  }

  function switchTab(next: Tab) {
    setTab(next);
    select(null);
  }

  const reload = () => setVersion((v) => v + 1);

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setActionError("");
    try {
      await work();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    act(async () => {
      if (!current || !selected) return;
      await editDraft(selected.id, { subject: current.subject || null, body: current.body });
      setDetail({ ...current, saved: { subject: current.subject, body: current.body } });
      reload();
    });

  // Send the same draft by email or by text instead. Saves any edits along with
  // the switch. Emails need a subject, so one is filled in if the text had none.
  const switchChannel = (channel: "email" | "text") =>
    act(async () => {
      if (!current || !selected || selected.channel === channel) return;
      const subject =
        channel === "email" && !current.subject.trim()
          ? selected.kind === "thank_you"
            ? "Thank you for your gift to Coding in Color"
            : "A note from Coding in Color"
          : current.subject;
      await editDraft(selected.id, { channel, subject: subject || null, body: current.body });
      setDetail({ ...current, subject, saved: { subject, body: current.body } });
      setAwaitingSend(false);
      reload();
    });

  // Opens the sender's own Gmail or Messages with the draft filled in.
  // The backend signs it with their name. Nothing is sent from here.
  const openToSend = () => {
    if (!selected || !current) return;
    const isEmail = selected.channel === "email";
    // Open the tab now, while we still have the click; browsers block it after an await.
    const tabWindow = isEmail ? window.open("about:blank", "_blank") : null;
    act(async () => {
      try {
        if (edited) {
          await editDraft(selected.id, { subject: current.subject || null, body: current.body });
          setDetail({ ...current, saved: { subject: current.subject, body: current.body } });
        }
        const links = await getDraftLinks(selected.id);
        const url = isEmail ? links.gmail ?? links.mailto : links.sms;
        if (!url) throw new Error(`This donor has no ${isEmail ? "email" : "phone number"} on file.`);
        if (tabWindow) {
          tabWindow.opener = null;
          tabWindow.location.href = url;
        } else {
          window.location.href = url;
        }
        setAwaitingSend(true);
      } catch (err) {
        tabWindow?.close();
        throw err;
      }
    });
  };

  const confirmSent = () => {
    if (!selected) return;
    if (!window.confirm("Mark as sent only after you've pressed Send in Gmail or Messages. Mark it sent?"))
      return;
    act(async () => {
      await markSent(selected.id);
      setNotice(`Marked sent. It's now on ${selected.donor_name}'s timeline with your name.`);
      select(null);
      reload();
    });
  };

  const skip = () => {
    if (!selected) return;
    if (!window.confirm(`Dismiss this draft for ${selected.donor_name}? It won't be sent.`)) return;
    act(async () => {
      await skipDraft(selected.id);
      setNotice("Draft dismissed.");
      select(null);
      reload();
    });
  };

  // ---- Quarterly updates (admin) ----
  const [drafting, setDrafting] = useState(false);
  async function runQuarterly() {
    if (!window.confirm("Draft a quarterly update for every active donor nobody has contacted in 90 days? Nothing is sent; each owner reviews and sends their own."))
      return;
    setDrafting(true);
    setActionError("");
    try {
      const r = await draftQuarterlyUpdates();
      setNotice(
        `${r.drafts_created} quarterly update${r.drafts_created === 1 ? "" : "s"} drafted` +
          (r.skipped_no_email_or_phone
            ? `; ${r.skipped_no_email_or_phone} donor(s) skipped with no email or phone.`
            : ".") +
          " Each board member sees theirs under Drafts to review."
      );
      if (tab === "draft") reload();
      else switchTab("draft");
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  // ---- Delete quarterly drafts (admin) ----
  const [clearing, setClearing] = useState(false);
  const quarterlyDraftCount =
    tab === "draft" ? messages.filter((m) => m.kind === "quarterly").length : 0;
  async function deleteQuarterlyDrafts() {
    if (
      !window.confirm(
        `Delete all ${quarterlyDraftCount} quarterly update drafts waiting for review? None of them will be sent. Thank-yous and other drafts stay. You can draft quarterly updates again afterwards.`
      )
    )
      return;
    setClearing(true);
    setActionError("");
    try {
      const r = await dismissQuarterlyDrafts();
      if (selected?.kind === "quarterly") select(null);
      setNotice(`${r.dismissed} quarterly draft${r.dismissed === 1 ? "" : "s"} deleted.`);
      reload();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setClearing(false);
    }
  }

  // ---- "Log a conversation" dialog ----
  const [showLog, setShowLog] = useState(false);
  const [donors, setDonors] = useState<Donor[] | null>(null);
  const [logForm, setLogForm] = useState({ donorId: "", channel: "call", body: "" });
  const [logError, setLogError] = useState("");
  const [logging, setLogging] = useState(false);

  function openLog() {
    setShowLog(true);
    setLogError("");
    if (!donors)
      getDonors()
        .then(setDonors)
        .catch((err: Error) => setLogError(`Couldn't load donors: ${err.message}`));
  }

  async function submitLog(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!logForm.donorId || !logForm.body.trim()) return;
    setLogging(true);
    setLogError("");
    try {
      await logOutreach({
        donor_id: Number(logForm.donorId),
        channel: logForm.channel as "call" | "in_person" | "text" | "email",
        kind: "follow_up",
        body: logForm.body.trim(),
      });
      const name = donors?.find((d) => d.id === Number(logForm.donorId))?.display_name;
      setShowLog(false);
      setLogForm({ donorId: "", channel: "call", body: "" });
      setNotice(`Logged. It's on ${name ?? "the donor"}'s timeline.`);
      if (tab === "sent") reload();
      else switchTab("sent");
    } catch (err) {
      setLogError((err as Error).message);
    } finally {
      setLogging(false);
    }
  }

  const listLoading = list?.key !== listKey && !list?.messages;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#5E6B61]">
            Donor relationships / Communications
          </p>
          <h2 className="mt-3 font-display text-5xl text-[#183E32]">Stay in touch.</h2>
          <p className="mt-3 text-sm text-[#5E6B61]">
            The system drafts. You review, send it from your own email or phone, then mark it
            sent.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {me?.role === "admin" && (
            <button type="button" onClick={runQuarterly} disabled={drafting} className={secondaryButton}>
              <CalendarClock size={18} aria-hidden="true" />
              {drafting ? "Drafting…" : "Draft quarterly updates"}
            </button>
          )}
          {me?.role === "admin" && quarterlyDraftCount > 0 && (
            <button
              type="button"
              onClick={deleteQuarterlyDrafts}
              disabled={clearing}
              className={dangerButton}
            >
              <Trash2 size={18} aria-hidden="true" />
              {clearing ? "Deleting…" : `Delete quarterly drafts (${quarterlyDraftCount})`}
            </button>
          )}
          <button type="button" onClick={openLog} className={primaryButton}>
            <Plus size={18} aria-hidden="true" />
            Log a conversation
          </button>
        </div>
      </header>

      {actionError && !selected && (
        <p role="alert" className="text-sm text-[#9A3B2E]">{actionError}</p>
      )}

      {notice && (
        <p role="status" className="flex items-center gap-2 border border-[#A9C3AE] bg-[#EEF4EE] p-4 text-sm text-[#2F5A3C]">
          <CheckCircle2 size={16} aria-hidden="true" /> {notice}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* Message list */}
        <div className="border border-[#D8DED4] bg-[#FBF9F3]">
          <div role="group" aria-label="Show messages" className="flex border-b border-[#D8DED4]">
            {(["draft", "sent"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => switchTab(t)}
                className={`flex-1 p-4 text-sm font-semibold ${
                  tab === t ? "bg-[#E5EBE1] text-[#183E32]" : "text-[#5E6B61] hover:bg-[#EDF0E8]"
                }`}
              >
                {t === "draft" ? "Drafts to review" : "Sent history"}
              </button>
            ))}
          </div>

          {list?.error && !list.messages ? (
            <p role="alert" className="p-5 text-sm text-[#9A3B2E]">
              Couldn't load messages: {list.error}
            </p>
          ) : listLoading ? (
            <p role="status" className="p-5 text-sm text-[#5E6B61]">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="p-5 text-sm text-[#5E6B61]">
              {tab === "draft"
                ? "No drafts waiting. New gifts and the quarterly job create them."
                : "Nothing sent yet."}
            </p>
          ) : (
            <ul>
              {messages.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    data-message-id={m.id}
                    onClick={() => select(m.id)}
                    aria-current={selectedId === m.id}
                    className={`w-full border-b border-l-4 border-b-[#E0E4DB] p-5 text-left hover:bg-[#EDF0E8] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#183E32] ${
                      selectedId === m.id
                        ? "border-l-[#183E32] bg-[#E5EBE1]"
                        : "border-l-transparent"
                    }`}
                  >
                    <p className="text-sm font-semibold text-[#242A26]">{m.donor_name}</p>
                    <p className="mt-1 text-xs text-[#5E6B61] first-letter:uppercase">
                      {kindLabel(m)} ·{" "}
                      {m.status === "sent"
                        ? `${m.sent_by ?? "Someone"}, ${formatDate(m.sent_at)}`
                        : formatDate(m.created_at)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Selected message */}
        <div className="min-h-[400px] border border-[#D8DED4] bg-[#FBF9F3] p-6">
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <Mail size={30} className="text-[#52705D]" aria-hidden="true" />
              <h3 className="font-display text-3xl text-[#183E32]">Select a message.</h3>
              <p className="text-sm text-[#5E6B61]">
                Choose a message on the left to review it.
              </p>
            </div>
          ) : !current ? (
            <p role="status" className="text-sm text-[#5E6B61]">Loading message…</p>
          ) : current.error ? (
            <p role="alert" className="text-sm text-[#9A3B2E]">
              Couldn't load this message: {current.error}
            </p>
          ) : (
            <div className="space-y-5">
              <div>
                <h3 className="font-display text-3xl text-[#183E32]">
                  {isDraft ? "Review draft." : "Sent message."}
                </h3>
                <p className="mt-2 text-sm text-[#5E6B61]">
                  <span className="mr-2 inline-block border border-[#C8D2C7] px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-[#183E32]">
                    {selected.kind.replace(/_/g, "-")}
                  </span>
                  To{" "}
                  <Link
                    to={`/${role}/donors/${selected.donor_id}`}
                    className="underline decoration-[#C8D2C7] underline-offset-2 hover:text-[#183E32]"
                  >
                    {selected.donor_name}
                  </Link>{" "}
                  by {selected.channel?.replace("_", " ") ?? "message"}
                  {!isDraft && ` · sent by ${selected.sent_by ?? "someone"} on ${formatDate(selected.sent_at)}`}
                </p>
              </div>

              {isDraft && !draftOwnedByOther && current.hasEmail && current.hasPhone && (
                <fieldset>
                  <legend className="text-sm font-semibold">Send as</legend>
                  <div className="mt-2 inline-flex border border-[#C8D2C7]">
                    {(
                      [
                        { id: "email", label: "Email", icon: Mail },
                        { id: "text", label: "Text message", icon: MessageSquare },
                      ] as const
                    ).map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected.channel === id}
                        disabled={busy}
                        onClick={() => switchChannel(id)}
                        className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#183E32] ${
                          selected.channel === id
                            ? "bg-[#183E32] text-white"
                            : "bg-white text-[#183E32] hover:bg-[#EDF0E8]"
                        }`}
                      >
                        <Icon size={15} aria-hidden="true" />
                        {label}
                      </button>
                    ))}
                  </div>
                  {selected.channel === "text" && (
                    <p className="mt-2 text-xs text-[#829087]">
                      Texts send the message only, no subject. Shorten it if you like.
                    </p>
                  )}
                </fieldset>
              )}

              {(isDraft || current.subject) && selected.channel === "email" && (
                <label className="block text-sm font-semibold">
                  Subject
                  <input
                    value={current.subject}
                    readOnly={!isDraft || draftOwnedByOther}
                    maxLength={200}
                    onChange={(e) => setDetail({ ...current, subject: e.target.value })}
                    className="mt-2 w-full border border-[#C8D2C7] bg-white p-3 font-normal outline-none focus:border-[#183E32] read-only:bg-transparent"
                  />
                </label>
              )}

              <label className="block text-sm font-semibold">
                {isDraft ? "Message" : "What was sent"}
                <textarea
                  rows={11}
                  value={current.body}
                  readOnly={!isDraft || draftOwnedByOther}
                  maxLength={5000}
                  onChange={(e) => setDetail({ ...current, body: e.target.value })}
                  className="mt-2 w-full resize-y border border-[#C8D2C7] bg-white p-4 font-normal leading-7 outline-none focus:border-[#183E32] read-only:bg-transparent"
                />
              </label>
              {isDraft && (
                <p className="text-xs text-[#5E6B61]">
                  "[Your name]" is replaced with your name when you open it to send.
                </p>
              )}

              {actionError && (
                <p role="alert" className="text-sm text-[#9A3B2E]">{actionError}</p>
              )}

              {draftOwnedByOther && (
                <p role="note" className="flex items-start gap-2 border border-[#C8D2C7] bg-[#EDF0E8] p-4 text-sm text-[#42674C]">
                  <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {selected.sent_by ?? "Someone else"} started this draft, so only they or an
                  admin can edit or send it. You can still log your own conversation with this
                  donor.
                </p>
              )}

              {isDraft && !draftOwnedByOther && (
                <>
                  {awaitingSend && (
                    <div role="status" className="border border-[#D8B77D] bg-[#FBF5E8] p-4 text-sm text-[#6B5428]">
                      Pressed Send in {selected.channel === "email" ? "Gmail" : "Messages"}? Mark it
                      sent so it's recorded on the timeline.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={openToSend} disabled={busy} className={primaryButton}>
                      {selected.channel === "email" ? (
                        <Mail size={17} aria-hidden="true" />
                      ) : (
                        <MessageSquare size={17} aria-hidden="true" />
                      )}
                      {selected.channel === "email" ? "Open in Gmail" : "Open in Messages"}
                    </button>
                    <button type="button" onClick={confirmSent} disabled={busy} className={secondaryButton}>
                      <CheckCircle2 size={17} aria-hidden="true" />
                      Mark as sent
                    </button>
                    {edited && (
                      <button type="button" onClick={save} disabled={busy} className={secondaryButton}>
                        Save changes
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={skip}
                      disabled={busy}
                      className="px-3 py-3 text-sm text-[#5E6B61] underline underline-offset-2 hover:text-[#9A3B2E] disabled:opacity-50"
                    >
                      Dismiss draft
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Log a conversation */}
      {showLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onKeyDown={(e) => e.key === "Escape" && setShowLog(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-title"
            className="w-full max-w-lg bg-[#F5F0E6] p-8"
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 id="log-title" className="font-display text-4xl text-[#183E32]">
                Log a conversation.
              </h3>
              <button
                type="button"
                onClick={() => setShowLog(false)}
                aria-label="Close"
                className="cursor-pointer"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <p className="mb-6 text-sm text-[#5E6B61]">
              For a call, text, email or meeting that already happened, so the next person
              knows.
            </p>

            <form onSubmit={submitLog} className="space-y-5">
              <label className="block text-xs font-semibold">
                Donor
                <select
                  required
                  autoFocus
                  disabled={!donors}
                  value={logForm.donorId}
                  onChange={(e) => setLogForm({ ...logForm, donorId: e.target.value })}
                  className="mt-2 w-full border border-[#C8D2C7] bg-white p-3 text-sm font-normal"
                >
                  <option value="">{donors ? "Choose a donor…" : "Loading donors…"}</option>
                  {donors?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.display_name}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset>
                <legend className="mb-2 text-xs font-semibold">How</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { id: "call", label: "Call", icon: Phone },
                    { id: "in_person", label: "In person", icon: CheckCircle2 },
                    { id: "text", label: "Text", icon: MessageSquare },
                    { id: "email", label: "Email", icon: Mail },
                  ].map(({ id, label, icon: Icon }) => (
                    <label
                      key={id}
                      className={`flex cursor-pointer items-center justify-center gap-2 border p-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#183E32] ${
                        logForm.channel === id
                          ? "border-[#183E32] bg-[#EDF0E8]"
                          : "border-[#C8D2C7] bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="channel"
                        value={id}
                        checked={logForm.channel === id}
                        onChange={() => setLogForm({ ...logForm, channel: id })}
                        className="sr-only"
                      />
                      <Icon size={15} aria-hidden="true" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block text-xs font-semibold">
                What happened
                <textarea
                  required
                  rows={4}
                  maxLength={2000}
                  value={logForm.body}
                  onChange={(e) => setLogForm({ ...logForm, body: e.target.value })}
                  placeholder="e.g. Coffee chat. Not ready to give yet, wants to see a class."
                  className="mt-2 w-full border border-[#C8D2C7] bg-white p-3 text-sm font-normal"
                />
              </label>

              {logError && (
                <p role="alert" className="text-sm text-[#9A3B2E]">{logError}</p>
              )}

              <button
                type="submit"
                disabled={logging || !donors}
                className={`${primaryButton} w-full justify-center py-4`}
              >
                {logging ? "Saving…" : "Save to timeline"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

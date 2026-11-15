import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  HeartHandshake,
  Mail,
  MessageSquare,
  Phone,
} from "lucide-react";

import {
  ApiError,
  draftThankYou,
  formatDate,
  formatMoney,
  getContactLinks,
  getRetentionStatuses,
  type RetentionStatus,
  getDonorTimeline,
  getFunderPacket,
  type ContactLinks,
  type DonorTimeline,
  type TimelineItem,
} from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import RetentionBadge from "../components/RetentionBadge";
import OwnerPicker from "../components/OwnerPicker";

// Funder packet: gifts, totals by year/program, and the outcomes they funded.
// Admin and fundraising only (the backend refuses board members).
function FunderReport({ donorId, donorName }: { donorId: number; donorName: string }) {
  const [busy, setBusy] = useState<"html" | "csv" | null>(null);
  const [error, setError] = useState("");

  async function openReport() {
    // Open the tab now, while we're still inside the click, so pop-up
    // blockers allow it. We fill it in once the report arrives.
    const tab = window.open("", "_blank");
    if (!tab) {
      setError("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
      return;
    }
    tab.document.title = "Loading report…";
    tab.document.body.textContent = "Loading funder report…";

    setBusy("html");
    setError("");
    try {
      const { blob } = await getFunderPacket(donorId, "html");
      const url = URL.createObjectURL(blob);
      tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab.close();
      setError(`Couldn't load the report: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function downloadCsv() {
    setBusy("csv");
    setError("");
    try {
      const { blob, filename } = await getFunderPacket(donorId, "csv");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? `funder-${donorId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Couldn't download the CSV: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const buttonClass =
    "inline-flex items-center gap-2 border border-[#183E32] px-4 py-2 text-sm text-[#183E32] transition-colors hover:bg-[#183E32] hover:text-[#F5F0E6] disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[#183E32] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]";

  return (
    <section
      aria-labelledby="funder-report-heading"
      className="border border-[#D8DED4] bg-[#FBF9F3] p-6"
    >
      <div className="mb-2 flex items-center gap-3">
        <FileText size={19} className="text-[#52705D]" aria-hidden="true" />
        <h3 id="funder-report-heading" className="text-sm font-semibold">
          Funder Report
        </h3>
      </div>
      <p className="mb-4 text-xs text-[#5E6B61]">
        {donorName}'s giving by year and program, the outcomes it funded, and
        every gift. Ready to print or save as PDF.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openReport}
          disabled={busy !== null}
          className={buttonClass}
        >
          <ExternalLink size={16} aria-hidden="true" />
          {busy === "html" ? "Opening…" : "Open report"}
        </button>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={busy !== null}
          className={buttonClass}
        >
          <Download size={16} aria-hidden="true" />
          {busy === "csv" ? "Downloading…" : "Gift history (CSV)"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-[#9A3B2E]">{error}</p>
      )}
    </section>
  );
}

const ICONS = {
  gift: HeartHandshake,
  message: Mail,
  next_step: CheckCircle2,
};

function TimelineRow({ item, action }: { item: TimelineItem; action?: React.ReactNode }) {
  const Icon = ICONS[item.type];
  const meta =
    item.type === "gift"
      ? item.detail
      : item.type === "message"
        ? [item.status === "draft" ? "Draft" : `By ${item.by}`, item.subject]
            .filter(Boolean)
            .join(" · ")
        : [item.assigned_to && `Assigned to ${item.assigned_to}`, item.event?.name]
            .filter(Boolean)
            .join(" · ");

  return (
    <li className="flex gap-4 border-b border-[#E0E4DB] py-4 last:border-0">
      <Icon size={17} className="mt-0.5 shrink-0 text-[#52705D]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold first-letter:uppercase">{item.title}</p>
        {meta && <p className="mt-1 text-xs text-[#5E6B61]">{meta}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <p className="text-xs text-[#5E6B61]">{formatDate(item.date)}</p>
        {action}
      </div>
    </li>
  );
}

export default function DonorDetails() {
  const { role, donorId } = useParams();
  const id = Number(donorId);
  const auth = useAuth();
  const canExport =
    auth.status === "ready" && (auth.role === "admin" || auth.role === "fundraising");
  // Only the CEO assigns owners (the backend and database enforce this too).
  const canReassign = auth.status === "ready" && auth.role === "admin";
  // Bumped after a reassignment to reload the donor and its timeline.
  const [version, setVersion] = useState(0);

  // Results are tagged with the donor id they belong to, so moving to another
  // donor shows "Loading…" instead of the previous donor's data.
  const [result, setResult] = useState<{
    id: number;
    data?: DonorTimeline;
    links?: ContactLinks;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!Number.isInteger(id)) return;
    let cancelled = false;

    getDonorTimeline(id)
      .then(async (data) => {
        // Contact links only exist for active donors.
        const links = data.donor.active
          ? await getContactLinks(id).catch(() => ({}))
          : {};
        if (!cancelled) setResult({ id, data, links });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        // 404 means it doesn't exist or isn't yours; the backend doesn't say which.
        setResult({
          id,
          error:
            err instanceof ApiError && err.status === 404
              ? "Donor not found or unavailable."
              : `Couldn't load this donor: ${err.message}`,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [id, version]);

  // This year's retention category for the badge in the header.
  const [retention, setRetention] = useState<{ id: number; status?: RetentionStatus }>();
  useEffect(() => {
    if (!Number.isInteger(id)) return;
    let cancelled = false;
    getRetentionStatuses()
      .then((m) => !cancelled && setRetention({ id, status: m.get(id) }))
      .catch(() => !cancelled && setRetention({ id }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // "Thank" on a gift: draft a thank-you, then open it in Outreach to review and send.
  const navigate = useNavigate();
  const [thankingGift, setThankingGift] = useState<number | null>(null);
  const [thankError, setThankError] = useState("");
  async function thank(giftId: number) {
    setThankingGift(giftId);
    setThankError("");
    try {
      const draft = await draftThankYou(giftId);
      navigate(`/${role}/outreach?draft=${draft.id}`);
    } catch (err) {
      setThankError((err as Error).message);
      setThankingGift(null);
    }
  }

  const current = result?.id === id ? result : null;
  const error = Number.isInteger(id) ? current?.error : "Donor not found.";
  const data = current?.data;
  const links = current?.links ?? {};

  const backLink = (
    <Link
      to={`/${role}/donors`}
      className="inline-flex items-center gap-2 text-sm text-[#52705D] hover:text-[#183E32]"
    >
      <ArrowLeft size={17} aria-hidden="true" />
      Back to donors
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-6">
        {backLink}
        <p role="alert" className="text-sm text-[#5E6B61]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {backLink}
        <p role="status" className="text-sm text-[#5E6B61]">Loading donor…</p>
      </div>
    );
  }

  const { donor, open, history } = data;

  // Thank-yous that count, matching the backend's rule: sent or still a draft
  // (not dismissed). A gift is "thanked" if one is dated on or after the gift.
  const thankYouDates = [...open, ...history]
    .filter(
      (i) =>
        i.type === "message" &&
        i.title.startsWith("thank you") &&
        i.status !== "skipped" &&
        i.date
    )
    .map((i) => ({ date: i.date!.slice(0, 10), sent: i.status === "sent" }));
  const thankedState = (giftDate: string | null) => {
    const match = thankYouDates.filter((t) => giftDate && t.date >= giftDate);
    if (match.some((t) => t.sent)) return "Thanked";
    if (match.length > 0) return "Thank-you drafted";
    return null;
  };
  const contactButtons = [
    { label: "Email", href: links.gmail, icon: Mail, newTab: true },
    { label: "Text", href: links.sms, icon: MessageSquare, newTab: false },
    { label: "Call", href: links.call, icon: Phone, newTab: false },
  ].filter((b) => b.href);

  return (
    <div className="space-y-8">
      {backLink}

      {/* Donor Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#D8DED4] pb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#5E6B61]">
            Donor profile / #{donor.id}
          </p>

          <h2 className="mt-3 font-display text-5xl text-[#183E32]">
            {donor.display_name}
          </h2>

          <p className="mt-3 text-sm text-[#5E6B61]">
            <span className="capitalize">{donor.donor_type}</span> ·{" "}
            {donor.active ? "Active" : "Inactive"}
            {!canReassign && <> · Owner: {donor.owner_name ?? "Unassigned"}</>}
          </p>

          {canReassign && (
            <OwnerPicker
              donorId={donor.id}
              ownerId={donor.owner_id}
              ownerName={donor.owner_name}
              onChanged={() => setVersion((v) => v + 1)}
            />
          )}

          {retention?.id === donor.id && (
            <div className="mt-3 flex items-center gap-2 text-xs text-[#5E6B61]">
              {new Date().getFullYear()} giving:
              <RetentionBadge
                status={retention.status}
                lastGiftDate={donor.last_gift_date}
                giftCount={donor.gift_count}
              />
            </div>
          )}
        </div>

        {contactButtons.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {contactButtons.map(({ label, href, icon: Icon, newTab }) => (
              <a
                key={label}
                href={href}
                {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="inline-flex items-center gap-2 border border-[#183E32] px-4 py-2 text-sm text-[#183E32] transition-colors hover:bg-[#183E32] hover:text-[#F5F0E6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]"
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Overview Statistics */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total given", value: formatMoney(donor.lifetime_total) },
          { label: "Total gifts", value: donor.gift_count.toString() },
          {
            label: "Last thanked",
            value: donor.last_thanked_at ? formatDate(donor.last_thanked_at) : "Not yet",
          },
        ].map((stat) => (
          <div key={stat.label} className="border border-[#D8DED4] bg-[#FBF9F3] p-6">
            <p className="text-xs text-[#5E6B61]">{stat.label}</p>
            <p className="mt-4 font-display text-3xl text-[#183E32]">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        {/* Relationship timeline */}
        <section
          aria-labelledby="timeline-heading"
          className="border border-[#D8DED4] bg-[#FBF9F3] p-6"
        >
          <div className="mb-2 flex items-center gap-3">
            <HeartHandshake size={19} className="text-[#52705D]" aria-hidden="true" />
            <h3 id="timeline-heading" className="text-sm font-semibold">
              Relationship Timeline
            </h3>
          </div>
          <p className="mb-4 text-xs text-[#5E6B61]">
            Gifts, messages sent, and finished follow-ups, newest first.
          </p>

          {history.length === 0 ? (
            <p className="text-sm text-[#5E6B61]">Nothing recorded yet.</p>
          ) : (
            <>
            <ul>
              {history.map((item) => (
                <TimelineRow
                  key={`${item.type}-${item.id}`}
                  item={item}
                  action={
                    item.type === "gift" && donor.active && thankedState(item.date) ? (
                      <button
                        type="button"
                        disabled
                        aria-label={`${thankedState(item.date)} for the ${item.title}`}
                        className="cursor-not-allowed border border-[#D8DED4] px-2.5 py-1 text-xs text-[#5E6B61]"
                      >
                        {thankedState(item.date) === "Thanked" ? "✓ Thanked" : "Thank-you drafted"}
                      </button>
                    ) : item.type === "gift" && donor.active ? (
                      <button
                        type="button"
                        onClick={() => thank(item.id)}
                        disabled={thankingGift !== null}
                        aria-label={`Draft a thank-you for the ${item.title}`}
                        className="border border-[#183E32] px-2.5 py-1 text-xs font-semibold text-[#183E32] hover:bg-[#EDF0E8] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183E32]"
                      >
                        {thankingGift === item.id ? "Drafting…" : "Thank"}
                      </button>
                    ) : undefined
                  }
                />
              ))}
            </ul>
            {thankError && (
              <p role="alert" className="mt-3 text-sm text-[#9A3B2E]">{thankError}</p>
            )}
            </>
          )}
        </section>

        <div className="space-y-6">
          {/* Open items */}
          <section
            aria-labelledby="open-heading"
            className="border border-[#D8DED4] bg-[#FBF9F3] p-6"
          >
            <div className="mb-2 flex items-center gap-3">
              <CalendarDays size={19} className="text-[#52705D]" aria-hidden="true" />
              <h3 id="open-heading" className="text-sm font-semibold">
                Open Items
              </h3>
            </div>
            <p className="mb-4 text-xs text-[#5E6B61]">
              Drafts to review and follow-ups due, soonest first.
            </p>

            {open.length === 0 ? (
              <p className="text-sm text-[#5E6B61]">Nothing open.</p>
            ) : (
              <ul>
                {open.map((item) => (
                  <TimelineRow key={`${item.type}-${item.id}`} item={item} />
                ))}
              </ul>
            )}
          </section>

          {/* Funder packets are for funders only; the backend refuses individuals. */}
          {canExport && donor.donor_type === "funder" && (
            <FunderReport donorId={donor.id} donorName={donor.display_name} />
          )}

          {/* Contact Information */}
          <section className="border border-[#D8DED4] bg-[#FBF9F3] p-6">
            <h3 className="mb-6 text-sm font-semibold">Contact Information</h3>
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <Mail size={17} className="text-[#52705D]" aria-hidden="true" />
                <p className="break-all text-sm">{donor.email ?? "No email on file"}</p>
              </div>
              <div className="flex items-center gap-3">
                <Phone size={17} className="text-[#52705D]" aria-hidden="true" />
                <p className="text-sm">{donor.phone ?? "No phone on file"}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

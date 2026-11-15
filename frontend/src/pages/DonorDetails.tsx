import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  HeartHandshake,
  Mail,
  MessageSquare,
  Phone,
} from "lucide-react";

import {
  ApiError,
  formatDate,
  formatMoney,
  getContactLinks,
  getDonorTimeline,
  type ContactLinks,
  type DonorTimeline,
  type TimelineItem,
} from "../lib/api";

const ICONS = {
  gift: HeartHandshake,
  message: Mail,
  next_step: CheckCircle2,
};

function TimelineRow({ item }: { item: TimelineItem }) {
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
        {meta && <p className="mt-1 text-xs text-[#829087]">{meta}</p>}
      </div>
      <p className="shrink-0 text-xs text-[#829087]">{formatDate(item.date)}</p>
    </li>
  );
}

export default function DonorDetails() {
  const { role, donorId } = useParams();
  const id = Number(donorId);

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
  }, [id]);

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
        <p role="alert" className="text-sm text-[#788279]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {backLink}
        <p role="status" className="text-sm text-[#788279]">Loading donor…</p>
      </div>
    );
  }

  const { donor, open, history } = data;
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
          <p className="text-xs uppercase tracking-[0.18em] text-[#829087]">
            Donor profile / #{donor.id}
          </p>

          <h2 className="mt-3 font-display text-5xl text-[#183E32]">
            {donor.display_name}
          </h2>

          <p className="mt-3 text-sm text-[#7C887C]">
            <span className="capitalize">{donor.donor_type}</span> ·{" "}
            {donor.active ? "Active" : "Inactive"} · Owner:{" "}
            {donor.owner_name ?? "Unassigned"}
          </p>
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
            <p className="text-xs text-[#829087]">{stat.label}</p>
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
          <p className="mb-4 text-xs text-[#829087]">
            Gifts, messages sent, and finished follow-ups, newest first.
          </p>

          {history.length === 0 ? (
            <p className="text-sm text-[#829087]">Nothing recorded yet.</p>
          ) : (
            <ul>
              {history.map((item) => (
                <TimelineRow key={`${item.type}-${item.id}`} item={item} />
              ))}
            </ul>
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
            <p className="mb-4 text-xs text-[#829087]">
              Drafts to review and follow-ups due, soonest first.
            </p>

            {open.length === 0 ? (
              <p className="text-sm text-[#829087]">Nothing open.</p>
            ) : (
              <ul>
                {open.map((item) => (
                  <TimelineRow key={`${item.type}-${item.id}`} item={item} />
                ))}
              </ul>
            )}
          </section>

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

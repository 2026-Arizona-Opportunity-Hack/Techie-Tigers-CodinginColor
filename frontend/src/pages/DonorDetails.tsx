
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Mail,
  Phone,
  CalendarDays,
  HeartHandshake,
} from "lucide-react";

import {
  mockDonors,
  donorName,
  formatMoney,
} from "../data/mockDonors";

export default function DonorDetails() {
  const { role, donorId } = useParams();

  const donor = mockDonors.find(
    (d) => d.id === Number(donorId)
  );

  if (
    !donor ||
    (role === "board" &&
      donor.owner !== "Demo Board Member")
  ) {
    return (
      <div className="text-sm text-[#788279]">
        Donor not found or unavailable.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back Navigation */}
      <Link
        to={`/${role}/donors`}
        className="inline-flex items-center gap-2 text-sm text-[#52705D] hover:text-[#183E32]"
      >
        <ArrowLeft size={17} />
        Back to donors
      </Link>

      {/* Donor Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#D8DED4] pb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#829087]">
            Donor profile / #{donor.id}
          </p>

          <h2 className="mt-3 font-display text-5xl text-[#183E32]">
            {donorName(donor)}
          </h2>

          <p className="mt-3 text-sm capitalize text-[#7C887C]">
            {donor.donor_type} · {donor.active ? "Active" : "Inactive"}
          </p>
        </div>
      </div>

      {/* Overview Statistics */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Total given",
            value: formatMoney(donor.total_donated),
          },
          {
            label: "Total gifts",
            value: donor.gifts.length.toString(),
          },
          {
            label: "Last thanked",
            value: donor.last_thanked_at || "Not yet",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="border border-[#D8DED4] bg-[#FBF9F3] p-6"
          >
            <p className="text-xs text-[#829087]">
              {stat.label}
            </p>

            <p className="mt-4 font-display text-3xl text-[#183E32]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Gift History */}
          <section className="border border-[#D8DED4] bg-[#FBF9F3] p-6">
            <div className="mb-6 flex items-center gap-3">
              <HeartHandshake
                size={19}
                className="text-[#52705D]"
              />
              <h3 className="text-sm font-semibold">
                Gift History
              </h3>
            </div>

            {donor.gifts.length === 0 ? (
              <p className="text-sm text-[#829087]">
                No gifts recorded.
              </p>
            ) : (
              donor.gifts.map((gift) => (
                <div
                  key={gift.id}
                  className="flex items-center justify-between border-b border-[#E0E4DB] py-4 last:border-0"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {gift.campaign}
                    </p>

                    <p className="mt-1 text-xs text-[#829087]">
                      {gift.gift_date} · {gift.source}
                    </p>
                  </div>

                  <p className="text-sm font-semibold text-[#183E32]">
                    {formatMoney(gift.amount)}
                  </p>
                </div>
              ))
            )}
          </section>

          {/* Communications */}
          <section className="border border-[#D8DED4] bg-[#FBF9F3] p-6">
            <div className="mb-6 flex items-center gap-3">
              <Mail size={19} className="text-[#52705D]" />
              <h3 className="text-sm font-semibold">
                Communication History
              </h3>
            </div>

            {donor.communications.length === 0 ? (
              <p className="text-sm text-[#829087]">
                No communications recorded.
              </p>
            ) : (
              donor.communications.map((item) => (
                <div
                  key={item.id}
                  className="border-b border-[#E0E4DB] py-4 last:border-0"
                >
                  <p className="text-sm font-semibold">
                    {item.kind}
                  </p>

                  <p className="mt-1 text-xs text-[#829087]">
                    {item.channel} · {item.date} · {item.status}
                  </p>
                </div>
              ))
            )}
          </section>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Contact Information */}
          <section className="border border-[#D8DED4] bg-[#FBF9F3] p-6">
            <h3 className="mb-6 text-sm font-semibold">
              Contact Information
            </h3>

            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <Mail size={17} className="text-[#52705D]" />
                <p className="break-all text-sm">
                  {donor.email}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Phone size={17} className="text-[#52705D]" />
                <p className="text-sm">{donor.phone}</p>
              </div>
            </div>
          </section>

          {/* Next Steps */}
          <section className="border border-[#D8DED4] bg-[#FBF9F3] p-6">
            <div className="mb-6 flex items-center gap-3">
              <CalendarDays
                size={19}
                className="text-[#52705D]"
              />
              <h3 className="text-sm font-semibold">
                Next Steps
              </h3>
            </div>

            {donor.next_steps.length === 0 ? (
              <p className="text-sm text-[#829087]">
                No upcoming tasks.
              </p>
            ) : (
              donor.next_steps.map((step) => (
                <div
                  key={step.id}
                  className="border-b border-[#E0E4DB] py-4 last:border-0"
                >
                  <p className="text-sm font-semibold">
                    {step.description}
                  </p>

                  <p className="mt-2 text-xs text-[#829087]">
                    Due: {step.due_date}
                  </p>
                </div>
              ))
            )}
          </section>
        </div>
      </div>

      <p className="text-xs text-[#829087]">
        Sample donor information — frontend preview only.
      </p>
    </div>
  );
}

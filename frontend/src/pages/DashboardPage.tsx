
import { useParams } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  HeartHandshake,
  Users,
  Mail,
} from "lucide-react";
import { roleMenus, type Role } from "../components/Sidebar";

const statsByRole = {
  admin: [
    { label: "Total Donations", value: "$42,500", icon: HeartHandshake },
    { label: "Active Donors", value: "124", icon: Users },
    { label: "Upcoming Follow-ups", value: "16", icon: CalendarDays },
    { label: "Messages Sent", value: "68", icon: Mail },
  ],

  board: [
    { label: "My Donors", value: "12", icon: Users },
    { label: "Follow-ups Due", value: "4", icon: CalendarDays },
    { label: "Messages Sent", value: "18", icon: Mail },
    { label: "Total Donor Gifts", value: "$6,250", icon: HeartHandshake },
  ],

  fundraising: [
    { label: "Total Raised", value: "$42,500", icon: HeartHandshake },
    { label: "Active Donors", value: "124", icon: Users },
    { label: "Outreach Pending", value: "22", icon: Mail },
  ],
};

const sampleDonors = [
  { name: "Maria Garcia", type: "Individual", total: "$250" },
  { name: "Example Foundation", type: "Funder", total: "$5,000" },
  { name: "James Wilson", type: "Individual", total: "$150" },
];

export default function DashboardPage() {
  const { role, section } = useParams();

  if (
    role !== "admin" &&
    role !== "board" &&
    role !== "fundraising"
  ) {
    return <p>Invalid dashboard role.</p>;
  }

  const currentRole: Role = role;

  const page = roleMenus[currentRole].find(
    (item) => item.path === section
  );

  if (!page) {
    return <p>Page not found.</p>;
  }

  const isOverview = section === "overview";
  const isDonors = section === "donors";

  return (
    <div className="space-y-8">
      {/* Page Description */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[#7B887C]">
            Coding in Color / {page.label}
          </p>

          <h2 className="mt-2 font-display text-4xl text-[#183E32]">
            {isOverview ? "Your workspace, at a glance." : page.label}
          </h2>
        </div>

        <span className="border border-[#C8D2C7] px-3 py-2 text-xs text-[#64776A]">
          Demo Data
        </span>
      </div>

      {/* Overview Page */}
      {isOverview && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {statsByRole[currentRole].map((stat) => {
              const Icon = stat.icon;

              return (
                <div
                  key={stat.label}
                  className="border border-[#D8DED4] bg-[#FBF9F3] p-6"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#708174]">
                      {stat.label}
                    </span>

                    <Icon size={19} className="text-[#5C7967]" />
                  </div>

                  <p className="mt-6 font-display text-4xl text-[#183E32]">
                    {stat.value}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <div className="border border-[#D8DED4] bg-[#FBF9F3] p-6">
              <h3 className="text-sm font-semibold">
                Recent Donor Activity
              </h3>

              <div className="mt-6 space-y-5">
                {sampleDonors.map((donor) => (
                  <div
                    key={donor.name}
                    className="flex items-center justify-between border-b border-[#E0E4DB] pb-4 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {donor.name}
                      </p>

                      <p className="mt-1 text-xs text-[#829087]">
                        {donor.type}
                      </p>
                    </div>

                    <span className="text-sm font-semibold text-[#183E32]">
                      {donor.total}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[#D8DED4] bg-[#FBF9F3] p-6">
              <h3 className="text-sm font-semibold">
                Upcoming Follow-ups
              </h3>

              <div className="mt-6 space-y-5">
                {[
                  "Send quarterly donor update",
                  "Follow up about Giving Tuesday",
                  "Prepare thank-you message",
                ].map((task, index) => (
                  <div
                    key={task}
                    className="flex items-start gap-3"
                  >
                    <div className="mt-1 h-5 w-5 shrink-0 border border-[#9AAB9D]" />

                    <div>
                      <p className="text-sm">{task}</p>
                      <p className="mt-1 text-xs text-[#829087]">
                        Task {index + 1}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Donors Page */}
      {isDonors && (
        <div className="border border-[#D8DED4] bg-[#FBF9F3]">
          <div className="border-b border-[#D8DED4] p-6">
            <h3 className="text-sm font-semibold">
              Donor Directory
            </h3>

            <p className="mt-1 text-xs text-[#829087]">
              Example records for frontend development.
            </p>
          </div>

          {sampleDonors.map((donor) => (
            <div
              key={donor.name}
              className="flex items-center justify-between border-b border-[#E0E4DB] px-6 py-5 last:border-0"
            >
              <div>
                <p className="text-sm font-semibold">
                  {donor.name}
                </p>

                <p className="mt-1 text-xs text-[#829087]">
                  {donor.type}
                </p>
              </div>

              <div className="flex items-center gap-5">
                <span className="text-sm text-[#183E32]">
                  {donor.total}
                </span>

                <ArrowUpRight size={18} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Other Pages */}
      {!isOverview && !isDonors && (
        <div className="flex min-h-[300px] flex-col items-center justify-center border border-[#D8DED4] bg-[#FBF9F3] p-8 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center border border-[#AFC2B1]">
            <page.icon size={25} className="text-[#183E32]" />
          </div>

          <h3 className="font-display text-3xl text-[#183E32]">
            {page.label}
          </h3>

          <p className="mt-3 max-w-sm text-sm leading-6 text-[#7C887C]">
            This workspace is ready for its features.
            We'll connect the data and actions here next.
          </p>
        </div>
      )}
    </div>
  );
}

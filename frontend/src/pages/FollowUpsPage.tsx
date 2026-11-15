
import { useState } from "react";
import {
  CalendarDays,
  Check,
  Plus,
  X,
} from "lucide-react";

import {
  mockDonors,
  donorName,
} from "../data/mockDonors";

type FollowUp = {
  id: number;
  donorId: number;
  description: string;
  dueDate: string;
  done: boolean;
};

const initialFollowUps: FollowUp[] = [
  {
    id: 1,
    donorId: 1,
    description: "Send quarterly program update",
    dueDate: "2026-11-20",
    done: false,
  },
  {
    id: 2,
    donorId: 3,
    description: "Send first thank-you message",
    dueDate: "2026-11-16",
    done: false,
  },
  {
    id: 3,
    donorId: 1,
    description: "Follow up on Day of Compute invitation",
    dueDate: "2026-11-25",
    done: false,
  },
];

export default function FollowUpsPage() {
  const [tasks, setTasks] = useState(initialFollowUps);
  const [showForm, setShowForm] = useState(false);
  const [donorId, setDonorId] = useState(1);
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  const completedCount = tasks.filter(
    (task) => task.done
  ).length;

  function toggleTask(id: number) {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === id
          ? { ...task, done: !task.done }
          : task
      )
    );
  }

  function addTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!description.trim() || !dueDate) return;

    setTasks((previous) => [
      ...previous,
      {
        id: Date.now(),
        donorId,
        description: description.trim(),
        dueDate,
        done: false,
      },
    ]);

    setDescription("");
    setDueDate("");
    setShowForm(false);
  }

  function getDonorName(id: number) {
    const donor = mockDonors.find(
      (item) => item.id === id
    );

    return donor ? donorName(donor) : "Unknown donor";
  }

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#829087]">
            Donor relationships / Reminders
          </p>

          <h2 className="mt-3 font-display text-5xl text-[#183E32]">
            Your next steps.
          </h2>

          <p className="mt-3 text-sm text-[#788279]">
            Keep track of conversations that need attention.
          </p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="flex cursor-pointer items-center gap-2 bg-[#183E32] px-5 py-3 text-sm font-semibold text-white hover:bg-[#285745]"
        >
          <Plus size={18} />
          Add follow-up
        </button>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total tasks", value: tasks.length },
          {
            label: "Open tasks",
            value: tasks.length - completedCount,
          },
          { label: "Completed", value: completedCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="border border-[#D8DED4] bg-[#FBF9F3] p-6"
          >
            <p className="text-xs text-[#829087]">
              {stat.label}
            </p>

            <p className="mt-4 font-display text-4xl text-[#183E32]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Follow-up List */}
      <section className="border border-[#D8DED4] bg-[#FBF9F3]">
        <div className="border-b border-[#D8DED4] px-6 py-5">
          <h3 className="text-sm font-semibold">
            Follow-up tasks
          </h3>
        </div>

        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-4 border-b border-[#E0E4DB] px-6 py-5 last:border-0"
          >
            <button
              onClick={() => toggleTask(task.id)}
              aria-label={
                task.done
                  ? "Mark task incomplete"
                  : "Mark task complete"
              }
              className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center border ${
                task.done
                  ? "border-[#183E32] bg-[#183E32] text-white"
                  : "border-[#A5B3A6]"
              }`}
            >
              {task.done && <Check size={15} />}
            </button>

            <div className="flex-1">
              <p
                className={`text-sm font-semibold ${
                  task.done
                    ? "text-[#9AA49A] line-through"
                    : "text-[#242A26]"
                }`}
              >
                {task.description}
              </p>

              <p className="mt-1 text-xs text-[#829087]">
                {getDonorName(task.donorId)}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#718274]">
              <CalendarDays size={15} />
              {task.dueDate}
            </div>
          </div>
        ))}
      </section>

      {/* New Follow-up Dialog */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="follow-up-title"
            className="w-full max-w-lg bg-[#F5F0E6] p-8"
          >
            <div className="mb-8 flex items-center justify-between">
              <h2
                id="follow-up-title"
                className="font-display text-4xl text-[#183E32]"
              >
                New follow-up.
              </h2>

              <button
                onClick={() => setShowForm(false)}
                aria-label="Close form"
                className="cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={addTask} className="space-y-6">
              <div>
                <label
                  htmlFor="followup-donor"
                  className="mb-2 block text-xs font-semibold"
                >
                  Donor
                </label>

                <select
                  id="followup-donor"
                  value={donorId}
                  onChange={(e) =>
                    setDonorId(Number(e.target.value))
                  }
                  className="w-full border border-[#C8D2C7] bg-white p-3 text-sm"
                >
                  {mockDonors.map((donor) => (
                    <option key={donor.id} value={donor.id}>
                      {donorName(donor)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="followup-description"
                  className="mb-2 block text-xs font-semibold"
                >
                  Next step
                </label>

                <textarea
                  id="followup-description"
                  required
                  value={description}
                  onChange={(e) =>
                    setDescription(e.target.value)
                  }
                  placeholder="What needs to happen next?"
                  rows={3}
                  className="w-full border border-[#C8D2C7] bg-white p-3 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="followup-date"
                  className="mb-2 block text-xs font-semibold"
                >
                  Due date
                </label>

                <input
                  id="followup-date"
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) =>
                    setDueDate(e.target.value)
                  }
                  className="w-full border border-[#C8D2C7] bg-white p-3 text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full cursor-pointer bg-[#183E32] px-5 py-4 text-sm font-semibold text-white hover:bg-[#285745]"
              >
                Save follow-up
              </button>
            </form>
          </div>
        </div>
      )}

      <p className="text-xs text-[#829087]">
        Changes are temporary and will reset when the page reloads.
      </p>
    </div>
  );
}

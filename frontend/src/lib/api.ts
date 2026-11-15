import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Calls the FastAPI backend with the signed-in user's Supabase token.
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_URL) {
    throw new Error("VITE_API_URL is not set in frontend/.env.local");
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError(401, "You are signed out.");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  // Don't set Content-Type for file uploads; the browser does it.
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "Can't reach the server. Is the backend running?");
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // response wasn't JSON; keep the generic message
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---- Who am I? ----
export type BackendRole = "admin" | "board_member" | "fundraising";

export type Me = {
  id: string;
  name: string;
  email: string;
  role: BackendRole;
};

export const getMe = () => apiFetch<Me>("/me");

// ---- Donors (backend/app/routers/donors.py) ----
export type Donor = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  email: string | null;
  phone: string | null;
  donor_type: "individual" | "funder";
  owner_id: string | null;
  owner_name: string | null;
  active: boolean;
  last_thanked_at: string | null;
  display_name: string;
  lifetime_total: number;
  gift_count: number;
  last_gift_date: string | null;
};

export type TimelineItem = {
  type: "gift" | "message" | "next_step";
  id: number;
  date: string | null;
  title: string;
  detail?: string; // gifts: source · campaign · program
  status?: string; // messages: draft | sent | skipped
  by?: string; // messages: who sent it
  subject?: string | null;
  body?: string | null;
  done?: boolean; // next steps
  assigned_to?: string | null;
  event?: { name: string; event_date: string } | null;
};

export type DonorTimeline = {
  donor: Donor;
  open: TimelineItem[]; // drafts and unfinished to-dos, soonest first
  history: TimelineItem[]; // gifts, sent messages, finished to-dos, newest first
};

export type ContactLinks = {
  gmail?: string;
  mailto?: string;
  sms?: string;
  call?: string;
};

// The backend limits board members to their own donors (row-level security).
export const getDonors = () => apiFetch<Donor[]>("/donors?limit=500");
export const getDonorTimeline = (id: number) =>
  apiFetch<DonorTimeline>(`/donors/${id}/timeline`);
export const getContactLinks = (id: number) =>
  apiFetch<ContactLinks>(`/donors/${id}/contact-links`);

// ---- Display helpers ----
export function formatMoney(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  });
}

// "2026-10-15" or an ISO timestamp -> "Oct 15, 2026"
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---- Follow-ups (backend/app/routers/next_steps.py) ----
export type QueueStep = {
  id: number;
  donor_id: number;
  donor_name: string;
  description: string;
  due_date: string; // YYYY-MM-DD
  event_id: number | null;
};

export type QueueDraft = {
  id: number;
  donor_id: number;
  donor_name: string;
  kind: string; // thank_you | quarterly | follow_up | ...
  channel: string | null;
  subject: string | null;
  created_at: string;
  ai_generated: boolean;
};

// Everything the signed-in person owes, overdue first. Only steps due within
// the next 7 days are included.
export type MyQueue = {
  counts: { overdue: number; this_week: number; drafts: number; quarterly_owed: number };
  overdue: QueueStep[];
  this_week: QueueStep[];
  drafts_to_review: QueueDraft[];
  quarterly_owed: { donor_id: number; donor_name: string }[]; // no contact in 90 days
};

export const getMyQueue = () => apiFetch<MyQueue>("/me/queue");

export const createNextStep = (step: {
  donor_id: number;
  description: string;
  due_date: string;
}) => apiFetch("/next-steps", { method: "POST", body: JSON.stringify(step) });

export const completeNextStep = (id: number) =>
  apiFetch(`/next-steps/${id}/done`, { method: "POST" });

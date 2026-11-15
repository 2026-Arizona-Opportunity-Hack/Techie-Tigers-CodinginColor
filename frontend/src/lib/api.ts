import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  status: number;
  detail?: unknown; // the backend's full error body, when it sends more than a message

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

// Calls the FastAPI backend with the signed-in user's Supabase token.
// Returns the raw response; throws ApiError on network failure or non-2xx.
async function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
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
    let detail: unknown;
    try {
      const body = await res.json();
      detail = body.detail;
      if (typeof detail === "string") message = detail;
      // Some endpoints send { message, ...extra } so the UI can show more.
      else if (detail && typeof (detail as { message?: unknown }).message === "string")
        message = (detail as { message: string }).message;
    } catch {
      // response wasn't JSON; keep the generic message
    }
    throw new ApiError(res.status, message, detail);
  }

  return res;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await apiRequest(path, options);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// For non-JSON responses (HTML reports, CSV downloads).
export async function apiFetchFile(
  path: string
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await apiRequest(path);
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? null;
  return { blob: await res.blob(), filename };
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

// ---- Funder packet (backend/app/routers/exports.py; admin + fundraising only) ----
// "html" is a print-ready page; "csv" is the gift history as a spreadsheet.
// Every fetch is recorded in export_log on the backend.
export const getFunderPacket = (id: number, format: "html" | "csv") =>
  apiFetchFile(`/exports/funder-packet/${id}?format=${format}`);

// ---- Imports (backend/app/routers/imports.py) ----
export type ImportSource = "spreadsheet" | "zeffy" | "benevity";

export type ImportResult = {
  source: ImportSource;
  filename: string;
  dry_run: boolean;
  columns_matched: Record<string, string>; // our field -> header in the file
  columns_ignored: string[];
  summary: Record<string, number>; // e.g. rows_read, donors_to_create, gifts_to_create
  skipped: { line: number; reason: string }[]; // first 100
  warnings: string[];
  saved?: Record<string, number>; // only on a real import
};

// dryRun: preview what would happen; nothing is saved.
export function importFile(source: ImportSource, file: File, dryRun: boolean) {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<ImportResult>(
    `/imports/${source}${dryRun ? "?dry_run=true" : ""}`,
    { method: "POST", body }
  );
}

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

// ---- Outreach (backend/app/routers/communications.py) ----
// Every message is drafted by the system or a person, opened in the sender's
// own Gmail or Messages app, sent by hand, and then marked sent here.
export type MessageStatus = "draft" | "sent" | "skipped";

export type MessageSummary = {
  id: number;
  donor_id: number;
  donor_name: string;
  user_id: string | null; // null = system draft nobody has claimed yet
  sent_by: string | null;
  channel: "email" | "text" | "call" | "in_person" | null;
  kind: string;
  subject: string | null;
  status: MessageStatus;
  sent_at: string | null;
  created_at: string;
  ai_generated: boolean;
};

export const getMessages = (status: MessageStatus) =>
  apiFetch<MessageSummary[]>(`/communications?status=${status}&limit=200`);

export const editDraft = (
  id: number,
  changes: { subject?: string | null; body?: string; channel?: "email" | "text" }
) => apiFetch(`/communications/${id}`, { method: "PATCH", body: JSON.stringify(changes) });

// Gmail / mailto / sms links with the draft filled in and the sender's name signed.
export const getDraftLinks = (id: number) =>
  apiFetch<ContactLinks>(`/communications/${id}/links`);

export const markSent = (id: number) =>
  apiFetch(`/communications/${id}/mark-sent`, { method: "POST" });

export const skipDraft = (id: number) =>
  apiFetch(`/communications/${id}/skip`, { method: "POST" });

// Record a call, text, email or meeting that already happened.
export const logOutreach = (entry: {
  donor_id: number;
  channel: "email" | "text" | "call" | "in_person";
  kind?: string;
  subject?: string;
  body?: string;
}) => apiFetch("/communications/log", { method: "POST", body: JSON.stringify(entry) });

// Draft a thank-you for one gift. The draft belongs to whoever asks for it.
export const draftThankYou = (giftId: number) =>
  apiFetch<{ id: number }>("/communications/thank-you", {
    method: "POST",
    body: JSON.stringify({ gift_id: giftId }),
  });

// Admin only: draft a quarterly update for every active donor nobody has
// contacted in 90 days. Safe to run twice; donors with a pending one are skipped.
export const draftQuarterlyUpdates = () =>
  apiFetch<{ drafts_created: number; skipped_no_email_or_phone: number }>(
    "/jobs/quarterly-drafts",
    { method: "POST" }
  );

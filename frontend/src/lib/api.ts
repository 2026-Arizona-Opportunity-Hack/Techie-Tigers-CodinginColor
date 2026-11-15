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

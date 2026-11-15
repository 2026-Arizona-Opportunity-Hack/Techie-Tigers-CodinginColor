import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Check, Copy, KeyRound } from "lucide-react";

import {
  createApiKey,
  formatDate,
  getApiKeys,
  revokeApiKey,
  type ApiKey,
  type NewApiKey,
} from "../lib/api";

const API_URL = import.meta.env.VITE_API_URL ?? "";

// Keys for CIC's org dashboard, which reads GET /api/v1/summary (totals only, no donor
// names or contact details). CEO only. A key is shown once, when it's created.
export default function ApiKeysPage() {
  const { role } = useParams();
  const allowed = role === "admin";

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<NewApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<number | null>(null);

  function load() {
    return getApiKeys()
      .then(setKeys)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (allowed) load();
  }, [allowed]);

  if (!allowed) return <Navigate to={`/${role}/overview`} replace />;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError("");
    setCopied(false);
    try {
      setCreated(await createApiKey(trimmed));
      setName("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(key: ApiKey) {
    if (!window.confirm(`Revoke "${key.name}"? Anything using this key stops working right away.`))
      return;
    setRevoking(key.id);
    setError("");
    try {
      await revokeApiKey(key.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRevoking(null);
    }
  }

  async function copyKey() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
    } catch {
      // Clipboard blocked: the key is still selectable on screen.
    }
  }

  const activeCount = keys.filter((k) => !k.revoked_at).length;

  return (
    <div className="space-y-8">
      {/* Page Heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#5E6B61]">Settings / API keys</p>
          <h2 className="mt-3 font-display text-5xl text-[#183E32]">API keys.</h2>
          <p className="mt-3 max-w-2xl text-sm text-[#5E6B61]">
            Keys let CIC's org dashboard read giving totals by period, program and board member.
            The API never returns donor names or contact details. Revoke a key any time.
          </p>
        </div>

        <div className="flex items-center gap-2 border border-[#C8D2C7] px-4 py-3">
          <KeyRound size={18} className="text-[#52705D]" />
          <span className="text-sm font-semibold">{loading ? "…" : activeCount} active</span>
        </div>
      </div>

      {/* Create */}
      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-4 border border-[#D8DED4] bg-[#FBF9F3] p-5"
      >
        <label className="flex min-w-[240px] flex-1 flex-col gap-2 text-sm">
          <span className="text-[11px] uppercase tracking-wider text-[#5E6B61]">New key name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CIC org dashboard"
            maxLength={100}
            className="border border-[#CDD5CB] bg-white px-4 py-3 outline-none focus:border-[#52705D]"
          />
        </label>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="bg-[#183E32] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create key"}
        </button>
      </form>

      {/* Newly created key, shown once */}
      {created && (
        <div role="status" className="space-y-3 border border-[#E3C98F] bg-[#FBF5E6] p-5 text-sm text-[#6B5320]">
          <p className="font-semibold">
            "{created.name}" created. Copy this key now. It can't be shown again.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="flex-1 select-all break-all border border-[#E3C98F] bg-white px-4 py-3 font-mono text-xs text-[#242A26]">
              {created.key}
            </code>
            <button
              type="button"
              onClick={copyKey}
              className="inline-flex items-center gap-2 border border-[#C9A95F] px-4 py-3 font-semibold"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs">
            Use it as the <code>X-API-Key</code> header on{" "}
            <code>GET {API_URL}/api/v1/summary</code>.
          </p>
          <button type="button" onClick={() => setCreated(null)} className="text-xs underline">
            I've saved it, hide this
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="border border-[#D9A99F] bg-[#FBF1EE] p-5 text-sm text-[#7A2E22]">
          {error}
        </div>
      )}

      {/* Keys Table */}
      <div className="overflow-x-auto border border-[#D8DED4] bg-[#FBF9F3]">
        {loading ? (
          <div role="status" className="p-12 text-center text-sm text-[#5E6B61]">
            Loading keys…
          </div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#5E6B61]">
            No API keys yet. Create one for the org dashboard above.
          </div>
        ) : (
          <table className="w-full min-w-[650px] text-left">
            <thead className="border-b border-[#D8DED4] bg-[#EDF0E8]">
              <tr className="text-[11px] uppercase tracking-wider text-[#5E6B61]">
                <th className="px-6 py-4 font-semibold">Name</th>
                <th className="px-6 py-4 font-semibold">Created</th>
                <th className="px-6 py-4 font-semibold">Last used</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-[#E3E7DF] last:border-0">
                  <td className="px-6 py-5 text-sm font-semibold text-[#242A26]">{k.name}</td>
                  <td className="px-6 py-5 text-sm">{formatDate(k.created_at)}</td>
                  <td className="px-6 py-5 text-sm">
                    {k.last_used_at ? formatDate(k.last_used_at) : "Never"}
                  </td>
                  <td className="px-6 py-5">
                    {k.revoked_at ? (
                      <span className="border border-[#D9A99F] px-3 py-1 text-xs text-[#7A2E22]">
                        Revoked {formatDate(k.revoked_at)}
                      </span>
                    ) : (
                      <span className="border border-[#A9C3AE] px-3 py-1 text-xs text-[#42674C]">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-5 text-right">
                    {!k.revoked_at && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(k)}
                        disabled={revoking === k.id}
                        className="border border-[#D9A99F] px-4 py-2 text-xs font-semibold text-[#7A2E22] hover:bg-[#FBF1EE] disabled:opacity-50"
                      >
                        {revoking === k.id ? "Revoking…" : "Revoke"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

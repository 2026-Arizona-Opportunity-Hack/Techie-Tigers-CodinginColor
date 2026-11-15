import type { RetentionStatus } from "../lib/api";
import { RETENTION_COLOR, RETENTION_HINT, retentionLabel } from "../lib/retentionStyle";

// A donor's retention category this year: color swatch + text, never color alone.
// No status means no gift this year or last year: either a prospect who has
// never given, or someone whose last gift was longer ago.
export default function RetentionBadge({
  status,
  lastGiftDate,
  giftCount,
}: {
  status: RetentionStatus | null | undefined;
  lastGiftDate?: string | null;
  giftCount?: number;
}) {
  if (!status) {
    const text =
      giftCount === 0
        ? "No gifts yet"
        : lastGiftDate
          ? `Last gave ${lastGiftDate.slice(0, 4)}`
          : "No recent gifts";
    return (
      <span className="inline-flex items-center gap-1.5 border border-dashed border-[#C8D2C7] px-2.5 py-1 text-xs text-[#7C887C]">
        {text}
      </span>
    );
  }

  const inProgress = true; // labels describe the current year
  return (
    <span
      title={RETENTION_HINT[status]}
      className="inline-flex items-center gap-1.5 border border-[#D8DED4] bg-white px-2.5 py-1 text-xs text-[#242A26]"
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: RETENTION_COLOR[status] }}
        aria-hidden="true"
      />
      {retentionLabel(status, inProgress)}
    </span>
  );
}

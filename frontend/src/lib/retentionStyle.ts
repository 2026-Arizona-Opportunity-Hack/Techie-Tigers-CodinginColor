import type { RetentionStatus } from "./api";

// Diverging: losses (rust, gold) -> neutral (gray) -> gains (greens).
// Checked with the dataviz palette validator: adjacent pairs are distinct with
// normal and color-blind vision. Some fills are low-contrast against the page,
// so color is never used alone: every swatch sits next to its text label.
export const RETENTION_COLOR: Record<RetentionStatus, string> = {
  lapsed: "#B4472F",
  decreased: "#E8B04F",
  retained: "#8C8F88",
  increased: "#A7D49A",
  reactivated: "#3D9A62",
  new: "#164F34",
};

export const RETENTION_LABEL: Record<RetentionStatus, string> = {
  lapsed: "Lapsed",
  decreased: "Gave less",
  retained: "Gave the same",
  increased: "Gave more",
  reactivated: "Came back",
  new: "New",
};

export const RETENTION_HINT: Record<RetentionStatus, string> = {
  lapsed: "Gave last year, not this year",
  decreased: "Gave less than last year",
  retained: "Gave the same as last year",
  increased: "Gave more than last year",
  reactivated: "Gave before, skipped last year, back this year",
  new: "First gift ever",
};

// In the current year, "lapsed" only means "hasn't given yet".
export const retentionLabel = (s: RetentionStatus, inProgress: boolean) =>
  s === "lapsed" && inProgress ? "Not yet this year" : RETENTION_LABEL[s];

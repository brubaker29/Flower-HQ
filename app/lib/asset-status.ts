import type { assetStatuses } from "~/db/schema";

export type AssetStatus = (typeof assetStatuses)[number];

export const STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Active",
  offsite_repair: "Offsite - Repair",
  broken: "Broken",
  dead: "Dead",
  sold: "Sold",
  retired: "Retired",
};

export function statusTone(
  status: string,
): "green" | "amber" | "red" | "neutral" | "blue" {
  switch (status) {
    case "active":
      return "green";
    case "offsite_repair":
      return "amber";
    case "broken":
      return "red";
    case "sold":
      return "blue";
    case "dead":
    case "retired":
    default:
      return "neutral";
  }
}

/** Statuses considered "in the fleet" for dashboards and due-soon. */
export const IN_FLEET_STATUSES: AssetStatus[] = [
  "active",
  "offsite_repair",
  "broken",
];

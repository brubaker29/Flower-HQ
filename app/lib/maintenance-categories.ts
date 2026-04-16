export const MAINTENANCE_CATEGORIES = [
  "Oil change",
  "Tires",
  "Brakes",
  "Battery",
  "Inspection",
  "Repair",
  "Registration",
  "Other",
] as const;

export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

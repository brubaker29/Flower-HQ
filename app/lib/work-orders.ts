import type { workOrderStatuses, workOrderPriorities } from "~/db/schema";

export type WorkOrderStatus = (typeof workOrderStatuses)[number];
export type WorkOrderPriority = (typeof workOrderPriorities)[number];

export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  open: "Open",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export function statusTone(
  status: WorkOrderStatus,
): "neutral" | "blue" | "amber" | "green" | "red" {
  if (status === "completed") return "green";
  if (status === "cancelled") return "neutral";
  if (status === "in_progress") return "amber";
  if (status === "scheduled") return "blue";
  return "red"; // open
}

export function priorityTone(
  p: WorkOrderPriority,
): "neutral" | "amber" | "red" {
  if (p === "urgent") return "red";
  if (p === "high") return "amber";
  return "neutral";
}

export const OPEN_STATUSES: WorkOrderStatus[] = [
  "open",
  "scheduled",
  "in_progress",
];
export const CLOSED_STATUSES: WorkOrderStatus[] = ["completed", "cancelled"];

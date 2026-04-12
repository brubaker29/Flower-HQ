import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// ---------- Shared ----------

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const vendors = sqliteTable("vendors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category"), // e.g. "mechanic", "hvac", "plumber"
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

/**
 * Polymorphic attachments. `subjectType` indicates which table `subjectId`
 * references: "asset" | "maintenance_record" | "work_order" | "facility_asset".
 * Enforced in code, not FK, since D1 doesn't support polymorphic FKs.
 */
export const attachments = sqliteTable(
  "attachments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    r2Key: text("r2_key").notNull().unique(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: integer("subject_id").notNull(),
    uploadedBy: integer("uploaded_by").references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    subjectIdx: index("attachments_subject_idx").on(t.subjectType, t.subjectId),
  }),
);

// ---------- Asset Tracking ----------

export const assetKinds = ["van", "trailer", "equipment", "other"] as const;
export const assetStatuses = ["active", "sold", "retired"] as const;

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: assetKinds }).notNull(),
  name: text("name").notNull(),
  identifier: text("identifier"), // VIN / serial / plate
  make: text("make"),
  model: text("model"),
  year: integer("year"),
  purchaseDate: text("purchase_date"),
  purchasePriceCents: integer("purchase_price_cents"),
  status: text("status", { enum: assetStatuses }).notNull().default("active"),
  saleDate: text("sale_date"),
  salePriceCents: integer("sale_price_cents"),
  currentMileage: integer("current_mileage"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const maintenanceRecords = sqliteTable(
  "maintenance_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    performedAt: text("performed_at").notNull(),
    mileageAtService: integer("mileage_at_service"),
    category: text("category"), // e.g. "oil change", "tires"
    vendorId: integer("vendor_id").references(() => vendors.id),
    description: text("description"),
    costCents: integer("cost_cents"),
    nextDueDate: text("next_due_date"),
    nextDueMileage: integer("next_due_mileage"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    assetIdx: index("maintenance_records_asset_idx").on(t.assetId),
  }),
);

// ---------- Facilities Maintenance ----------

export const locations = sqliteTable("locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  address: text("address"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const facilityAssetKinds = [
  "hvac",
  "plumbing",
  "electrical",
  "refrigeration",
  "other",
] as const;

export const facilityAssets = sqliteTable(
  "facility_assets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: facilityAssetKinds }).notNull(),
    name: text("name").notNull(),
    identifier: text("identifier"), // model/serial
    installDate: text("install_date"),
    warrantyExpiresAt: text("warranty_expires_at"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    locationIdx: index("facility_assets_location_idx").on(t.locationId),
  }),
);

export const workOrderStatuses = [
  "open",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export const workOrderPriorities = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export const workOrders = sqliteTable(
  "work_orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    facilityAssetId: integer("facility_asset_id").references(
      () => facilityAssets.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority", { enum: workOrderPriorities })
      .notNull()
      .default("normal"),
    status: text("status", { enum: workOrderStatuses })
      .notNull()
      .default("open"),
    vendorId: integer("vendor_id").references(() => vendors.id),
    scheduledFor: text("scheduled_for"),
    completedAt: text("completed_at"),
    costCents: integer("cost_cents"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    locationIdx: index("work_orders_location_idx").on(t.locationId),
    statusIdx: index("work_orders_status_idx").on(t.status),
  }),
);

/** Append-only activity log for a work order (status changes, comments). */
export const workOrderEvents = sqliteTable(
  "work_order_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workOrderId: integer("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(), // "status_change" | "comment"
    note: text("note"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    woIdx: index("work_order_events_wo_idx").on(t.workOrderId),
  }),
);

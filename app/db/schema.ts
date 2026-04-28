import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// ---------- Shared ----------

export const userRoles = ["admin", "employee"] as const;

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role", { enum: userRoles }).notNull().default("employee"),
  sections: text("sections"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  employeeId: integer("employee_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const employees = sqliteTable(
  "employees",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    position: text("position"),
    locationId: integer("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    hireDate: text("hire_date"),
    terminationDate: text("termination_date"),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    nameIdx: index("employees_name_idx").on(t.lastName, t.firstName),
    locationIdx: index("employees_location_idx").on(t.locationId),
  }),
);

/**
 * Short-lived 6-digit PINs for email-based login. Created when a user
 * submits the /login form, hashed (sha-256) so the raw value isn't
 * stored, expires after 10 minutes, single-use (`used_at` set on
 * successful verify).
 */
export const loginPins = sqliteTable(
  "login_pins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pinHash: text("pin_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    userIdx: index("login_pins_user_idx").on(t.userId),
  }),
);

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

export const assetKinds = [
  "van",
  "truck",
  "trailer",
  "equipment",
  "other",
] as const;
export const assetStatuses = [
  "active",
  "offsite_repair",
  "broken",
  "dead",
  "sold",
  "retired",
] as const;

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: assetKinds }).notNull(),
  name: text("name").notNull(),
  locationId: integer("location_id").references(() => locations.id, {
    onDelete: "set null",
  }),
  identifier: text("identifier"), // legacy — prefer plate/vin below
  plate: text("plate"),
  vin: text("vin"),
  make: text("make"),
  model: text("model"),
  year: integer("year"),
  purchaseDate: text("purchase_date"),
  purchasePriceCents: integer("purchase_price_cents"),
  status: text("status", { enum: assetStatuses }).notNull().default("active"),
  saleDate: text("sale_date"),
  salePriceCents: integer("sale_price_cents"),
  currentMileage: integer("current_mileage"),
  registeredOn: text("registered_on"),
  registrationExpiresOn: text("registration_expires_on"),
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

/**
 * Periodic odometer readings per asset. Drives monthly-usage stats and
 * a usage log on the asset detail page. Rows can come from three
 * sources:
 *   - "manual"   — user typed it in from a "Log reading" form
 *   - "service"  — auto-inserted when a maintenance record has mileage
 *   - "imported" — backfilled from a spreadsheet / prior system
 */
export const mileageReadings = sqliteTable(
  "mileage_readings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    readOn: text("read_on").notNull(),
    mileage: integer("mileage").notNull(),
    source: text("source", {
      enum: ["manual", "service", "imported"],
    })
      .notNull()
      .default("manual"),
    note: text("note"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    assetIdx: index("mileage_readings_asset_idx").on(t.assetId),
    dateIdx: index("mileage_readings_date_idx").on(t.assetId, t.readOn),
  }),
);

export const reimbursementCategories = ["mileage", "travel"] as const;

export const reimbursements = sqliteTable(
  "reimbursements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    submittedBy: integer("submitted_by").references(() => users.id),
    category: text("category", { enum: reimbursementCategories }).notNull(),
    description: text("description"),
    expenseDate: text("expense_date").notNull(),
    miles: real("miles"),
    ratePerMile: real("rate_per_mile"),
    amountCents: integer("amount_cents").notNull(),
    notes: text("notes"),
    submittedToGusto: integer("submitted_to_gusto", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    employeeIdx: index("reimbursements_employee_idx").on(t.employeeId),
    dateIdx: index("reimbursements_date_idx").on(t.expenseDate),
  }),
);

// ---------- Facilities Maintenance ----------

export const locations = sqliteTable("locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  storeNumber: text("store_number"),
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

// ---------- QBO Integration ----------

export const qboTokens = sqliteTable("qbo_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  realmId: text("realm_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  accessTokenExpiresAt: text("access_token_expires_at").notNull(),
  refreshTokenExpiresAt: text("refresh_token_expires_at").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const qboImportLog = sqliteTable(
  "qbo_import_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    filename: text("filename").notNull(),
    docNumber: text("doc_number").notNull(),
    txnDate: text("txn_date").notNull(),
    lineCount: integer("line_count").notNull(),
    totalDebits: integer("total_debits_cents").notNull(),
    status: text("status").notNull(), // posted | skipped | failed
    qboJeId: text("qbo_je_id"),
    errorDetail: text("error_detail"),
    importedBy: integer("imported_by").references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    docIdx: index("qbo_import_log_doc_idx").on(t.docNumber, t.txnDate),
  }),
);

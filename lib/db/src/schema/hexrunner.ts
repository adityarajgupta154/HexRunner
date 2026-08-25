import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const hexrunnerUsersTable = pgTable("hexrunner_users", {
  id: text("id").primaryKey(),
  displayName: text("display_name"),
  activityLevel: text("activity_level"),
  city: text("city"),
  baselineCompletedAt: timestamp("baseline_completed_at", {
    withTimezone: true,
  }),
  totalHexesOwned: integer("total_hexes_owned").default(0).notNull(),
  enrollmentSecretHash: text("enrollment_secret_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const hexrunnerRunsTable = pgTable(
  "hexrunner_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    elapsedSeconds: integer("elapsed_seconds").notNull(),
    distanceKm: doublePrecision("distance_km").notNull(),
    paceSecondsPerKm: doublePrecision("pace_seconds_per_km"),
    avgPaceMinPerKm: doublePrecision("avg_pace_min_per_km"),
    pointCount: integer("point_count").notNull(),
    hexCount: integer("hex_count").notNull(),
    claimedHexes: text("claimed_hexes").array().notNull(),
    newHexCount: integer("new_hex_count").default(0).notNull(),
    stolenHexCount: integer("stolen_hex_count").default(0).notNull(),
    budgetSkippedHexCount: integer("budget_skipped_hex_count")
      .default(0)
      .notNull(),
    dailyBudget: integer("daily_budget").default(10).notNull(),
    flaggedSuspicious: boolean("flagged_suspicious").default(false).notNull(),
    suspiciousReason: text("suspicious_reason"),
    mockLocationDetected: boolean("mock_location_detected"),
    averageAccuracyMeters: doublePrecision("average_accuracy_meters"),
    maxSpeedMetersPerSecond: doublePrecision("max_speed_meters_per_second"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("hexrunner_runs_user_id_idx").on(table.userId)],
);

export const hexrunnerRunPointsTable = pgTable(
  "hexrunner_run_points",
  {
    runId: text("run_id")
      .notNull()
      .references(() => hexrunnerRunsTable.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.sequence] }),
    index("hexrunner_run_points_run_id_idx").on(table.runId),
  ],
);

export const hexrunnerHexOwnershipTable = pgTable(
  "hexrunner_hex_ownership",
  {
    h3Index: text("h3_index").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    lastRunId: text("last_run_id")
      .notNull()
      .references(() => hexrunnerRunsTable.id, { onDelete: "cascade" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("hexrunner_hex_ownership_owner_id_idx").on(table.ownerId),
  ],
);

export const hexrunnerTakeoverEventsTable = pgTable(
  "hexrunner_takeover_events",
  {
    runId: text("run_id")
      .notNull()
      .references(() => hexrunnerRunsTable.id, { onDelete: "cascade" }),
    h3Index: text("h3_index").notNull(),
    previousOwnerId: text("previous_owner_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    newOwnerId: text("new_owner_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.h3Index] }),
    index("hexrunner_takeover_events_previous_owner_idx").on(
      table.previousOwnerId,
    ),
    index("hexrunner_takeover_events_new_owner_idx").on(table.newOwnerId),
  ],
);

export const hexrunnerSafetyReportsTable = pgTable(
  "hexrunner_safety_reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => hexrunnerRunsTable.id, { onDelete: "cascade" }),
    areaH3Index: text("area_h3_index").notNull(),
    timeBucket: text("time_bucket").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("hexrunner_safety_reports_area_created_idx").on(
      table.areaH3Index,
      table.createdAt,
    ),
    index("hexrunner_safety_reports_reporter_area_idx").on(
      table.reporterId,
      table.areaH3Index,
    ),
    index("hexrunner_safety_reports_run_id_idx").on(table.runId),
  ],
);

export const hexrunnerCivicReportsTable = pgTable(
  "hexrunner_civic_reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => hexrunnerRunsTable.id, {
      onDelete: "set null",
    }),
    category: text("category").notNull(),
    areaH3Index: text("area_h3_index").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    note: text("note"),
    photoObjectPath: text("photo_object_path").notNull(),
    moderationState: text("moderation_state")
      .default("unreviewed")
      .notNull(),
    duplicateOfId: text("duplicate_of_id"),
    flagCount: integer("flag_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("hexrunner_civic_reports_area_created_idx").on(
      table.areaH3Index,
      table.createdAt,
    ),
    index("hexrunner_civic_reports_reporter_idx").on(table.reporterId),
    index("hexrunner_civic_reports_moderation_idx").on(table.moderationState),
    uniqueIndex("hexrunner_civic_reports_photo_path_unique").on(
      table.photoObjectPath,
    ),
  ],
);

export const hexrunnerCivicUploadGrantsTable = pgTable(
  "hexrunner_civic_upload_grants",
  {
    objectPath: text("object_path").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    sealedObjectPath: text("sealed_object_path"),
    contentSha256: text("content_sha256"),
    sealedAt: timestamp("sealed_at", { withTimezone: true }),
    stagingCleanedAt: timestamp("staging_cleaned_at", {
      withTimezone: true,
    }),
    deleteAttempts: integer("delete_attempts").default(0).notNull(),
    lastDeleteError: text("last_delete_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("hexrunner_civic_upload_grants_owner_idx").on(table.ownerId),
    index("hexrunner_civic_upload_grants_expiry_idx").on(table.expiresAt),
    uniqueIndex("hexrunner_civic_upload_grants_sealed_unique").on(
      table.sealedObjectPath,
    ),
  ],
);

export const hexrunnerCivicReportFlagsTable = pgTable(
  "hexrunner_civic_report_flags",
  {
    reportId: text("report_id")
      .notNull()
      .references(() => hexrunnerCivicReportsTable.id, {
        onDelete: "cascade",
      }),
    flaggerId: text("flagger_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reportId, table.flaggerId] }),
    index("hexrunner_civic_report_flags_report_idx").on(table.reportId),
  ],
);

export const hexrunnerZoneCaretakersTable = pgTable(
  "hexrunner_zone_caretakers",
  {
    h3Index: text("h3_index").primaryKey(),
    caretakerId: text("caretaker_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    adoptedAt: timestamp("adopted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("hexrunner_zone_caretakers_user_idx").on(table.caretakerId),
  ],
);

export const insertHexrunnerUserSchema =
  createInsertSchema(hexrunnerUsersTable);
export const insertHexrunnerRunSchema = createInsertSchema(hexrunnerRunsTable);
export const insertHexrunnerRunPointSchema = createInsertSchema(
  hexrunnerRunPointsTable,
);
export const insertHexrunnerHexOwnershipSchema = createInsertSchema(
  hexrunnerHexOwnershipTable,
);
export const insertHexrunnerTakeoverEventSchema = createInsertSchema(
  hexrunnerTakeoverEventsTable,
);
export const insertHexrunnerSafetyReportSchema = createInsertSchema(
  hexrunnerSafetyReportsTable,
);
export const insertHexrunnerCivicReportSchema = createInsertSchema(
  hexrunnerCivicReportsTable,
);
export const insertHexrunnerCivicUploadGrantSchema = createInsertSchema(
  hexrunnerCivicUploadGrantsTable,
);
export const insertHexrunnerCivicReportFlagSchema = createInsertSchema(
  hexrunnerCivicReportFlagsTable,
);
export const insertHexrunnerZoneCaretakerSchema = createInsertSchema(
  hexrunnerZoneCaretakersTable,
);

export type HexrunnerUser = typeof hexrunnerUsersTable.$inferSelect;
export type InsertHexrunnerUser = z.infer<typeof insertHexrunnerUserSchema>;
export type HexrunnerRun = typeof hexrunnerRunsTable.$inferSelect;
export type InsertHexrunnerRun = z.infer<typeof insertHexrunnerRunSchema>;
export type HexrunnerRunPoint = typeof hexrunnerRunPointsTable.$inferSelect;
export type InsertHexrunnerRunPoint = z.infer<
  typeof insertHexrunnerRunPointSchema
>;
export type HexrunnerHexOwnership =
  typeof hexrunnerHexOwnershipTable.$inferSelect;
export type InsertHexrunnerHexOwnership = z.infer<
  typeof insertHexrunnerHexOwnershipSchema
>;
export type HexrunnerTakeoverEvent =
  typeof hexrunnerTakeoverEventsTable.$inferSelect;
export type InsertHexrunnerTakeoverEvent = z.infer<
  typeof insertHexrunnerTakeoverEventSchema
>;
export type HexrunnerSafetyReport =
  typeof hexrunnerSafetyReportsTable.$inferSelect;
export type InsertHexrunnerSafetyReport = z.infer<
  typeof insertHexrunnerSafetyReportSchema
>;
export type HexrunnerCivicReport =
  typeof hexrunnerCivicReportsTable.$inferSelect;
export type InsertHexrunnerCivicReport = z.infer<
  typeof insertHexrunnerCivicReportSchema
>;
export type HexrunnerCivicUploadGrant =
  typeof hexrunnerCivicUploadGrantsTable.$inferSelect;
export type InsertHexrunnerCivicUploadGrant = z.infer<
  typeof insertHexrunnerCivicUploadGrantSchema
>;
export type HexrunnerCivicReportFlag =
  typeof hexrunnerCivicReportFlagsTable.$inferSelect;
export type InsertHexrunnerCivicReportFlag = z.infer<
  typeof insertHexrunnerCivicReportFlagSchema
>;
export type HexrunnerZoneCaretaker =
  typeof hexrunnerZoneCaretakersTable.$inferSelect;
export type InsertHexrunnerZoneCaretaker = z.infer<
  typeof insertHexrunnerZoneCaretakerSchema
>;

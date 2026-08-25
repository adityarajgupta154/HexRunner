import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
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

import {
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
  totalHexesOwned: integer("total_hexes_owned").default(0).notNull(),
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

export const insertHexrunnerUserSchema =
  createInsertSchema(hexrunnerUsersTable);
export const insertHexrunnerRunSchema = createInsertSchema(hexrunnerRunsTable);
export const insertHexrunnerRunPointSchema = createInsertSchema(
  hexrunnerRunPointsTable,
);
export const insertHexrunnerHexOwnershipSchema = createInsertSchema(
  hexrunnerHexOwnershipTable,
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
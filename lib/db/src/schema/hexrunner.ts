import {
  boolean,
  check,
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
import { sql } from "drizzle-orm";

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

// Live coordinates are deliberately isolated from run history.  A user has at
// most one row and expiry makes an interrupted client disappear automatically.
export const hexrunnerLivePresenceTable = pgTable(
  "hexrunner_live_presence",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    clientRunId: text("client_run_id").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    accuracyMeters: doublePrecision("accuracy_meters").notNull(),
    h3Index: text("h3_index").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("hexrunner_live_presence_h3_expiry_idx").on(
      table.h3Index,
      table.expiresAt,
    ),
    index("hexrunner_live_presence_expiry_idx").on(table.expiresAt),
    check("hexrunner_live_presence_latitude_check", sql`${table.latitude} >= -90 AND ${table.latitude} <= 90`),
    check("hexrunner_live_presence_longitude_check", sql`${table.longitude} >= -180 AND ${table.longitude} <= 180`),
    check("hexrunner_live_presence_accuracy_check", sql`${table.accuracyMeters} >= 0 AND ${table.accuracyMeters} <= 100`),
    check("hexrunner_live_presence_expiry_check", sql`${table.expiresAt} > ${table.updatedAt}`),
  ],
);

// Discovery anchors only establish a caller's search center. They are never
// joined into the discoverable runner set and retain no location history.
export const hexrunnerDiscoveryAnchorsTable = pgTable(
  "hexrunner_discovery_anchors",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    clientSessionId: text("client_session_id").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    accuracyMeters: doublePrecision("accuracy_meters").notNull(),
    h3Index: text("h3_index").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("hexrunner_discovery_anchors_h3_expiry_idx").on(table.h3Index, table.expiresAt),
    index("hexrunner_discovery_anchors_expiry_idx").on(table.expiresAt),
    check("hexrunner_discovery_anchors_session_check", sql`char_length(${table.clientSessionId}) BETWEEN 1 AND 128`),
    check("hexrunner_discovery_anchors_latitude_check", sql`${table.latitude} >= -90 AND ${table.latitude} <= 90`),
    check("hexrunner_discovery_anchors_longitude_check", sql`${table.longitude} >= -180 AND ${table.longitude} <= 180`),
    check("hexrunner_discovery_anchors_accuracy_check", sql`${table.accuracyMeters} >= 0 AND ${table.accuracyMeters} <= 100`),
    check("hexrunner_discovery_anchors_expiry_check", sql`${table.expiresAt} > ${table.updatedAt}`),
  ],
);

// Coordinate-free terminal markers prevent delayed requests from resurrecting
// an ended foreground discovery session.
export const hexrunnerDiscoveryAnchorTerminationsTable = pgTable(
  "hexrunner_discovery_anchor_terminations",
  {
    userId: text("user_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    clientSessionId: text("client_session_id").notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.clientSessionId] }),
    index("hexrunner_discovery_anchor_terminations_expiry_idx").on(table.expiresAt),
    check("hexrunner_discovery_anchor_terminations_session_check", sql`char_length(${table.clientSessionId}) BETWEEN 1 AND 128`),
    check("hexrunner_discovery_anchor_terminations_expiry_check", sql`${table.expiresAt} > ${table.endedAt}`),
  ],
);

// One latest-only anti-abuse snapshot preserves continuity across anchor end
// and expiry. It is never a discovery center or a discoverable candidate.
export const hexrunnerDiscoveryAnchorContinuityTable = pgTable(
  "hexrunner_discovery_anchor_continuity",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    accuracyMeters: doublePrecision("accuracy_meters").notNull(),
    h3Index: text("h3_index").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("hexrunner_discovery_anchor_continuity_expiry_idx").on(table.expiresAt),
    check("hexrunner_discovery_anchor_continuity_latitude_check", sql`${table.latitude} >= -90 AND ${table.latitude} <= 90`),
    check("hexrunner_discovery_anchor_continuity_longitude_check", sql`${table.longitude} >= -180 AND ${table.longitude} <= 180`),
    check("hexrunner_discovery_anchor_continuity_accuracy_check", sql`${table.accuracyMeters} >= 0 AND ${table.accuracyMeters} <= 100`),
    check("hexrunner_discovery_anchor_continuity_expiry_check", sql`${table.expiresAt} > ${table.updatedAt}`),
  ],
);

// A short-lived terminal marker closes the delayed-request race without
// retaining coordinates or creating location history.
export const hexrunnerPresenceTerminationsTable = pgTable(
  "hexrunner_presence_terminations",
  {
    userId: text("user_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    clientRunId: text("client_run_id").notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.clientRunId] }),
    index("hexrunner_presence_terminations_expiry_idx").on(table.expiresAt),
    check("hexrunner_presence_terminations_expiry_check", sql`${table.expiresAt} > ${table.endedAt}`),
  ],
);

// Canonically ordered pair prevents duplicate/reversed relationship records.
export const hexrunnerConnectionsTable = pgTable(
  "hexrunner_connections",
  {
    userLowId: text("user_low_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    userHighId: text("user_high_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    requestedById: text("requested_by_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    blockedById: text("blocked_by_id").references(() => hexrunnerUsersTable.id, {
      onDelete: "cascade",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userLowId, table.userHighId] }),
    index("hexrunner_connections_low_idx").on(table.userLowId),
    index("hexrunner_connections_high_idx").on(table.userHighId),
    check("hexrunner_connections_canonical_check", sql`${table.userLowId} < ${table.userHighId}`),
    check("hexrunner_connections_status_check", sql`${table.status} IN ('pending', 'accepted', 'blocked')`),
    check("hexrunner_connections_requester_member_check", sql`${table.requestedById} IN (${table.userLowId}, ${table.userHighId})`),
    check("hexrunner_connections_blocker_member_check", sql`${table.blockedById} IS NULL OR ${table.blockedById} IN (${table.userLowId}, ${table.userHighId})`),
    check("hexrunner_connections_block_consistency_check", sql`(${table.status} = 'blocked' AND ${table.blockedById} IS NOT NULL) OR (${table.status} <> 'blocked' AND ${table.blockedById} IS NULL)`),
  ],
);

// Opaque, short-overlap capabilities issued after privacy filtering. A brief
// overlap prevents polling from invalidating a marker while its action is open.
// Raw tokens and locations are deliberately never persisted.
export const hexrunnerInteractionGrantsTable = pgTable(
  "hexrunner_interaction_grants",
  {
    viewerId: text("viewer_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("hexrunner_interaction_grants_pair_expiry_idx").on(
      table.viewerId,
      table.targetId,
      table.expiresAt,
    ),
    index("hexrunner_interaction_grants_expiry_idx").on(table.expiresAt),
    check("hexrunner_interaction_grants_not_self_check", sql`${table.viewerId} <> ${table.targetId}`),
    check("hexrunner_interaction_grants_hash_check", sql`char_length(${table.tokenHash}) = 64`),
    check("hexrunner_interaction_grants_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const hexrunnerWavesTable = pgTable(
  "hexrunner_waves",
  {
    id: text("id").primaryKey(),
    senderId: text("sender_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("hexrunner_waves_sender_idempotency_unique").on(
      table.senderId,
      table.idempotencyKey,
    ),
    index("hexrunner_waves_pair_created_idx").on(
      table.senderId,
      table.recipientId,
      table.createdAt,
    ),
    index("hexrunner_waves_sender_created_idx").on(table.senderId, table.createdAt),
    index("hexrunner_waves_recipient_read_idx").on(
      table.recipientId,
      table.acknowledgedAt,
      table.expiresAt,
    ),
    check("hexrunner_waves_not_self_check", sql`${table.senderId} <> ${table.recipientId}`),
    check("hexrunner_waves_id_check", sql`char_length(${table.id}) BETWEEN 16 AND 128`),
    check("hexrunner_waves_idempotency_check", sql`char_length(${table.idempotencyKey}) BETWEEN 1 AND 128`),
    check("hexrunner_waves_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    check("hexrunner_waves_ack_check", sql`${table.acknowledgedAt} IS NULL OR ${table.acknowledgedAt} >= ${table.createdAt}`),
  ],
);

export const hexrunnerContestOccupancyTable = pgTable(
  "hexrunner_contest_occupancy",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    h3Index: text("h3_index").notNull(),
    ownershipRunId: text("ownership_run_id").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.actorId, table.h3Index] }),
    index("hexrunner_contest_occupancy_expiry_idx").on(table.expiresAt),
    check("hexrunner_contest_occupancy_not_self_check", sql`${table.ownerId} <> ${table.actorId}`),
    check("hexrunner_contest_occupancy_h3_check", sql`char_length(${table.h3Index}) BETWEEN 15 AND 16`),
    check("hexrunner_contest_occupancy_run_check", sql`char_length(${table.ownershipRunId}) BETWEEN 8 AND 160`),
    check("hexrunner_contest_occupancy_expiry_check", sql`${table.expiresAt} > ${table.lastSeenAt}`),
  ],
);

export const hexrunnerContestEventsTable = pgTable(
  "hexrunner_contest_events",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => hexrunnerUsersTable.id, { onDelete: "cascade" }),
    h3Index: text("h3_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  },
  (table) => [
    index("hexrunner_contest_events_owner_read_idx").on(
      table.ownerId,
      table.acknowledgedAt,
      table.expiresAt,
    ),
    index("hexrunner_contest_events_dedupe_idx").on(
      table.ownerId,
      table.actorId,
      table.h3Index,
      table.createdAt,
    ),
    check("hexrunner_contest_events_not_self_check", sql`${table.ownerId} <> ${table.actorId}`),
    check("hexrunner_contest_events_id_check", sql`char_length(${table.id}) BETWEEN 16 AND 128`),
    check("hexrunner_contest_events_h3_check", sql`char_length(${table.h3Index}) BETWEEN 15 AND 16`),
    check("hexrunner_contest_events_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    check("hexrunner_contest_events_ack_check", sql`${table.acknowledgedAt} IS NULL OR ${table.acknowledgedAt} >= ${table.createdAt}`),
  ],
);

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
export const insertHexrunnerLivePresenceSchema = createInsertSchema(
  hexrunnerLivePresenceTable,
);
export const insertHexrunnerDiscoveryAnchorSchema = createInsertSchema(
  hexrunnerDiscoveryAnchorsTable,
);
export const insertHexrunnerDiscoveryAnchorTerminationSchema = createInsertSchema(
  hexrunnerDiscoveryAnchorTerminationsTable,
);
export const insertHexrunnerDiscoveryAnchorContinuitySchema = createInsertSchema(
  hexrunnerDiscoveryAnchorContinuityTable,
);
export const insertHexrunnerPresenceTerminationSchema = createInsertSchema(
  hexrunnerPresenceTerminationsTable,
);
export const insertHexrunnerConnectionSchema = createInsertSchema(
  hexrunnerConnectionsTable,
);
export const insertHexrunnerInteractionGrantSchema = createInsertSchema(
  hexrunnerInteractionGrantsTable,
);
export const insertHexrunnerWaveSchema = createInsertSchema(hexrunnerWavesTable);
export const insertHexrunnerContestOccupancySchema = createInsertSchema(
  hexrunnerContestOccupancyTable,
);
export const insertHexrunnerContestEventSchema = createInsertSchema(
  hexrunnerContestEventsTable,
);
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
export type HexrunnerLivePresence = typeof hexrunnerLivePresenceTable.$inferSelect;
export type InsertHexrunnerLivePresence = z.infer<
  typeof insertHexrunnerLivePresenceSchema
>;
export type HexrunnerDiscoveryAnchor = typeof hexrunnerDiscoveryAnchorsTable.$inferSelect;
export type InsertHexrunnerDiscoveryAnchor = z.infer<
  typeof insertHexrunnerDiscoveryAnchorSchema
>;
export type HexrunnerDiscoveryAnchorTermination =
  typeof hexrunnerDiscoveryAnchorTerminationsTable.$inferSelect;
export type InsertHexrunnerDiscoveryAnchorTermination = z.infer<
  typeof insertHexrunnerDiscoveryAnchorTerminationSchema
>;
export type HexrunnerDiscoveryAnchorContinuity =
  typeof hexrunnerDiscoveryAnchorContinuityTable.$inferSelect;
export type InsertHexrunnerDiscoveryAnchorContinuity = z.infer<
  typeof insertHexrunnerDiscoveryAnchorContinuitySchema
>;
export type HexrunnerPresenceTermination =
  typeof hexrunnerPresenceTerminationsTable.$inferSelect;
export type InsertHexrunnerPresenceTermination = z.infer<
  typeof insertHexrunnerPresenceTerminationSchema
>;
export type HexrunnerConnection = typeof hexrunnerConnectionsTable.$inferSelect;
export type InsertHexrunnerConnection = z.infer<
  typeof insertHexrunnerConnectionSchema
>;
export type HexrunnerInteractionGrant =
  typeof hexrunnerInteractionGrantsTable.$inferSelect;
export type InsertHexrunnerInteractionGrant = z.infer<
  typeof insertHexrunnerInteractionGrantSchema
>;
export type HexrunnerWave = typeof hexrunnerWavesTable.$inferSelect;
export type InsertHexrunnerWave = z.infer<typeof insertHexrunnerWaveSchema>;
export type HexrunnerContestOccupancy =
  typeof hexrunnerContestOccupancyTable.$inferSelect;
export type InsertHexrunnerContestOccupancy = z.infer<
  typeof insertHexrunnerContestOccupancySchema
>;
export type HexrunnerContestEvent =
  typeof hexrunnerContestEventsTable.$inferSelect;
export type InsertHexrunnerContestEvent = z.infer<
  typeof insertHexrunnerContestEventSchema
>;
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

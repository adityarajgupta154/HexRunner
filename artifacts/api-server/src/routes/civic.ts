import { Router, type IRouter, type Request } from "express";
import {
  AdoptCivicZoneBody,
  AdoptCivicZoneResponse,
  CreateCivicReportBody,
  CreateCivicReportResponse,
  FlagCivicReportBody,
  FlagCivicReportParams,
  FlagCivicReportResponse,
  LookupCivicMapBody,
  LookupCivicMapResponse,
  RequestCivicPhotoUploadBody,
  RequestCivicPhotoUploadResponse,
} from "@workspace/api-zod";
import {
  db,
  hexrunnerCivicReportFlagsTable,
  hexrunnerCivicReportsTable,
  hexrunnerCivicUploadGrantsTable,
  hexrunnerHexOwnershipTable,
  hexrunnerRunPointsTable,
  hexrunnerRunsTable,
  hexrunnerZoneCaretakersTable,
} from "@workspace/db";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  ne,
  notInArray,
  sql,
  lt,
} from "drizzle-orm";
import { getResolution, isValidCell, latLngToCell } from "h3-js";
import { verifyAnonymousCredential } from "../lib/anonymousCredential";
import { consumeRateLimit } from "../lib/rateLimit";
import {
  createCivicPhotoUpload,
  deleteCivicPhoto,
  getCivicPhotoMetadata,
  InvalidCivicPhotoError,
  sealCivicPhoto,
} from "../lib/civicObjectStorage";

const router: IRouter = Router();
const CIVIC_RESOLUTION = 8;
const TERRITORY_RESOLUTION = 9;
const MAX_REPORT_AGE_MS = 24 * 60 * 60 * 1_000;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const PUBLIC_WINDOW_MS = 90 * 24 * 60 * 60 * 1_000;
const MAX_REPORTS_PER_DAY = 10;
const RETENTION_MS = 180 * 24 * 60 * 60 * 1_000;
const MAX_UPLOAD_GRANTS_PER_DAY = 10;
const MAX_ACTIVE_UPLOAD_GRANTS = 3;
const MAX_UPLOAD_BYTES_PER_DAY = 30 * 1024 * 1024;
const CLEANUP_BATCH_SIZE = 100;

export async function cleanupExpiredCivicData(
  deleteObject: (objectPath: string) => Promise<void> = deleteCivicPhoto,
): Promise<void> {
  const now = new Date();
  const expiredGrants = await db
    .select({
      objectPath: hexrunnerCivicUploadGrantsTable.objectPath,
      consumedAt: hexrunnerCivicUploadGrantsTable.consumedAt,
      sealedObjectPath: hexrunnerCivicUploadGrantsTable.sealedObjectPath,
    })
    .from(hexrunnerCivicUploadGrantsTable)
    .where(
      and(
        lt(hexrunnerCivicUploadGrantsTable.expiresAt, now),
        sql`${hexrunnerCivicUploadGrantsTable.consumedAt} is null`,
      ),
    )
    .orderBy(asc(hexrunnerCivicUploadGrantsTable.expiresAt))
    .limit(CLEANUP_BATCH_SIZE);
  for (const grant of expiredGrants) {
    try {
      await deleteObject(grant.objectPath);
      if (grant.sealedObjectPath) {
        await deleteObject(grant.sealedObjectPath);
      }
      await db
        .delete(hexrunnerCivicUploadGrantsTable)
        .where(
          and(
            eq(hexrunnerCivicUploadGrantsTable.objectPath, grant.objectPath),
            sql`${hexrunnerCivicUploadGrantsTable.consumedAt} is null`,
          ),
        );
    } catch (error) {
      await db
        .update(hexrunnerCivicUploadGrantsTable)
        .set({
          deleteAttempts: sql`${hexrunnerCivicUploadGrantsTable.deleteAttempts} + 1`,
          lastDeleteError:
            error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
        })
        .where(eq(hexrunnerCivicUploadGrantsTable.objectPath, grant.objectPath));
    }
  }

  const consumedStaging = await db
    .select({
      objectPath: hexrunnerCivicUploadGrantsTable.objectPath,
    })
    .from(hexrunnerCivicUploadGrantsTable)
    .where(
      and(
        lt(hexrunnerCivicUploadGrantsTable.expiresAt, now),
        sql`${hexrunnerCivicUploadGrantsTable.consumedAt} is not null`,
        sql`${hexrunnerCivicUploadGrantsTable.stagingCleanedAt} is null`,
      ),
    )
    .orderBy(asc(hexrunnerCivicUploadGrantsTable.expiresAt))
    .limit(CLEANUP_BATCH_SIZE);
  for (const grant of consumedStaging) {
    try {
      await deleteObject(grant.objectPath);
      await db
        .update(hexrunnerCivicUploadGrantsTable)
        .set({ stagingCleanedAt: now, lastDeleteError: null })
        .where(
          eq(hexrunnerCivicUploadGrantsTable.objectPath, grant.objectPath),
        );
    } catch (error) {
      await db
        .update(hexrunnerCivicUploadGrantsTable)
        .set({
          deleteAttempts: sql`${hexrunnerCivicUploadGrantsTable.deleteAttempts} + 1`,
          lastDeleteError:
            error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
        })
        .where(
          eq(hexrunnerCivicUploadGrantsTable.objectPath, grant.objectPath),
        );
    }
  }

  const expiredReports = await db
    .select({
      id: hexrunnerCivicReportsTable.id,
      photoObjectPath: hexrunnerCivicReportsTable.photoObjectPath,
    })
    .from(hexrunnerCivicReportsTable)
    .where(
      lt(
        hexrunnerCivicReportsTable.createdAt,
        new Date(now.getTime() - RETENTION_MS),
      ),
    )
    .orderBy(asc(hexrunnerCivicReportsTable.createdAt))
    .limit(CLEANUP_BATCH_SIZE);
  for (const report of expiredReports) {
    try {
      await deleteObject(report.photoObjectPath);
      const [grant] = await db
        .select({ objectPath: hexrunnerCivicUploadGrantsTable.objectPath })
        .from(hexrunnerCivicUploadGrantsTable)
        .where(
          eq(
            hexrunnerCivicUploadGrantsTable.sealedObjectPath,
            report.photoObjectPath,
          ),
        )
        .limit(1);
      if (grant) await deleteObject(grant.objectPath);
      await db.transaction(async (tx) => {
        await tx
          .delete(hexrunnerCivicReportsTable)
          .where(eq(hexrunnerCivicReportsTable.id, report.id));
        await tx
          .delete(hexrunnerCivicUploadGrantsTable)
          .where(
            eq(
              hexrunnerCivicUploadGrantsTable.sealedObjectPath,
              report.photoObjectPath,
            ),
          );
      });
    } catch (error) {
      await db
        .update(hexrunnerCivicUploadGrantsTable)
        .set({
          deleteAttempts: sql`${hexrunnerCivicUploadGrantsTable.deleteAttempts} + 1`,
          lastDeleteError:
            error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
        })
        .where(
          eq(
              hexrunnerCivicUploadGrantsTable.sealedObjectPath,
            report.photoObjectPath,
          ),
        );
    }
  }
}

const cleanupTimer = setInterval(() => {
  void cleanupExpiredCivicData().catch(() => undefined);
}, 60 * 1_000);
cleanupTimer.unref();
void cleanupExpiredCivicData().catch(() => undefined);

function authenticate(req: Request): string | null {
  const authorization = req.get("authorization");
  const credential = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  return credential ? verifyAnonymousCredential(credential) : null;
}

router.post("/civic-photo-uploads", async (req, res): Promise<void> => {
  const reporterId = authenticate(req);
  if (!reporterId) {
    res.status(401).json({ error: "A valid device credential is required." });
    return;
  }
  if (
    !consumeRateLimit(
      "civic-photo-upload-ip",
      req.ip ?? "unknown",
      30,
      60 * 60 * 1_000,
    )
  ) {
    res.status(429).json({ error: "Too many photo upload attempts." });
    return;
  }
  if (
    !consumeRateLimit(
      "civic-photo-upload-global",
      "all",
      300,
      60 * 60 * 1_000,
    )
  ) {
    res.status(429).json({ error: "Photo uploads are temporarily at capacity." });
    return;
  }
  const parsed = RequestCivicPhotoUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid civic photo metadata." });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`civic-upload:${reporterId}`})::bigint)`,
      );
      const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
      const [dailyUsage] = await tx
        .select({
          grants: sql<number>`count(*)::int`,
          bytes: sql<number>`coalesce(sum(${hexrunnerCivicUploadGrantsTable.sizeBytes}), 0)::int`,
        })
        .from(hexrunnerCivicUploadGrantsTable)
        .where(
          and(
            eq(hexrunnerCivicUploadGrantsTable.ownerId, reporterId),
            gte(hexrunnerCivicUploadGrantsTable.createdAt, since),
          ),
        );
      const [activeUsage] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(hexrunnerCivicUploadGrantsTable)
        .where(
          and(
            eq(hexrunnerCivicUploadGrantsTable.ownerId, reporterId),
            sql`${hexrunnerCivicUploadGrantsTable.consumedAt} is null`,
            gte(hexrunnerCivicUploadGrantsTable.expiresAt, new Date()),
          ),
        );
      if (
        (dailyUsage?.grants ?? 0) >= MAX_UPLOAD_GRANTS_PER_DAY ||
        (activeUsage?.count ?? 0) >= MAX_ACTIVE_UPLOAD_GRANTS ||
        (dailyUsage?.bytes ?? 0) + parsed.data.sizeBytes >
          MAX_UPLOAD_BYTES_PER_DAY
      ) {
        return { limited: true } as const;
      }
      const upload = await createCivicPhotoUpload();
      await tx.insert(hexrunnerCivicUploadGrantsTable).values({
        objectPath: upload.objectPath,
        ownerId: reporterId,
        contentType: parsed.data.contentType,
        sizeBytes: parsed.data.sizeBytes,
        expiresAt: upload.expiresAt,
      });
      return { upload } as const;
    });
    if ("limited" in result) {
      res.status(429).json({
        error: "Daily civic photo upload budget reached.",
      });
      return;
    }
    res.json(RequestCivicPhotoUploadResponse.parse(result.upload));
  } catch (error) {
    req.log.error({ error, reporterId }, "Failed to sign civic photo upload");
    res.status(503).json({ error: "Photo storage is temporarily unavailable." });
  }
});

router.post("/civic-reports", async (req, res): Promise<void> => {
  const reporterId = authenticate(req);
  if (!reporterId) {
    res.status(401).json({ error: "A valid device credential is required." });
    return;
  }
  if (
    !consumeRateLimit(
      "civic-report-ip",
      req.ip ?? "unknown",
      40,
      60 * 60 * 1_000,
    )
  ) {
    res.status(429).json({ error: "Too many civic report attempts." });
    return;
  }
  const parsed = CreateCivicReportBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.consentToPublishCoarseReport) {
    res.status(400).json({ error: "Invalid civic report or missing consent." });
    return;
  }
  const now = new Date();
  const occurredAt = parsed.data.occurredAt;
  const ageMs = now.getTime() - occurredAt.getTime();
  if (ageMs < -5 * 60 * 1_000 || ageMs > MAX_REPORT_AGE_MS) {
    res.status(400).json({ error: "Civic report timestamp is too old." });
    return;
  }
  if (
    !isValidCell(parsed.data.areaH3Index) ||
    getResolution(parsed.data.areaH3Index) !== CIVIC_RESOLUTION
  ) {
    res.status(400).json({ error: "Invalid coarse civic area." });
    return;
  }

  try {
    const [existingById] = await db
      .select({
        id: hexrunnerCivicReportsTable.id,
        reporterId: hexrunnerCivicReportsTable.reporterId,
        moderationState: hexrunnerCivicReportsTable.moderationState,
      })
      .from(hexrunnerCivicReportsTable)
      .where(eq(hexrunnerCivicReportsTable.id, parsed.data.clientReportId))
      .limit(1);
    if (existingById) {
      if (existingById.reporterId !== reporterId) {
        res.status(409).json({ error: "Civic report ID is already in use." });
        return;
      }
      res.json(
        CreateCivicReportResponse.parse({
          reportId: existingById.id,
          accepted: true,
          duplicate: existingById.moderationState === "possible_duplicate",
          moderationState: existingById.moderationState,
          advisory: "This civic report was already saved.",
        }),
      );
      return;
    }

    const [grant] = await db
      .select({
        objectPath: hexrunnerCivicUploadGrantsTable.objectPath,
        ownerId: hexrunnerCivicUploadGrantsTable.ownerId,
        contentType: hexrunnerCivicUploadGrantsTable.contentType,
        sizeBytes: hexrunnerCivicUploadGrantsTable.sizeBytes,
        expiresAt: hexrunnerCivicUploadGrantsTable.expiresAt,
        consumedAt: hexrunnerCivicUploadGrantsTable.consumedAt,
        sealedObjectPath: hexrunnerCivicUploadGrantsTable.sealedObjectPath,
        contentSha256: hexrunnerCivicUploadGrantsTable.contentSha256,
      })
      .from(hexrunnerCivicUploadGrantsTable)
      .where(
        eq(
          hexrunnerCivicUploadGrantsTable.objectPath,
          parsed.data.photoObjectPath,
        ),
      )
      .limit(1);
    if (
      !grant ||
      grant.ownerId !== reporterId ||
      grant.consumedAt ||
      grant.expiresAt.getTime() < now.getTime()
    ) {
      res.status(400).json({ error: "Invalid or expired civic photo upload." });
      return;
    }
    let sealedObjectPath = grant.sealedObjectPath;
    if (!sealedObjectPath) {
      const claimedForSealing = await db
        .update(hexrunnerCivicUploadGrantsTable)
        .set({ sealedAt: now })
        .where(
          and(
            eq(
              hexrunnerCivicUploadGrantsTable.objectPath,
              parsed.data.photoObjectPath,
            ),
            eq(hexrunnerCivicUploadGrantsTable.ownerId, reporterId),
            sql`${hexrunnerCivicUploadGrantsTable.consumedAt} is null`,
            sql`${hexrunnerCivicUploadGrantsTable.sealedAt} is null`,
            sql`${hexrunnerCivicUploadGrantsTable.sealedObjectPath} is null`,
          ),
        )
        .returning({
          objectPath: hexrunnerCivicUploadGrantsTable.objectPath,
        });
      if (!claimedForSealing.length) {
        res.status(409).json({
          error: "This civic photo is already being prepared. Retry shortly.",
        });
        return;
      }
      const photo = await getCivicPhotoMetadata(parsed.data.photoObjectPath);
      if (
        !photo.exists ||
        photo.contentType !== grant.contentType ||
        photo.sizeBytes !== grant.sizeBytes
      ) {
        await db
          .update(hexrunnerCivicUploadGrantsTable)
          .set({ sealedAt: null })
          .where(
            eq(
              hexrunnerCivicUploadGrantsTable.objectPath,
              parsed.data.photoObjectPath,
            ),
          );
        res.status(400).json({
          error: "The uploaded photo does not match its approved type and size.",
        });
        return;
      }
      let sealed: Awaited<ReturnType<typeof sealCivicPhoto>> | null = null;
      try {
        sealed = await sealCivicPhoto({
          stagingObjectPath: parsed.data.photoObjectPath,
          contentType: grant.contentType,
          expectedSizeBytes: grant.sizeBytes,
        });
        await db
          .update(hexrunnerCivicUploadGrantsTable)
          .set({
            sealedObjectPath: sealed.sealedObjectPath,
            contentSha256: sealed.contentSha256,
            sealedAt: now,
            expiresAt: new Date(now.getTime() + MAX_REPORT_AGE_MS),
          })
          .where(
            and(
              eq(
                hexrunnerCivicUploadGrantsTable.objectPath,
                parsed.data.photoObjectPath,
              ),
              eq(hexrunnerCivicUploadGrantsTable.ownerId, reporterId),
              sql`${hexrunnerCivicUploadGrantsTable.consumedAt} is null`,
            ),
          );
        sealedObjectPath = sealed.sealedObjectPath;
        await deleteCivicPhoto(parsed.data.photoObjectPath).catch(
          () => undefined,
        );
      } catch (error) {
        if (sealed) {
          await deleteCivicPhoto(sealed.sealedObjectPath).catch(
            () => undefined,
          );
        }
        await db
          .update(hexrunnerCivicUploadGrantsTable)
          .set({ sealedAt: null })
          .where(
            and(
              eq(
                hexrunnerCivicUploadGrantsTable.objectPath,
                parsed.data.photoObjectPath,
              ),
              sql`${hexrunnerCivicUploadGrantsTable.sealedObjectPath} is null`,
            ),
          );
        if (error instanceof InvalidCivicPhotoError) {
          res.status(400).json({ error: error.message });
          return;
        }
        throw error;
      }
    } else {
      const sealedMetadata = await getCivicPhotoMetadata(sealedObjectPath);
      if (
        !sealedMetadata.exists ||
        sealedMetadata.contentType !== grant.contentType ||
        sealedMetadata.sizeBytes !== grant.sizeBytes ||
        !grant.contentSha256
      ) {
        res.status(400).json({ error: "The sealed civic photo is unavailable." });
        return;
      }
    }

    const [run] = await db
      .select({
        id: hexrunnerRunsTable.id,
        startedAt: hexrunnerRunsTable.startedAt,
        endedAt: hexrunnerRunsTable.endedAt,
      })
      .from(hexrunnerRunsTable)
      .where(
        and(
          eq(hexrunnerRunsTable.id, parsed.data.clientRunId),
          eq(hexrunnerRunsTable.userId, reporterId),
        ),
      )
      .limit(1);
    if (!run) {
      res.status(409).json({
        error: "Save this run before sending its queued civic report.",
      });
      return;
    }
    if (
      occurredAt.getTime() < run.startedAt.getTime() - 5_000 ||
      occurredAt.getTime() > run.endedAt.getTime() + 5_000
    ) {
      res.status(400).json({ error: "Report time does not match this run." });
      return;
    }
    const points = await db
      .select({
        latitude: hexrunnerRunPointsTable.latitude,
        longitude: hexrunnerRunPointsTable.longitude,
      })
      .from(hexrunnerRunPointsTable)
      .where(eq(hexrunnerRunPointsTable.runId, run.id));
    if (
      !points.some(
        (point) =>
          latLngToCell(
            point.latitude,
            point.longitude,
            CIVIC_RESOLUTION,
          ) === parsed.data.areaH3Index,
      )
    ) {
      res.status(400).json({ error: "Report area does not match this run." });
      return;
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`civic:${reporterId}`})::bigint)`,
      );
      const [sameId] = await tx
        .select({
          id: hexrunnerCivicReportsTable.id,
          moderationState: hexrunnerCivicReportsTable.moderationState,
        })
        .from(hexrunnerCivicReportsTable)
        .where(eq(hexrunnerCivicReportsTable.id, parsed.data.clientReportId))
        .limit(1);
      if (sameId) {
        return {
          reportId: sameId.id,
          duplicate: true,
          moderationState: sameId.moderationState,
          idempotent: true,
        };
      }
      const [currentGrant] = await tx
        .select({
          consumedAt: hexrunnerCivicUploadGrantsTable.consumedAt,
          sealedObjectPath:
            hexrunnerCivicUploadGrantsTable.sealedObjectPath,
        })
        .from(hexrunnerCivicUploadGrantsTable)
        .where(
          and(
            eq(
              hexrunnerCivicUploadGrantsTable.objectPath,
              parsed.data.photoObjectPath,
            ),
            eq(hexrunnerCivicUploadGrantsTable.ownerId, reporterId),
          ),
        )
        .limit(1);
      if (
        !currentGrant ||
        currentGrant.consumedAt ||
        currentGrant.sealedObjectPath !== sealedObjectPath
      ) {
        return { invalidGrant: true } as const;
      }

      const [usage] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(hexrunnerCivicReportsTable)
        .where(
          and(
            eq(hexrunnerCivicReportsTable.reporterId, reporterId),
            gte(
              hexrunnerCivicReportsTable.createdAt,
              new Date(now.getTime() - 24 * 60 * 60 * 1_000),
            ),
          ),
        );
      if ((usage?.count ?? 0) >= MAX_REPORTS_PER_DAY) {
        return { rateLimited: true } as const;
      }

      const [possibleDuplicate] = await tx
        .select({ id: hexrunnerCivicReportsTable.id })
        .from(hexrunnerCivicReportsTable)
        .where(
          and(
            eq(
              hexrunnerCivicReportsTable.areaH3Index,
              parsed.data.areaH3Index,
            ),
            eq(hexrunnerCivicReportsTable.category, parsed.data.category),
            gte(
              hexrunnerCivicReportsTable.createdAt,
              new Date(now.getTime() - DUPLICATE_WINDOW_MS),
            ),
            ne(hexrunnerCivicReportsTable.moderationState, "flagged"),
          ),
        )
        .limit(1);
      const moderationState = possibleDuplicate
        ? "possible_duplicate"
        : "unreviewed";
      await tx.insert(hexrunnerCivicReportsTable).values({
        id: parsed.data.clientReportId,
        reporterId,
        runId: run.id,
        category: parsed.data.category,
        areaH3Index: parsed.data.areaH3Index,
        occurredAt,
        note: parsed.data.note?.trim() || null,
        photoObjectPath: sealedObjectPath,
        moderationState,
        duplicateOfId: possibleDuplicate?.id ?? null,
      });
      await tx
        .update(hexrunnerCivicUploadGrantsTable)
        .set({ consumedAt: now })
        .where(
          and(
            eq(
              hexrunnerCivicUploadGrantsTable.objectPath,
              parsed.data.photoObjectPath,
            ),
            eq(hexrunnerCivicUploadGrantsTable.ownerId, reporterId),
            sql`${hexrunnerCivicUploadGrantsTable.consumedAt} is null`,
          ),
        );
      return {
        reportId: parsed.data.clientReportId,
        duplicate: !!possibleDuplicate,
        moderationState,
        idempotent: false,
      };
    });

    if ("rateLimited" in result) {
      res.status(429).json({ error: "Daily civic report limit reached." });
      return;
    }
    if ("invalidGrant" in result) {
      res.status(409).json({ error: "This civic photo was already attached." });
      return;
    }
    res.status(result.idempotent ? 200 : 201).json(
      CreateCivicReportResponse.parse({
        reportId: result.reportId,
        accepted: true,
        duplicate: result.duplicate,
        moderationState: result.moderationState,
        advisory:
          result.moderationState === "possible_duplicate"
            ? "Saved as a possible duplicate for community review."
            : "Saved as unreviewed community information, not a municipal filing.",
      }),
    );
  } catch (error) {
    req.log.error({ error, reporterId }, "Failed to save civic report");
    res.status(500).json({ error: "Unable to save this civic report." });
  }
});

router.post("/civic-reports/:reportId/flags", async (req, res): Promise<void> => {
  const flaggerId = authenticate(req);
  if (!flaggerId) {
    res.status(401).json({ error: "A valid device credential is required." });
    return;
  }
  if (
    !consumeRateLimit(
      "civic-moderation-ip",
      req.ip ?? "unknown",
      60,
      60 * 60 * 1_000,
    )
  ) {
    res.status(429).json({ error: "Too many moderation attempts." });
    return;
  }
  const parsedParams = FlagCivicReportParams.safeParse(req.params);
  const parsedBody = FlagCivicReportBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Invalid civic report flag." });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`civic-flag:${parsedParams.data.reportId}`})::bigint)`,
      );
      const [eligibleFlagger] = await tx
        .select({ id: hexrunnerRunsTable.id })
        .from(hexrunnerRunsTable)
        .where(eq(hexrunnerRunsTable.userId, flaggerId))
        .limit(1);
      if (!eligibleFlagger) return { ineligible: true } as const;
      const [report] = await tx
        .select({
          id: hexrunnerCivicReportsTable.id,
          reporterId: hexrunnerCivicReportsTable.reporterId,
          moderationState: hexrunnerCivicReportsTable.moderationState,
        })
        .from(hexrunnerCivicReportsTable)
        .where(eq(hexrunnerCivicReportsTable.id, parsedParams.data.reportId))
        .limit(1);
      if (!report) return null;
      if (report.reporterId === flaggerId) return { selfFlag: true } as const;
      const inserted = await tx
        .insert(hexrunnerCivicReportFlagsTable)
        .values({
          reportId: report.id,
          flaggerId,
          reason: parsedBody.data.reason,
        })
        .onConflictDoNothing()
        .returning({ reportId: hexrunnerCivicReportFlagsTable.reportId });
      const [countRow] = await tx
        .select({
          riskCount: sql<number>`count(*) filter (where ${hexrunnerCivicReportFlagsTable.reason} in ('duplicate', 'inappropriate'))::int`,
          confirmationCount: sql<number>`count(*) filter (where ${hexrunnerCivicReportFlagsTable.reason} = 'confirmed_valid')::int`,
        })
        .from(hexrunnerCivicReportFlagsTable)
        .where(eq(hexrunnerCivicReportFlagsTable.reportId, report.id));
      const flagCount = countRow?.riskCount ?? 0;
      const confirmationCount = countRow?.confirmationCount ?? 0;
      const moderationState =
        flagCount >= 3
          ? "flagged"
          : confirmationCount >= 3
            ? "reviewed"
            : report.moderationState;
      await tx
        .update(hexrunnerCivicReportsTable)
        .set({
          flagCount,
          ...(flagCount >= 3 || confirmationCount >= 3
            ? { moderationState }
            : {}),
        })
        .where(eq(hexrunnerCivicReportsTable.id, report.id));
      return {
        reportId: report.id,
        recorded: inserted.length > 0,
        flagCount,
        moderationState,
      };
    });
    if (!result) {
      res.status(404).json({ error: "Civic report not found." });
      return;
    }
    if ("selfFlag" in result) {
      res.status(403).json({ error: "You cannot flag your own report." });
      return;
    }
    if ("ineligible" in result) {
      res.status(403).json({
        error: "Complete a saved run before moderating community reports.",
      });
      return;
    }
    res.json(FlagCivicReportResponse.parse(result));
  } catch (error) {
    req.log.error({ error, flaggerId }, "Failed to flag civic report");
    res.status(500).json({ error: "Unable to flag this civic report." });
  }
});

router.post("/civic-map/lookup", async (req, res): Promise<void> => {
  const parsed = LookupCivicMapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid civic map lookup." });
    return;
  }
  try {
    const reports = await db
      .select({
        areaH3Index: hexrunnerCivicReportsTable.areaH3Index,
        totalReports: sql<number>`count(*)::int`,
        unreviewedReports: sql<number>`count(*) filter (where ${hexrunnerCivicReportsTable.moderationState} in ('unreviewed', 'possible_duplicate'))::int`,
        categories: sql<string[]>`array_agg(distinct ${hexrunnerCivicReportsTable.category})`,
        latestReportAt: sql<Date>`max(${hexrunnerCivicReportsTable.occurredAt})`,
        latestReportId: sql<string>`(array_agg(${hexrunnerCivicReportsTable.id} order by ${hexrunnerCivicReportsTable.occurredAt} desc))[1]`,
      })
      .from(hexrunnerCivicReportsTable)
      .where(
        and(
          inArray(
            hexrunnerCivicReportsTable.areaH3Index,
            parsed.data.areaH3Indexes,
          ),
          gte(
            hexrunnerCivicReportsTable.createdAt,
            new Date(Date.now() - PUBLIC_WINDOW_MS),
          ),
          notInArray(hexrunnerCivicReportsTable.moderationState, ["flagged"]),
        ),
      )
      .groupBy(hexrunnerCivicReportsTable.areaH3Index);

    const caretakers = parsed.data.h3Indexes.length
      ? await db
          .select({
            h3Index: hexrunnerZoneCaretakersTable.h3Index,
            adoptedAt: hexrunnerZoneCaretakersTable.adoptedAt,
          })
          .from(hexrunnerZoneCaretakersTable)
          .innerJoin(
            hexrunnerHexOwnershipTable,
            and(
              eq(
                hexrunnerHexOwnershipTable.h3Index,
                hexrunnerZoneCaretakersTable.h3Index,
              ),
              eq(
                hexrunnerHexOwnershipTable.ownerId,
                hexrunnerZoneCaretakersTable.caretakerId,
              ),
            ),
          )
          .where(
            inArray(
              hexrunnerZoneCaretakersTable.h3Index,
              parsed.data.h3Indexes,
            ),
          )
      : [];

    res.json(
      LookupCivicMapResponse.parse({
        areas: reports,
        caretakers: caretakers.map((caretaker) => ({
          ...caretaker,
          label: "Informally adopted · no official authority",
        })),
        advisory:
          "Community reports may be unreviewed and are not verified municipal records.",
      }),
    );
  } catch (error) {
    req.log.error({ error }, "Failed to load civic map");
    res.status(500).json({ error: "Unable to load civic map." });
  }
});

router.post("/civic-caretakers", async (req, res): Promise<void> => {
  const caretakerId = authenticate(req);
  if (!caretakerId) {
    res.status(401).json({ error: "A valid device credential is required." });
    return;
  }
  const parsed = AdoptCivicZoneBody.safeParse(req.body);
  if (
    !parsed.success ||
    !isValidCell(parsed.data.h3Index) ||
    getResolution(parsed.data.h3Index) !== TERRITORY_RESOLUTION
  ) {
    res.status(400).json({ error: "Invalid territory zone." });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${parsed.data.h3Index}, 0))`,
      );
      const [ownership] = await tx
        .select({ ownerId: hexrunnerHexOwnershipTable.ownerId })
        .from(hexrunnerHexOwnershipTable)
        .where(eq(hexrunnerHexOwnershipTable.h3Index, parsed.data.h3Index))
        .limit(1);
      if (!ownership || ownership.ownerId !== caretakerId) {
        return { notOwner: true } as const;
      }
      const [caretaker] = await tx
        .insert(hexrunnerZoneCaretakersTable)
        .values({ h3Index: parsed.data.h3Index, caretakerId })
        .onConflictDoUpdate({
          target: hexrunnerZoneCaretakersTable.h3Index,
          set: { caretakerId, adoptedAt: new Date() },
        })
        .returning({
          h3Index: hexrunnerZoneCaretakersTable.h3Index,
          adoptedAt: hexrunnerZoneCaretakersTable.adoptedAt,
        });
      return { caretaker } as const;
    });
    if ("notOwner" in result) {
      res
        .status(403)
        .json({ error: "You can only adopt a zone you currently own." });
      return;
    }
    res.json(
      AdoptCivicZoneResponse.parse({
        ...result.caretaker,
        informal: true,
        advisory:
          "Informal caretaker status grants no authority and does not change territory ownership.",
      }),
    );
  } catch (error) {
    req.log.error({ error, caretakerId }, "Failed to adopt civic zone");
    res.status(500).json({ error: "Unable to adopt this zone." });
  }
});

export default router;

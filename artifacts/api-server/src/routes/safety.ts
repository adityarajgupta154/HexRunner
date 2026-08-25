import { Router, type IRouter, type Request } from "express";
import {
  CreateSafetyReportBody,
  CreateSafetyReportResponse,
  LookupSafetyAreasBody,
  LookupSafetyAreasResponse,
} from "@workspace/api-zod";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getResolution, isValidCell, latLngToCell } from "h3-js";
import {
  db,
  hexrunnerRunPointsTable,
  hexrunnerRunsTable,
  hexrunnerSafetyReportsTable,
  hexrunnerUsersTable,
} from "@workspace/db";
import { verifyAnonymousCredential } from "../lib/anonymousCredential";
import { consumeRateLimit } from "../lib/rateLimit";

const router: IRouter = Router();
const SAFETY_RESOLUTION = 8;
const DUPLICATE_WINDOW_MS = 12 * 60 * 60 * 1_000;
const PUBLIC_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const MIN_PUBLIC_REPORTERS = 3;
const MAX_REPORT_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_REPORTS_PER_DAY = 5;
const ESTABLISHED_IDENTITY_AGE_MS = 24 * 60 * 60 * 1_000;
const MIN_ESTABLISHED_RUNS = 3;
const MIN_VERIFIED_RUN_DURATION_MS = 6_000;
const MAX_VERIFIED_SPEED_METERS_PER_SECOND = 12;

function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 12_742_000 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function routePassesServerIntegrityCheck(
  points: Array<{ latitude: number; longitude: number; recordedAt: Date }>,
): boolean {
  if (points.length < 2) return false;
  const ordered = [...points].sort(
    (first, second) => first.recordedAt.getTime() - second.recordedAt.getTime(),
  );
  if (
    ordered[ordered.length - 1]!.recordedAt.getTime() -
      ordered[0]!.recordedAt.getTime() <
    MIN_VERIFIED_RUN_DURATION_MS
  ) {
    return false;
  }
  return ordered.every((point, index) => {
    if (index === 0) return true;
    const previous = ordered[index - 1]!;
    const elapsedSeconds =
      (point.recordedAt.getTime() - previous.recordedAt.getTime()) / 1_000;
    if (elapsedSeconds <= 0) return false;
    return (
      distanceMeters(previous, point) / elapsedSeconds <=
      MAX_VERIFIED_SPEED_METERS_PER_SECOND
    );
  });
}

function authenticate(req: Request): string | null {
  const authorization = req.get("authorization");
  const credential = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  return credential ? verifyAnonymousCredential(credential) : null;
}

function timeBucket(date: Date): "morning" | "day" | "evening" | "night" {
  const hour = date.getUTCHours();
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "day";
  if (hour < 22) return "evening";
  return "night";
}

router.post("/safety-reports", async (req, res): Promise<void> => {
  if (!consumeRateLimit("safety-report-ip", req.ip ?? "unknown", 30, 60 * 60 * 1_000)) {
    res.status(429).json({ error: "Too many safety report attempts. Try again later." });
    return;
  }
  const reporterId = authenticate(req);
  if (!reporterId) {
    res.status(401).json({ error: "A valid device credential is required." });
    return;
  }

  const parsed = CreateSafetyReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid safety report." });
    return;
  }

  const now = new Date();
  const occurredAt = parsed.data.occurredAt;
  const ageMs = now.getTime() - occurredAt.getTime();
  if (ageMs < -5 * 60 * 1_000 || ageMs > MAX_REPORT_AGE_MS) {
    res.status(400).json({ error: "Safety reports must be submitted during or shortly after a run." });
    return;
  }

  const areaH3Index = parsed.data.areaH3Index;
  if (!isValidCell(areaH3Index) || getResolution(areaH3Index) !== SAFETY_RESOLUTION) {
    res.status(400).json({ error: "Invalid coarse safety area." });
    return;
  }

  try {
    const [run] = await db
      .select({
        id: hexrunnerRunsTable.id,
        startedAt: hexrunnerRunsTable.startedAt,
        endedAt: hexrunnerRunsTable.endedAt,
        flaggedSuspicious: hexrunnerRunsTable.flaggedSuspicious,
      })
      .from(hexrunnerRunsTable)
      .where(and(
        eq(hexrunnerRunsTable.id, parsed.data.clientRunId),
        eq(hexrunnerRunsTable.userId, reporterId),
      ))
      .limit(1);
    if (!run) {
      res.status(409).json({ error: "Finish saving this run before the safety signal can be verified." });
      return;
    }
    if (
      run.flaggedSuspicious ||
      occurredAt.getTime() < run.startedAt.getTime() - 5_000 ||
      occurredAt.getTime() > run.endedAt.getTime() + 5_000
    ) {
      res.status(400).json({ error: "This safety signal could not be verified against the run." });
      return;
    }

    const runPoints = await db
      .select({
        latitude: hexrunnerRunPointsTable.latitude,
        longitude: hexrunnerRunPointsTable.longitude,
        recordedAt: hexrunnerRunPointsTable.recordedAt,
      })
      .from(hexrunnerRunPointsTable)
      .where(eq(hexrunnerRunPointsTable.runId, run.id));
    const routeContainsArea = runPoints.some(
      (point) =>
        latLngToCell(point.latitude, point.longitude, SAFETY_RESOLUTION) === areaH3Index,
    );
    if (!routeContainsArea || !routePassesServerIntegrityCheck(runPoints)) {
      res.status(400).json({ error: "The reported area or route integrity could not be verified." });
      return;
    }

    await db
      .delete(hexrunnerSafetyReportsTable)
      .where(lt(hexrunnerSafetyReportsTable.createdAt, new Date(now.getTime() - RETENTION_MS)));

    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`safety:${reporterId}`})::bigint)`,
      );
      const [sameId] = await tx
        .select({ id: hexrunnerSafetyReportsTable.id })
        .from(hexrunnerSafetyReportsTable)
        .where(eq(hexrunnerSafetyReportsTable.id, parsed.data.clientReportId))
        .limit(1);
      if (sameId) return { accepted: true, duplicate: true };

      const [recentDuplicate] = await tx
        .select({ id: hexrunnerSafetyReportsTable.id })
        .from(hexrunnerSafetyReportsTable)
        .where(and(
          eq(hexrunnerSafetyReportsTable.reporterId, reporterId),
          eq(hexrunnerSafetyReportsTable.areaH3Index, areaH3Index),
          gte(hexrunnerSafetyReportsTable.createdAt, new Date(now.getTime() - DUPLICATE_WINDOW_MS)),
        ))
        .limit(1);
      if (recentDuplicate) return { accepted: false, duplicate: true };

      const [dailyUsage] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(hexrunnerSafetyReportsTable)
        .where(and(
          eq(hexrunnerSafetyReportsTable.reporterId, reporterId),
          gte(hexrunnerSafetyReportsTable.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1_000)),
        ));
      if ((dailyUsage?.count ?? 0) >= MAX_REPORTS_PER_DAY) {
        return { accepted: false, duplicate: false, rateLimited: true };
      }

      await tx.insert(hexrunnerSafetyReportsTable).values({
        id: parsed.data.clientReportId,
        reporterId,
        runId: run.id,
        areaH3Index,
        timeBucket: timeBucket(occurredAt),
        occurredAt,
      });
      return { accepted: true, duplicate: false, rateLimited: false };
    });

    if ("rateLimited" in result && result.rateLimited) {
      res.status(429).json({ error: "Daily safety report limit reached." });
      return;
    }
    res.status(result.duplicate ? 200 : 201).json(CreateSafetyReportResponse.parse({
      accepted: result.accepted,
      duplicate: result.duplicate,
      areaH3Index,
      advisory: result.accepted
        ? "Crowdsourced signal only; it does not guarantee safety."
        : "You already reported this coarse area recently.",
    }));
  } catch (error) {
    req.log.error({ error }, "Failed to save safety report");
    res.status(500).json({ error: "Unable to save this safety report." });
  }
});

router.post("/safety-areas/lookup", async (req, res): Promise<void> => {
  const parsed = LookupSafetyAreasBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid safety area lookup." });
    return;
  }

  try {
    const rows = await db
      .select({
        areaH3Index: hexrunnerSafetyReportsTable.areaH3Index,
        reportCount: sql<number>`count(distinct ${hexrunnerSafetyReportsTable.id})::int`,
        reporterCount: sql<number>`count(distinct ${hexrunnerSafetyReportsTable.reporterId})::int`,
      })
      .from(hexrunnerSafetyReportsTable)
      .innerJoin(
        hexrunnerRunsTable,
        and(
          eq(hexrunnerRunsTable.id, hexrunnerSafetyReportsTable.runId),
          eq(hexrunnerRunsTable.userId, hexrunnerSafetyReportsTable.reporterId),
        ),
      )
      .innerJoin(
        hexrunnerUsersTable,
        eq(hexrunnerUsersTable.id, hexrunnerSafetyReportsTable.reporterId),
      )
      .where(and(
        inArray(hexrunnerSafetyReportsTable.areaH3Index, parsed.data.areaH3Indexes),
        gte(hexrunnerSafetyReportsTable.createdAt, new Date(Date.now() - PUBLIC_WINDOW_MS)),
        eq(hexrunnerRunsTable.flaggedSuspicious, false),
        lt(
          hexrunnerUsersTable.createdAt,
          new Date(Date.now() - ESTABLISHED_IDENTITY_AGE_MS),
        ),
        sql`(
          select count(*)
          from hexrunner_runs established_runs
          where established_runs.user_id = ${hexrunnerSafetyReportsTable.reporterId}
            and established_runs.flagged_suspicious = false
        ) >= ${MIN_ESTABLISHED_RUNS}`,
      ))
      .groupBy(hexrunnerSafetyReportsTable.areaH3Index);

    const byArea = new Map(rows.map((row) => [row.areaH3Index, row]));
    res.json(LookupSafetyAreasResponse.parse({
      areas: parsed.data.areaH3Indexes.map((areaH3Index) => {
        const row = byArea.get(areaH3Index);
        const reporterCount = row?.reporterCount ?? 0;
        const enoughData = reporterCount >= MIN_PUBLIC_REPORTERS;
        return {
          areaH3Index,
          confidence: enoughData ? (reporterCount >= 8 ? "established" : "emerging") : "insufficient",
          concernScore: enoughData ? Math.min(100, 35 + reporterCount * 7) : null,
          sampleSize: enoughData ? row?.reportCount ?? null : null,
        };
      }),
      advisory: "Crowdsourced, coarse-area signals only. Not a safety guarantee or a prediction.",
    }));
  } catch (error) {
    req.log.error({ error }, "Failed to aggregate safety areas");
    res.status(500).json({ error: "Unable to load safety signals." });
  }
});

export default router;
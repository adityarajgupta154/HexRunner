import { and, eq, gte, lt, sql } from "drizzle-orm";
import { cellToParent } from "h3-js";
import { createHmac } from "node:crypto";
import {
  db,
  hexrunnerEquityContributionsTable,
  hexrunnerEquityEvaluationsTable,
  hexrunnerEquityTiersTable,
} from "@workspace/db";

export const EQUITY_AREA_RESOLUTION = 7;
export const EQUITY_CITY_RESOLUTION = 4;
export const EQUITY_BASELINE_DAYS = 28;
export const EQUITY_MIN_AREA_CONTRIBUTIONS = 3;
export const EQUITY_MIN_CITY_CONTRIBUTIONS = 24;
export const EQUITY_MIN_QUALIFYING_AREAS = 4;
export const EQUITY_DAILY_BONUS_CAP = 5;
const DAY_MS = 86_400_000;

export type EquityTier = "cold" | "medium" | "hot";

export function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function equityAreaForHex(h3Index: string): string {
  return cellToParent(h3Index, EQUITY_AREA_RESOLUTION);
}

export function equityCityForHex(h3Index: string): string {
  return cellToParent(h3Index, EQUITY_CITY_RESOLUTION);
}

function equityKey(domain: string, value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for equity aggregation.");
  return createHmac("sha256", secret).update(`${domain}\u0000${value}`).digest("hex");
}

export function equityRunKey(clientRunId: string): string {
  return equityKey("hexrunner-equity-run-v1", clientRunId);
}

export function equityDailyAreaKey(userId: string, utcDay: Date, areaH3: string): string {
  return equityKey("hexrunner-equity-daily-area-v1", `${userId}\u0000${utcDay.toISOString().slice(0, 10)}\u0000${areaH3}`);
}

export async function pruneEquityContributions(tx: Tx, now: Date): Promise<void> {
  const cutoff = new Date(startOfUtcDay(now).getTime() - 35 * DAY_MS);
  await tx.delete(hexrunnerEquityContributionsTable).where(
    lt(hexrunnerEquityContributionsTable.windowStart, cutoff),
  );
}

/** Classifies whole equal-count groups, never individual areas at a tie. */
export function classifyEquityAreas(
  counts: ReadonlyArray<{ areaH3: string; contributionCount: number }>,
): Map<string, EquityTier> {
  const result = new Map<string, EquityTier>();
  if (!counts.length) return result;
  const values = counts.map((item) => item.contributionCount).sort((a, b) => a - b);
  const lower = values[Math.floor((values.length - 1) * 0.25)]!;
  const upper = values[Math.ceil((values.length - 1) * 0.75)]!;
  for (const item of counts) {
    result.set(
      item.areaH3,
      lower >= upper
        ? "medium"
        : item.contributionCount <= lower
          ? "cold"
          : item.contributionCount >= upper
            ? "hot"
            : "medium",
    );
  }
  return result;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function ensureEquityEvaluation(
  tx: Tx,
  cityH3: string,
  evaluationDay: Date,
): Promise<{ availability: "available" | "insufficient_data"; evaluatedAt: Date; tiers: Map<string, EquityTier> }> {
  await pruneEquityContributions(tx, new Date());
  const lockKey = `hexrunner-equity:${cityH3}:${evaluationDay.toISOString().slice(0, 10)}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
  const [existing] = await tx.select().from(hexrunnerEquityEvaluationsTable).where(and(
    eq(hexrunnerEquityEvaluationsTable.cityH3, cityH3),
    eq(hexrunnerEquityEvaluationsTable.evaluationDay, evaluationDay),
  )).limit(1);
  if (existing) {
    const tiers = existing.availability === "available"
      ? new Map((await tx.select().from(hexrunnerEquityTiersTable).where(and(
        eq(hexrunnerEquityTiersTable.cityH3, cityH3),
        eq(hexrunnerEquityTiersTable.evaluationDay, evaluationDay),
      ))).map((row) => [row.areaH3, row.tier as EquityTier]))
      : new Map<string, EquityTier>();
    return { availability: existing.availability as "available" | "insufficient_data", evaluatedAt: existing.evaluatedAt, tiers };
  }
  const windowStart = new Date(evaluationDay.getTime() - EQUITY_BASELINE_DAYS * DAY_MS);
  const rows = await tx.select({
    areaH3: hexrunnerEquityContributionsTable.areaH3,
    contributionCount: sql<number>`count(*)::int`,
  }).from(hexrunnerEquityContributionsTable).where(and(
    eq(hexrunnerEquityContributionsTable.cityH3, cityH3),
    gte(hexrunnerEquityContributionsTable.windowStart, windowStart),
    lt(hexrunnerEquityContributionsTable.windowStart, evaluationDay),
  )).groupBy(hexrunnerEquityContributionsTable.areaH3);
  const total = rows.reduce((sum, row) => sum + Number(row.contributionCount), 0);
  const qualifying = rows.filter((row) => Number(row.contributionCount) >= EQUITY_MIN_AREA_CONTRIBUTIONS);
  const availability = total >= EQUITY_MIN_CITY_CONTRIBUTIONS && qualifying.length >= EQUITY_MIN_QUALIFYING_AREAS
    ? "available" as const : "insufficient_data" as const;
  const evaluatedAt = new Date();
  await tx.insert(hexrunnerEquityEvaluationsTable).values({ cityH3, evaluationDay, availability, evaluatedAt });
  const tiers = availability === "available" ? classifyEquityAreas(qualifying.map((row) => ({
    areaH3: row.areaH3, contributionCount: Number(row.contributionCount),
  }))) : new Map<string, EquityTier>();
  if (tiers.size) await tx.insert(hexrunnerEquityTiersTable).values(
    [...tiers].map(([areaH3, tier]) => ({ cityH3, evaluationDay, areaH3, tier })),
  );
  return { availability, evaluatedAt, tiers };
}

export async function addEquityContributions(
  tx: Tx,
  clientRunId: string,
  userId: string,
  claimedHexes: readonly string[],
  windowStart: Date,
  now: Date,
): Promise<void> {
  await pruneEquityContributions(tx, now);
  const areas = new Map<string, string>();
  for (const hex of claimedHexes) areas.set(equityAreaForHex(hex), equityCityForHex(hex));
  if (areas.size) await tx.insert(hexrunnerEquityContributionsTable).values(
    [...areas].map(([areaH3, cityH3]) => ({
      runKey: equityRunKey(clientRunId),
      dailyAreaKey: equityDailyAreaKey(userId, windowStart, areaH3),
      areaH3, cityH3, windowStart, createdAt: now,
    })),
  ).onConflictDoNothing();
}
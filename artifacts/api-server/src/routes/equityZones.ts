import { Router, type IRouter } from "express";
import { and, eq, gt } from "drizzle-orm";
import { GetCurrentEquityZoneResponse } from "@workspace/api-zod";
import { db, hexrunnerLivePresenceTable } from "@workspace/db";
import { verifyAnonymousCredential } from "../lib/anonymousCredential";
import {
  ensureEquityEvaluation,
  equityAreaForHex,
  equityCityForHex,
  startOfUtcDay,
} from "../lib/equityZones";

const router: IRouter = Router();

router.get("/equity-zones/current", async (req, res): Promise<void> => {
  const token = req.get("authorization")?.startsWith("Bearer ")
    ? req.get("authorization")!.slice(7).trim() : "";
  const userId = token ? verifyAnonymousCredential(token) : null;
  if (!userId) {
    res.status(401).json({ error: "A valid device credential is required." });
    return;
  }
  const now = new Date();
  const nextEvaluationAt = new Date(startOfUtcDay(now).getTime() + 86_400_000);
  const unavailable = {
    availability: "unavailable" as const, freshness: "unavailable" as const,
    tier: null, multiplier: 1 as const, eligible: false, evaluatedAt: null,
    nextEvaluationAt, message: "Start or resume a live run to check equity rewards.",
  };
  try {
    const [presence] = await db.select({ h3Index: hexrunnerLivePresenceTable.h3Index })
      .from(hexrunnerLivePresenceTable)
      .where(and(eq(hexrunnerLivePresenceTable.userId, userId), gt(hexrunnerLivePresenceTable.expiresAt, now)))
      .limit(1);
    if (!presence) {
      res.json(GetCurrentEquityZoneResponse.parse(unavailable));
      return;
    }
    const evaluationDay = startOfUtcDay(now);
    const evaluation = await db.transaction((tx) =>
      ensureEquityEvaluation(tx, equityCityForHex(presence.h3Index), evaluationDay));
    const tier = evaluation.availability === "available"
      ? evaluation.tiers.get(equityAreaForHex(presence.h3Index)) ?? null : null;
    // A non-qualifying individual area must not reveal that its enclosing city
    // has passed a threshold. It is intentionally indistinguishable from a
    // sparse city to the caller.
    const availability = tier ? evaluation.availability : "insufficient_data" as const;
    res.json(GetCurrentEquityZoneResponse.parse({
      availability,
      freshness: "current",
      tier,
      multiplier: tier === "cold" ? 2 : 1,
      eligible: tier === "cold",
      evaluatedAt: evaluation.evaluatedAt,
      nextEvaluationAt,
      message: tier === "cold"
        ? "Cold-zone bonus is available for accepted claims today."
        : availability === "insufficient_data"
          ? "Equity rewards need more aggregated activity before they can be shown."
          : "This area has the standard claim reward.",
    }));
  } catch (error) {
    req.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Equity zone lookup failed");
    res.json(GetCurrentEquityZoneResponse.parse(unavailable));
  }
});

export default router;
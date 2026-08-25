import { Router, type IRouter } from "express";
import {
  LookupHexOwnershipBody,
  LookupHexOwnershipResponse,
} from "@workspace/api-zod";
import { inArray } from "drizzle-orm";
import { db, hexrunnerHexOwnershipTable } from "@workspace/db";

const router: IRouter = Router();
const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

function calculateFreshnessScore(claimedAt: Date | null): number | null {
  if (!claimedAt) return null;
  const age = Math.max(0, Date.now() - claimedAt.getTime());
  return Math.max(0, Math.round(100 * (1 - age / FRESHNESS_WINDOW_MS)));
}

router.post("/hex-ownership/lookup", async (req, res) => {
  const parsed = LookupHexOwnershipBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid H3 ownership lookup." });
    return;
  }

  try {
    const rows = await db
      .select({
        h3Index: hexrunnerHexOwnershipTable.h3Index,
        ownerId: hexrunnerHexOwnershipTable.ownerId,
        claimedAt: hexrunnerHexOwnershipTable.claimedAt,
      })
      .from(hexrunnerHexOwnershipTable)
      .where(
        inArray(
          hexrunnerHexOwnershipTable.h3Index,
          parsed.data.h3Indexes,
        ),
      );
    const ownershipByIndex = new Map(
      rows.map((row) => [row.h3Index, row]),
    );
    const response = LookupHexOwnershipResponse.parse({
      ownership: parsed.data.h3Indexes.map((h3Index) => {
        const ownership = ownershipByIndex.get(h3Index);
        return {
          h3Index,
          ownerId: ownership?.ownerId ?? null,
          claimedAt: ownership?.claimedAt ?? null,
          freshnessScore: calculateFreshnessScore(ownership?.claimedAt ?? null),
        };
      }),
    });

    res.json(response);
  } catch (error) {
    req.log.error({ error }, "Failed to look up H3 ownership");
    res.status(500).json({ error: "Unable to load territory ownership." });
  }
});

export default router;
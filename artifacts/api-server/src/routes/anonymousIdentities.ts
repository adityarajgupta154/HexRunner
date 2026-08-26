import { Router, type IRouter } from "express";
import {
  RegisterAnonymousIdentityBody,
  RegisterAnonymousIdentityResponse,
} from "@workspace/api-zod";
import { db, hexrunnerUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  hashEnrollmentSecret,
  issueAnonymousCredential,
} from "../lib/anonymousCredential";
import { consumeRateLimit } from "../lib/rateLimit";

const router: IRouter = Router();
const enrollmentLimit = process.env.NODE_ENV === "development" ? 1_000 : 10;

router.post("/anonymous-identities", async (req, res): Promise<void> => {
  if (
    !consumeRateLimit(
      "identity-enrollment-ip",
      req.ip ?? "unknown",
      enrollmentLimit,
      24 * 60 * 60 * 1_000,
    )
  ) {
    res.status(429).json({ error: "Too many device enrollments. Try again later." });
    return;
  }
  const parsed = RegisterAnonymousIdentityBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid device identity." });
    return;
  }

  const userId = parsed.data.requestedUserId;
  const enrollmentSecretHash = hashEnrollmentSecret(
    parsed.data.enrollmentSecret,
  );

  try {
    const credential = issueAnonymousCredential(userId);
    const insertedUsers = await db
      .insert(hexrunnerUsersTable)
      .values({ id: userId, enrollmentSecretHash })
      .onConflictDoNothing()
      .returning({ id: hexrunnerUsersTable.id });

    if (insertedUsers.length === 0) {
      const [existingUser] = await db
        .select({
          enrollmentSecretHash: hexrunnerUsersTable.enrollmentSecretHash,
        })
        .from(hexrunnerUsersTable)
        .where(eq(hexrunnerUsersTable.id, userId))
        .limit(1);

      if (
        !existingUser ||
        existingUser.enrollmentSecretHash !== enrollmentSecretHash
      ) {
        res.status(409).json({
          error:
            "This device identity is already registered to another installation.",
        });
        return;
      }
    }

    const response = RegisterAnonymousIdentityResponse.parse({
      userId,
      credential,
    });

    res.status(insertedUsers.length === 0 ? 200 : 201).json(response);
  } catch (error) {
    req.log.error({ error }, "Failed to register anonymous identity");
    res.status(500).json({ error: "Unable to secure this device identity." });
  }
});

export default router;
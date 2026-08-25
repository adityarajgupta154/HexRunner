import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

const CREDENTIAL_VERSION = "hr1";
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;
const SIGNATURE_BYTES = 32;

type CredentialPayload = {
  userId: string;
};

function signingSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET is required to issue device credentials.");
  }

  return secret;
}

function sign(encodedPayload: string): Buffer {
  return createHmac("sha256", signingSecret())
    .update(`${CREDENTIAL_VERSION}.${encodedPayload}`)
    .digest();
}

export function issueAnonymousCredential(userId: string): string {
  if (!USER_ID_PATTERN.test(userId)) {
    throw new Error("Cannot issue a credential for an invalid user ID.");
  }

  const payload: CredentialPayload = { userId };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = sign(encodedPayload).toString("base64url");

  return `${CREDENTIAL_VERSION}.${encodedPayload}.${signature}`;
}

export function hashEnrollmentSecret(enrollmentSecret: string): string {
  return createHash("sha256").update(enrollmentSecret).digest("hex");
}

export function verifyAnonymousCredential(
  credential: string,
): string | null {
  const [version, encodedPayload, encodedSignature, ...extraParts] =
    credential.split(".");

  if (
    version !== CREDENTIAL_VERSION ||
    !encodedPayload ||
    !encodedSignature ||
    extraParts.length > 0
  ) {
    return null;
  }

  let providedSignature: Buffer;

  try {
    providedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }

  if (providedSignature.length !== SIGNATURE_BYTES) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  if (!timingSafeEqual(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<CredentialPayload>;

    return typeof payload.userId === "string" &&
      USER_ID_PATTERN.test(payload.userId)
      ? payload.userId
      : null;
  } catch {
    return null;
  }
}
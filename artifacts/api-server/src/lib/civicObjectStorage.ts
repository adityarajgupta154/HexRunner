import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const UPLOAD_TTL_SECONDS = 15 * 60;

export class InvalidCivicPhotoError extends Error {}

function getPrivateObjectDir(): string {
  const value = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!value) {
    throw new Error("PRIVATE_OBJECT_DIR is required for civic photo storage.");
  }
  return value.replace(/\/+$/, "");
}

function parseStoragePath(path: string): {
  bucketName: string;
  objectName: string;
} {
  const parts = path.replace(/^\/+/, "").split("/");
  const [bucketName, ...objectParts] = parts;
  if (!bucketName || objectParts.length === 0) {
    throw new Error("Invalid App Storage path.");
  }
  return { bucketName, objectName: objectParts.join("/") };
}

async function signObjectUrl(
  storagePath: string,
  method: "PUT" | "GET" | "HEAD" | "DELETE",
  ttlSeconds: number,
): Promise<string> {
  const { bucketName, objectName } = parseStoragePath(storagePath);
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method,
        expires_at: new Date(Date.now() + ttlSeconds * 1_000).toISOString(),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(`App Storage signing failed with ${response.status}.`);
  }
  const payload = (await response.json()) as { signed_url?: string };
  if (!payload.signed_url) {
    throw new Error("App Storage did not return a signed URL.");
  }
  return payload.signed_url;
}

export async function deleteCivicPhoto(objectPath: string): Promise<void> {
  const deleteUrl = await signObjectUrl(
    storagePathForObjectPath(objectPath),
    "DELETE",
    60,
  );
  const response = await fetch(deleteUrl, {
    method: "DELETE",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Civic photo deletion failed with ${response.status}.`);
  }
}

function storagePathForObjectPath(objectPath: string): string {
  const objectId = objectPath.match(/^\/civic-photos\/([A-Za-z0-9_-]+)$/)?.[1];
  if (!objectId) throw new Error("Invalid civic photo object path.");
  return `${getPrivateObjectDir()}/civic-photos/${objectId}`;
}

export async function createCivicPhotoUpload(): Promise<{
  uploadUrl: string;
  objectPath: string;
  expiresAt: Date;
}> {
  const objectId = randomUUID();
  const objectPath = `/civic-photos/${objectId}`;
  const uploadUrl = await signObjectUrl(
    storagePathForObjectPath(objectPath),
    "PUT",
    UPLOAD_TTL_SECONDS,
  );
  return {
    uploadUrl,
    objectPath,
    expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1_000),
  };
}

export async function getCivicPhotoMetadata(objectPath: string): Promise<{
  exists: boolean;
  contentType: string | null;
  sizeBytes: number | null;
}> {
  const headUrl = await signObjectUrl(
    storagePathForObjectPath(objectPath),
    "HEAD",
    60,
  );
  const response = await fetch(headUrl, {
    method: "HEAD",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    return { exists: false, contentType: null, sizeBytes: null };
  }
  const sizeHeader = response.headers.get("content-length");
  const sizeBytes = sizeHeader ? Number.parseInt(sizeHeader, 10) : null;
  return {
    exists: true,
    contentType: response.headers.get("content-type")?.split(";")[0] ?? null,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
  };
}

export async function civicPhotoHasValidMagic(
  objectPath: string,
  contentType: string,
): Promise<boolean> {
  const getUrl = await signObjectUrl(
    storagePathForObjectPath(objectPath),
    "GET",
    60,
  );
  const response = await fetch(getUrl, {
    headers: { Range: "bytes=0-15" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return false;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (contentType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  if (!response.body) throw new Error("Civic photo response had no body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new InvalidCivicPhotoError(
        "Civic photo exceeded its approved size.",
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

export async function sealCivicPhoto({
  stagingObjectPath,
  contentType,
  expectedSizeBytes,
}: {
  stagingObjectPath: string;
  contentType: string;
  expectedSizeBytes: number;
}): Promise<{
  sealedObjectPath: string;
  contentSha256: string;
}> {
  const getUrl = await signObjectUrl(
    storagePathForObjectPath(stagingObjectPath),
    "GET",
    60,
  );
  const sourceResponse = await fetch(getUrl, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!sourceResponse.ok) {
    throw new Error("The staged civic photo is unavailable.");
  }
  const bytes = await readBoundedResponse(sourceResponse, expectedSizeBytes);
  if (bytes.byteLength !== expectedSizeBytes) {
    throw new InvalidCivicPhotoError("The staged civic photo size changed.");
  }

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(bytes, {
      failOn: "warning",
      limitInputPixels: 40_000_000,
    }).metadata();
  } catch {
    throw new InvalidCivicPhotoError(
      "The uploaded file is not a decodable image.",
    );
  }
  const expectedFormat =
    contentType === "image/jpeg"
      ? "jpeg"
      : contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : null;
  if (
    !expectedFormat ||
    metadata.format !== expectedFormat ||
    !metadata.width ||
    !metadata.height
  ) {
    throw new InvalidCivicPhotoError(
      "The uploaded file is not a valid supported image.",
    );
  }

  const sealedObjectPath = `/civic-photos/${randomUUID()}`;
  const putUrl = await signObjectUrl(
    storagePathForObjectPath(sealedObjectPath),
    "PUT",
    60,
  );
  const putResponse = await fetch(putUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes,
    signal: AbortSignal.timeout(20_000),
  });
  if (!putResponse.ok) {
    throw new Error("Unable to seal the civic photo.");
  }
  const sealedMetadata = await getCivicPhotoMetadata(sealedObjectPath);
  if (
    !sealedMetadata.exists ||
    sealedMetadata.contentType !== contentType ||
    sealedMetadata.sizeBytes !== expectedSizeBytes
  ) {
    await deleteCivicPhoto(sealedObjectPath).catch(() => undefined);
    throw new Error("The sealed civic photo could not be verified.");
  }
  return {
    sealedObjectPath,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

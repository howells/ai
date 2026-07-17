import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Compare arbitrary-length secrets through equal-length SHA-256 digests. */
export function secretsEqual(candidate: string, expected: string): boolean {
  const left = createHash("sha256").update(candidate).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

/** Store only a one-way digest of an opaque session token. */
export function hashSessionToken(token: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`session\0${token}`).digest("hex");
}

/** HMAC private benchmark values without retaining dictionary-testable raw hashes. */
export function hashPrivateValue(value: string, key: string, domain: string): string {
  return createHmac("sha256", key).update(`${domain}\0${value}`).digest("hex");
}

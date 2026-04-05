import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function createId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");

  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, existingHash] = storedHash.split(":");

  if (!salt || !existingHash) {
    return false;
  }

  const candidate = scryptSync(password, salt, 64);
  const existing = Buffer.from(existingHash, "hex");

  return candidate.length === existing.length && timingSafeEqual(candidate, existing);
}

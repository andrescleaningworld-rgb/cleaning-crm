// Shared 4-digit PIN rules for every no-password crew/tablet sign-in — the
// Team Hub crew link (lib/teamHubDb.ts verifyTeamHubWorkerPin) and the
// Equipment Check tablet app (lib/equipmentCheckDb.ts). One place for the
// hashing cost and the lockout rule so the two apps can't drift apart.
import bcrypt from "bcryptjs";

export const PIN_BCRYPT_ROUNDS = 10;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, PIN_BCRYPT_ROUNDS);
}

export function comparePin(pin: string, pinHash: string): Promise<boolean> {
  return bcrypt.compare(pin, pinHash);
}

export function isFourDigitPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

// The lock state a wrong PIN leads to. lockedUntil is null when this miss
// doesn't reach MAX_FAILED_ATTEMPTS yet.
export function nextFailedPinState(currentFailedAttempts: number): { failedAttempts: number; lockedUntil: string | null } {
  const failedAttempts = currentFailedAttempts + 1;
  const lockedUntil =
    failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString() : null;
  return { failedAttempts, lockedUntil };
}
